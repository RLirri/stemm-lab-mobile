import {
    addDoc,
    collection,
    doc,
    FieldPath,
    runTransaction,
    serverTimestamp,
} from "firebase/firestore";

import {db} from "./firebase";
import {stripUndefinedDeep} from "./firestoreSanitize";
import {uploadVideoToStorage} from "./evidenceService";

import type {ActivityRunDraft} from "../store/activityRunDraftStore";
import type {Activity2RunDraft} from "../store/activity2RunDraftStore";
import type {Activity3RunDraft} from "../store/activity3RunDraftStore";
import type {Activity4RunDraft} from "../store/activity4RunDraftStore";

/* =========================================================
   Utilities
========================================================= */

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function safeNum(x: unknown): number {
    return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

/* =========================================================
   Activity Key Registry
========================================================= */

export const ACTIVITY_KEYS = {
    PARACHUTE_DROP: "parachute_drop",
    SOUND_HUNTER: "sound_hunter",
    HAND_FAN: "hand_fan",
    EARTHQUAKE: "earthquake_resistant"
} as const;

const DEFAULT_SEASON_ID = "season_2026_s1";

/* =========================================================
   ACTIVITY 1 SCORING (UNCHANGED)
========================================================= */

export function scoreActivity1(run: ActivityRunDraft, bestAttemptIndex: number) {
    const a = run.attempts?.[bestAttemptIndex];

    const tHit = a?.measurements?.tHitSec;
    const inZone = a?.measurements?.inTargetZone;
    const gForce = a?.computed?.gForce;

    // NOTE: This is your current scoring:
    // base = tHit * 100 (higher time => higher score)
    const base = isFiniteNumber(tHit) && tHit > 0 ? tHit * 100 : 0;

    const targetBonus = inZone === true ? 20 : 0;

    let gForcePenalty = 0;
    if (isFiniteNumber(gForce)) {
        if (gForce >= 30) gForcePenalty = 30;
        else if (gForce >= 10) gForcePenalty = 15;
        else if (gForce >= 5) gForcePenalty = 5;
    }

    const score = Math.max(0, Math.round(base + targetBonus - gForcePenalty));
    return {score, base, targetBonus, gForcePenalty};
}

/* =========================================================
   TEAM SCORE UPDATE (ALL-TIME + CURRENT SEASON + PER-ACTIVITY)
========================================================= */

async function updateTeamScoresTransactional(teamId: string, activityKey: string, score: number) {
    const teamRef = doc(db, "teams", teamId);

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(teamRef);
        if (!snap.exists()) throw new Error("Team not found.");

        const data = snap.data() as any;
        const stats = data?.stats ?? {};

        const seasonId: string =
            typeof stats.currentSeasonId === "string" ? stats.currentSeasonId : DEFAULT_SEASON_ID;

        const allTimeTotal = safeNum(stats.totalScore);

        const curTotal = safeNum(stats.currentSeasonTotalScore);
        const curActivity = safeNum(stats?.currentSeasonActivityScores?.[activityKey]);

        const seasonTotal = safeNum(stats?.seasons?.[seasonId]?.totalScore);
        const seasonActivity = safeNum(stats?.seasons?.[seasonId]?.activityScores?.[activityKey]);

        tx.update(
            teamRef,
            // all-time
            "stats.totalScore",
            allTimeTotal + score,

            // current season
            "stats.currentSeasonId",
            seasonId,
            "stats.currentSeasonTotalScore",
            curTotal + score,
            new FieldPath("stats", "currentSeasonActivityScores", activityKey),
            curActivity + score,

            // season history
            new FieldPath("stats", "seasons", seasonId, "totalScore"),
            seasonTotal + score,
            new FieldPath("stats", "seasons", seasonId, "activityScores", activityKey),
            seasonActivity + score,
            new FieldPath("stats", "seasons", seasonId, "lastUpdated"),
            serverTimestamp(),

            // last updated
            "stats.lastUpdated",
            serverTimestamp()
        );
    });
}

/* =========================================================
   SUBMIT ACTIVITY 1 (UNCHANGED)
========================================================= */

export async function submitActivity1({
                                          run,
                                          teamId,
                                          createdBy,
                                          bestAttemptIndex,
                                          reflection,
                                          rating,
                                      }: {
    run: ActivityRunDraft;
    teamId: string;
    createdBy: string;
    bestAttemptIndex: number;
    reflection: string;
    rating: number;
}) {
    if (!teamId) throw new Error("User has no team.");
    if (!createdBy) throw new Error("Missing user.");
    if (bestAttemptIndex < 0 || bestAttemptIndex > 3) throw new Error("Invalid attempt index.");

    const {score, base, targetBonus, gForcePenalty} = scoreActivity1(run, bestAttemptIndex);

    // 1) Upload best attempt video if exists
    const bestAttempt = run.attempts?.[bestAttemptIndex];
    const localVideoUri = bestAttempt?.video?.uri;

    const evidence: Array<{
        type: "video";
        storagePath: string;
        downloadURL: string;
        attemptIndex: number;
        contentType?: string;
    }> = [];

    if (typeof localVideoUri === "string" && localVideoUri.length > 0) {
        // Use underscore keys only for activityKey, so paths and indexes are safe.
        const storagePath = `evidence/${teamId}/${ACTIVITY_KEYS.PARACHUTE_DROP}/${run.runId}/attempt_${bestAttemptIndex}.mp4`;

        const uploaded = await uploadVideoToStorage({
            uri: localVideoUri,
            storagePath,
            contentType: "video/mp4",
        });

        evidence.push({
            type: "video",
            storagePath: uploaded.storagePath,
            downloadURL: uploaded.downloadURL,
            attemptIndex: bestAttemptIndex,
            contentType: uploaded.contentType,
        });
    }

    // 2) Build Firestore submission payload (sanitize!)
    const submissionRef = collection(db, "submissions");

    const payloadRaw = {
        activityId: run.activityId,
        activityKey: ACTIVITY_KEYS.PARACHUTE_DROP,
        algorithmVersion: 1,

        teamId,
        createdBy,
        runId: run.runId,

        bestAttemptIndex,
        reflection: reflection.trim(),
        rating,

        score,
        scoreBreakdown: {base, targetBonus, gForcePenalty},

        // store full details in v1
        session: run.session,
        attempts: run.attempts,

        evidence,

        seasonId: DEFAULT_SEASON_ID,
        status: "submitted" as const,

        createdAt: serverTimestamp(),
    };

    const payload = stripUndefinedDeep(payloadRaw);

    // 3) Write submission
    const newSubmission = await addDoc(submissionRef, payload);

    // 4) Update team leaderboard totals
    await updateTeamScoresTransactional(teamId, ACTIVITY_KEYS.PARACHUTE_DROP, score);

    return {submissionId: newSubmission.id, score};
}

/* =========================================================
   SUBMIT ACTIVITY 2 (UPDATED: VIDEO OPTIONAL)
========================================================= */

export async function submitActivity2({
                                          run,
                                          teamId,
                                          createdBy,
                                          reflection,
                                          rating,
                                      }: {
    run: Activity2RunDraft;
    teamId: string;
    createdBy: string;
    reflection: string;
    rating: number;
}) {
    if (!teamId) throw new Error("User has no team.");
    if (!createdBy) throw new Error("Missing user.");

    // valid measurements (must be at least 3)
    const valid = run.actions.filter(
        (a) => a.isValid === true && isFiniteNumber(a.dbAvg) && isFiniteNumber(a.durationSec)
    );

    if (valid.length < 3) throw new Error("Minimum 3 valid measurements required.");

    // score = average(valid dbAvg), 0.1 precision
    const avg = valid.reduce((sum, a) => sum + (a.dbAvg ?? 0), 0) / valid.length;
    const score = Math.round(avg * 10) / 10;

    // Optional session video evidence upload
    const evidence: Array<{
        type: "video";
        storagePath: string;
        downloadURL: string;
        contentType?: string;
    }> = [];

    const localUri = run.session.sessionVideo?.uri;
    if (typeof localUri === "string" && localUri.length > 0) {
        const storagePath = `evidence/${teamId}/${ACTIVITY_KEYS.SOUND_HUNTER}/${run.runId}/session.mp4`;

        const uploaded = await uploadVideoToStorage({
            uri: localUri,
            storagePath,
            contentType: "video/mp4",
        });

        evidence.push({
            type: "video",
            storagePath: uploaded.storagePath,
            downloadURL: uploaded.downloadURL,
            contentType: uploaded.contentType,
        });
    }

    // Build submission payload
    const submissionRef = collection(db, "submissions");

    const payloadRaw = {
        activityId: run.activityId,
        activityKey: ACTIVITY_KEYS.SOUND_HUNTER,
        algorithmVersion: 1,

        teamId,
        createdBy,
        runId: run.runId,

        reflection: reflection.trim(),
        rating,

        // score fields
        score,
        validCount: valid.length,
        avgDb: score,

        // store session + actions (includes GPS if present)
        session: run.session,
        actions: run.actions,

        evidence, // can be []

        seasonId: DEFAULT_SEASON_ID,
        status: "submitted" as const,
        createdAt: serverTimestamp(),
    };

    const payload = stripUndefinedDeep(payloadRaw);

    const newSubmission = await addDoc(submissionRef, payload);

    // Update team totals
    await updateTeamScoresTransactional(teamId, ACTIVITY_KEYS.SOUND_HUNTER, score);

    return {submissionId: newSubmission.id, score};
}

/* =========================================================
   ACTIVITY 3 SCORING (FR-A3-06: highest average bend angle)
========================================================= */

function isNonEmptyString(x: unknown): x is string {
    return typeof x === "string" && x.trim().length > 0;
}

export function scoreActivity3(run: Activity3RunDraft) {
    const count = run.session.fanDesignCount;

    const perDesign: Array<{ designIndex: number; avg: number; n: number }> = [];

    for (let i = 0; i < count; i++) {
        const rows = run.measurements.filter(
            (m) => m.designIndex === i && isFiniteNumber(m.bendAngleDeg) && (m.bendAngleDeg ?? 0) >= 0
        );
        const n = rows.length;
        const avg = n > 0 ? rows.reduce((s, m) => s + (m.bendAngleDeg ?? 0), 0) / n : 0;
        perDesign.push({designIndex: i, avg, n});
    }

    // Score = highest average bend angle (rounded to 0.1)
    const best = perDesign.reduce(
        (acc, cur) => (cur.avg > acc.avg ? cur : acc),
        {designIndex: 0, avg: 0, n: 0}
    );

    const score = Math.round(best.avg * 10) / 10;

    return {
        score,
        bestDesignIndex: best.designIndex,
        perDesign,
    };
}

/* =========================================================
   SUBMIT ACTIVITY 3 (GPS REQUIRED + SESSION VIDEO REQUIRED + PER-MEASUREMENT VIDEOS OPTIONAL)
========================================================= */

export async function submitActivity3({
                                          run,
                                          teamId,
                                          createdBy,
                                          reflection,
                                          rating,
                                      }: {
    run: Activity3RunDraft;
    teamId: string;
    createdBy: string;
    reflection: string;
    rating: number;
}) {
    if (!teamId) throw new Error("User has no team.");
    if (!createdBy) throw new Error("Missing user.");

    // Prediction required (FR-A3-05)
    if (!run.prediction?.createdAt) throw new Error("Prediction is required before submission.");

    // GPS required for submission (your policy)
    if (!run.session.gpsEnabled) throw new Error("GPS must be enabled before submission.");
    if (run.session.gpsPermission !== "granted") throw new Error("GPS permission must be granted before submission.");

    // Reflection + rating checks
    const text = reflection.trim();
    if (text.length < 20) throw new Error("Reflection is too short. Write at least 1–2 meaningful sentences.");
    if (!isFiniteNumber(rating) || rating < 1 || rating > 5) throw new Error("Rating must be between 1 and 5.");

    // Require at least 1 valid measurement per design (matches your measurement gate)
    const count = run.session.fanDesignCount;
    for (let i = 0; i < count; i++) {
        const hasOne = run.measurements.some(
            (m) => m.designIndex === i && isFiniteNumber(m.bendAngleDeg)
        );
        if (!hasOne) throw new Error(`Missing measurements: record at least 1 bend angle for Design ${i + 1}.`);
    }

    // Session video REQUIRED by your validate() in A3ReflectionSubmit
    const sessionUri = run.evidence?.sessionVideo?.uri;
    if (!isNonEmptyString(sessionUri)) {
        throw new Error("Session video is required before submission.");
    }

    const {score, bestDesignIndex, perDesign} = scoreActivity3(run);

    // 1) Upload session video
    const evidence: Array<{
        type: "video";
        storagePath: string;
        downloadURL: string;
        contentType?: string;
        kind: "session" | "measurement";
        measurementId?: string;
    }> = [];

    {
        const storagePath = `evidence/${teamId}/${ACTIVITY_KEYS.HAND_FAN}/${run.runId}/session.mp4`;
        const uploaded = await uploadVideoToStorage({
            uri: sessionUri,
            storagePath,
            contentType: "video/mp4",
        });

        evidence.push({
            type: "video",
            storagePath: uploaded.storagePath,
            downloadURL: uploaded.downloadURL,
            contentType: uploaded.contentType,
            kind: "session",
        });
    }

    // 2) Upload per-measurement videos (optional)
    const withVideo = run.measurements.filter((m) => isNonEmptyString(m.video?.uri));

    // If you want to be extra safe, you can keep it sequential (less memory pressure).
    for (const m of withVideo) {
        const storagePath = `evidence/${teamId}/${ACTIVITY_KEYS.HAND_FAN}/${run.runId}/measurement_${m.id}.mp4`;

        const uploaded = await uploadVideoToStorage({
            uri: m.video!.uri,
            storagePath,
            contentType: "video/mp4",
        });

        evidence.push({
            type: "video",
            storagePath: uploaded.storagePath,
            downloadURL: uploaded.downloadURL,
            contentType: uploaded.contentType,
            kind: "measurement",
            measurementId: m.id,
        });
    }

    // 3) Build submission payload (sanitize!)
    const submissionRef = collection(db, "submissions");

    const payloadRaw = {
        activityId: run.session.activityId,
        activityKey: ACTIVITY_KEYS.HAND_FAN,
        algorithmVersion: 1,

        teamId,
        createdBy,
        runId: run.runId,

        reflection: text,
        rating,

        score, // highest average bend angle
        scoreBreakdown: {
            bestDesignIndex,
            perDesign, // avg + n for each design
        },

        // store full details
        session: run.session,
        prediction: run.prediction,
        measurements: run.measurements,

        evidence,

        seasonId: DEFAULT_SEASON_ID,
        status: "submitted" as const,
        createdAt: serverTimestamp(),
    };

    const payload = stripUndefinedDeep(payloadRaw);

    // 4) Write submission
    const newSubmission = await addDoc(submissionRef, payload);

    // 5) Update team totals (same transactional method)
    await updateTeamScoresTransactional(teamId, ACTIVITY_KEYS.HAND_FAN, score);

    return {submissionId: newSubmission.id, score};
}

/* =========================================================
   ACTIVITY 4 SCORING (FR-A4-06: LOWEST movement score wins)
========================================================= */

export function scoreActivity4(run: Activity4RunDraft) {
    const valid = run.measurements.filter(
        (m) => isFiniteNumber(m.movementScore)
    );

    if (valid.length === 0) {
        throw new Error("No valid movement scores found.");
    }

    // Lowest score wins
    const best = valid.reduce((acc, cur) =>
        (cur.movementScore! < acc.movementScore!)
            ? cur
            : acc
    );

    const score = Math.round(best.movementScore! * 1000) / 1000; // 3 decimal precision

    return {
        score,
        bestDesignIndex: best.designIndex,
        totalDesignsTested: valid.length,
    };
}

/* =========================================================
   SUBMIT ACTIVITY 4 (EARTHQUAKE RESISTANT STRUCTURE)
========================================================= */

export async function submitActivity4({
                                          run,
                                          teamId,
                                          createdBy,
                                          reflection,
                                          rating,
                                      }: {
    run: Activity4RunDraft;
    teamId: string;
    createdBy: string;
    reflection: string;
    rating: number;
}) {
    if (!teamId) throw new Error("User has no team.");
    if (!createdBy) throw new Error("Missing user.");

    // --- POLICY VALIDATION ---

    if (!run.prediction?.createdAt) {
        throw new Error("Prediction must be entered before measurement.");
    }

    if (!run.session.gpsEnabled) {
        throw new Error("GPS must be enabled before submission.");
    }

    if (run.session.gpsPermission !== "granted") {
        throw new Error("GPS permission must be granted before submission.");
    }

    if (reflection.trim().length < 20) {
        throw new Error("Reflection must be at least 20 characters.");
    }

    if (!isFiniteNumber(rating) || rating < 1 || rating > 5) {
        throw new Error("Rating must be between 1 and 5.");
    }

    if (!run.evidence?.sessionVideo?.uri) {
        throw new Error("Session video evidence is required.");
    }

    if (run.measurements.length < run.session.designCount) {
        throw new Error("All designs must be tested before submission.");
    }

    // --- SCORING ---
    const {score, bestDesignIndex, totalDesignsTested} = scoreActivity4(run);

    // --- UPLOAD SESSION VIDEO ---
    const evidence: Array<{
        type: "video";
        storagePath: string;
        downloadURL: string;
        contentType?: string;
        kind: "session";
    }> = [];

    const sessionUri = run.evidence.sessionVideo.uri;

    const storagePath =
        `evidence/${teamId}/${ACTIVITY_KEYS.EARTHQUAKE}/${run.runId}/session.mp4`;

    const uploaded = await uploadVideoToStorage({
        uri: sessionUri,
        storagePath,
        contentType: "video/mp4",
    });

    evidence.push({
        type: "video",
        storagePath: uploaded.storagePath,
        downloadURL: uploaded.downloadURL,
        contentType: uploaded.contentType,
        kind: "session",
    });

    // --- BUILD SUBMISSION PAYLOAD ---
    const submissionRef = collection(db, "submissions");

    const payloadRaw = {
        activityId: run.session.activityId,
        activityKey: ACTIVITY_KEYS.EARTHQUAKE,
        algorithmVersion: 1,

        teamId,
        createdBy,
        runId: run.runId,

        reflection: reflection.trim(),
        rating,

        // Leaderboard score (LOWEST movement wins)
        score,
        scoreBreakdown: {
            bestDesignIndex,
            totalDesignsTested,
        },

        session: run.session,
        prediction: run.prediction,
        measurements: run.measurements,

        evidence,

        seasonId: DEFAULT_SEASON_ID,
        status: "submitted" as const,
        createdAt: serverTimestamp(),
    };

    const payload = stripUndefinedDeep(payloadRaw);

    // --- WRITE SUBMISSION ---
    const newSubmission = await addDoc(submissionRef, payload);

    // --- UPDATE TEAM LEADERBOARD ---
    await updateTeamScoresTransactional(
        teamId,
        ACTIVITY_KEYS.EARTHQUAKE,
        score
    );

    return {
        submissionId: newSubmission.id,
        score,
    };
}