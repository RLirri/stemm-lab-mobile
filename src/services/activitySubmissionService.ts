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
import type {Activity5RunDraft} from "../store/activity5RunDraftStore";

/* =========================================================
   Utilities
========================================================= */

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function safeNum(x: unknown, fallback = 0): number {
    return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function isNonEmptyString(x: unknown): x is string {
    return typeof x === "string" && x.trim().length > 0;
}

function safeStr(x: unknown): string {
    return typeof x === "string" ? x : "";
}

/* =========================================================
   Activity Key Registry
   IMPORTANT: Leaderboard modes must use these keys.
========================================================= */

export const ACTIVITY_KEYS = {
    PARACHUTE_DROP: "parachute_drop",
    SOUND_HUNTER: "sound_hunter",
    HAND_FAN: "hand_fan",
    EARTHQUAKE: "earthquake_structure", // keep consistent with Leaderboard mode key
    HUMAN_PERFORMANCE: "human_performance",
} as const;

const DEFAULT_SEASON_ID = "season_2026_s1";

/* =========================================================
   TEAM SCORE UPDATE
   - all-time total
   - current season total
   - current season per-activity
   - season history
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
   ACTIVITY 1 SCORING
========================================================= */

export function scoreActivity1(run: ActivityRunDraft, bestAttemptIndex: number) {
    const a = run.attempts?.[bestAttemptIndex];

    const tHit = a?.measurements?.tHitSec;
    const inZone = a?.measurements?.inTargetZone;
    const gForce = a?.computed?.gForce;

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
   SUBMIT ACTIVITY 1
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

    // Upload best attempt video if exists
    const bestAttempt = run.attempts?.[bestAttemptIndex];
    const localVideoUri = bestAttempt?.video?.uri;

    const evidence: Array<{
        type: "video";
        storagePath: string;
        downloadURL: string;
        attemptIndex: number;
        contentType?: string;
    }> = [];

    if (isNonEmptyString(localVideoUri)) {
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

        session: run.session,
        attempts: run.attempts,

        evidence,

        seasonId: DEFAULT_SEASON_ID,
        status: "submitted" as const,
        createdAt: serverTimestamp(),
    };

    const payload = stripUndefinedDeep(payloadRaw);

    const newSubmission = await addDoc(submissionRef, payload);

    await updateTeamScoresTransactional(teamId, ACTIVITY_KEYS.PARACHUTE_DROP, score);

    return {submissionId: newSubmission.id, score};
}

/* =========================================================
   SUBMIT ACTIVITY 2 (VIDEO OPTIONAL)
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

    const valid = (run.actions ?? []).filter(
        (a) => a?.isValid === true && isFiniteNumber(a?.dbAvg) && isFiniteNumber(a?.durationSec)
    );

    if (valid.length < 3) throw new Error("Minimum 3 valid measurements required.");

    const avg = valid.reduce((sum, a) => sum + (a.dbAvg ?? 0), 0) / valid.length;
    const score = Math.round(avg * 10) / 10;

    const evidence: Array<{
        type: "video";
        storagePath: string;
        downloadURL: string;
        contentType?: string;
    }> = [];

    const localUri = run.session?.sessionVideo?.uri;
    if (isNonEmptyString(localUri)) {
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

        score,
        validCount: valid.length,
        avgDb: score,

        session: run.session,
        actions: run.actions,

        evidence,

        seasonId: DEFAULT_SEASON_ID,
        status: "submitted" as const,
        createdAt: serverTimestamp(),
    };

    const payload = stripUndefinedDeep(payloadRaw);

    const newSubmission = await addDoc(submissionRef, payload);

    await updateTeamScoresTransactional(teamId, ACTIVITY_KEYS.SOUND_HUNTER, score);

    return {submissionId: newSubmission.id, score};
}

/* =========================================================
   ACTIVITY 3 SCORING (highest average bend angle)
========================================================= */

export function scoreActivity3(run: Activity3RunDraft) {
    const count = run.session.fanDesignCount;

    const perDesign: Array<{ designIndex: number; avg: number; n: number }> = [];

    for (let i = 0; i < count; i++) {
        const rows = (run.measurements ?? []).filter(
            (m) => m.designIndex === i && isFiniteNumber(m.bendAngleDeg) && (m.bendAngleDeg ?? 0) >= 0
        );
        const n = rows.length;
        const avg = n > 0 ? rows.reduce((s, m) => s + (m.bendAngleDeg ?? 0), 0) / n : 0;
        perDesign.push({designIndex: i, avg, n});
    }

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
   SUBMIT ACTIVITY 3 (GPS REQUIRED + SESSION VIDEO REQUIRED)
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

    if (!run.prediction?.createdAt) throw new Error("Prediction is required before submission.");

    if (!run.session.gpsEnabled) throw new Error("GPS must be enabled before submission.");
    if (run.session.gpsPermission !== "granted") throw new Error("GPS permission must be granted before submission.");

    const text = reflection.trim();
    if (text.length < 20) throw new Error("Reflection is too short. Write at least 1–2 meaningful sentences.");
    if (!isFiniteNumber(rating) || rating < 1 || rating > 5) throw new Error("Rating must be between 1 and 5.");

    const count = run.session.fanDesignCount;
    for (let i = 0; i < count; i++) {
        const hasOne = (run.measurements ?? []).some((m) => m.designIndex === i && isFiniteNumber(m.bendAngleDeg));
        if (!hasOne) throw new Error(`Missing measurements: record at least 1 bend angle for Design ${i + 1}.`);
    }

    const sessionUri = run.evidence?.sessionVideo?.uri;
    if (!isNonEmptyString(sessionUri)) {
        throw new Error("Session video is required before submission.");
    }

    const {score, bestDesignIndex, perDesign} = scoreActivity3(run);

    const evidence: Array<{
        type: "video";
        storagePath: string;
        downloadURL: string;
        contentType?: string;
        kind: "session" | "measurement";
        measurementId?: string;
    }> = [];

    // 1) session video
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

    // 2) per-measurement videos (optional)
    const withVideo = (run.measurements ?? []).filter((m) => isNonEmptyString(m.video?.uri));
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

        score,
        scoreBreakdown: {
            bestDesignIndex,
            perDesign,
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

    const newSubmission = await addDoc(submissionRef, payload);

    await updateTeamScoresTransactional(teamId, ACTIVITY_KEYS.HAND_FAN, score);

    return {submissionId: newSubmission.id, score};
}

/* =========================================================
   ACTIVITY 4 SCORING (LOWEST movement score wins)
========================================================= */

export function scoreActivity4(run: Activity4RunDraft) {
    const valid = (run.measurements ?? []).filter((m) => isFiniteNumber(m.movementScore));

    if (valid.length === 0) {
        throw new Error("No valid movement scores found.");
    }

    const best = valid.reduce((acc, cur) =>
        (cur.movementScore! < acc.movementScore!) ? cur : acc
    );

    const score = Math.round(best.movementScore! * 1000) / 1000;

    return {
        score,
        bestDesignIndex: best.designIndex,
        totalDesignsTested: valid.length,
    };
}

/* =========================================================
   SUBMIT ACTIVITY 4 (EARTHQUAKE)
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

    const text = reflection.trim();
    if (text.length < 20) throw new Error("Reflection is too short. Write at least 1–2 meaningful sentences.");
    if (!isFiniteNumber(rating) || rating < 1 || rating > 5) throw new Error("Rating must be between 1 and 5.");

    const {score, bestDesignIndex, totalDesignsTested} = scoreActivity4(run);

    const submissionRef = collection(db, "submissions");

    const payloadRaw = {
        activityId: run.session.activityId,
        activityKey: ACTIVITY_KEYS.EARTHQUAKE,
        algorithmVersion: 1,

        teamId,
        createdBy,
        runId: run.runId,

        reflection: text,
        rating,

        // A4: lower is better (your leaderboard handles asc ordering)
        score,
        scoreBreakdown: {
            bestDesignIndex,
            totalDesignsTested,
        },

        session: run.session,
        measurements: run.measurements,

        seasonId: DEFAULT_SEASON_ID,
        status: "submitted" as const,
        createdAt: serverTimestamp(),
    };

    const payload = stripUndefinedDeep(payloadRaw);

    const newSubmission = await addDoc(submissionRef, payload);

    await updateTeamScoresTransactional(teamId, ACTIVITY_KEYS.EARTHQUAKE, score);

    return {submissionId: newSubmission.id, score};
}

/* =========================================================
   ACTIVITY 5 SCORING (HIGHEST improvement wins)
   - UN-SCALED here; submit scales ×100 for leaderboard storage
========================================================= */

export function scoreActivity5(run: Activity5RunDraft) {
    const imps = Array.isArray((run as any).improvements) ? ((run as any).improvements as any[]) : [];

    let bestScoreUnscaled = 0;
    let bestParticipantId = "";
    let bestMovementType = "";
    let baselineSmoothnessIndex = 0;
    let feedbackSmoothnessIndex = 0;

    // Prefer improvements array if present
    for (const it of imps) {
        const pid = safeStr(it?.participantId);
        const mv = safeStr(it?.movementType);

        const impScore = safeNum(it?.improvementScore, NaN);

        const b = safeNum(it?.baselineSmoothnessIndex, NaN);
        const f = safeNum(it?.feedbackSmoothnessIndex, NaN);
        const computed = (Number.isFinite(b) && Number.isFinite(f)) ? (b - f) : 0;

        const scoreUnscaled = Number.isFinite(impScore) ? impScore : computed;

        if (scoreUnscaled > bestScoreUnscaled) {
            bestScoreUnscaled = scoreUnscaled;
            bestParticipantId = pid;
            bestMovementType = mv;
            baselineSmoothnessIndex = Number.isFinite(b) ? b : safeNum(it?.baselineSmoothnessIndex, 0);
            feedbackSmoothnessIndex = Number.isFinite(f) ? f : safeNum(it?.feedbackSmoothnessIndex, 0);
        }
    }

    // Fallback compute from trials if improvements missing/empty
    if (bestScoreUnscaled <= 0) {
        const trials = Array.isArray((run as any).trials) ? ((run as any).trials as any[]) : [];
        const participants = Array.isArray(run.session?.participants) ? run.session.participants : [];
        const movements = Array.isArray(run.session?.movements) ? run.session.movements : [];

        function latestTrial(pid: string, mv: string, mode: "baseline" | "feedback") {
            return trials
                .filter((t) => t?.participantId === pid && t?.movementType === mv && t?.mode === mode)
                .sort((a, b) => safeNum(b?.createdAt) - safeNum(a?.createdAt))[0];
        }

        for (const p of participants) {
            for (const m of movements) {
                const b = latestTrial(p.id, m.type, "baseline");
                const f = latestTrial(p.id, m.type, "feedback");
                const bs = b?.metrics?.smoothnessIndex;
                const fs = f?.metrics?.smoothnessIndex;

                if (!isFiniteNumber(bs) || !isFiniteNumber(fs)) continue;

                const scoreUnscaled = bs - fs;
                if (scoreUnscaled > bestScoreUnscaled) {
                    bestScoreUnscaled = scoreUnscaled;
                    bestParticipantId = p.id;
                    bestMovementType = m.type;
                    baselineSmoothnessIndex = bs;
                    feedbackSmoothnessIndex = fs;
                }
            }
        }
    }

    return {
        score: Math.max(0, bestScoreUnscaled),
        bestParticipantId,
        bestMovementType,
        baselineSmoothnessIndex,
        feedbackSmoothnessIndex,
    };
}

/* =========================================================
   SUBMIT ACTIVITY 5 (HUMAN PERFORMANCE)
   - session video OPTIONAL
   - leaderboard score STORED as scaled ×100
========================================================= */

export async function submitActivity5({
                                          run,
                                          teamId,
                                          createdBy,
                                          reflection,
                                          rating,

                                          // Optional override if UI computed and already scaled
                                          bestImprovementScore,
                                          bestParticipantId: bestParticipantIdOverride,
                                          bestMovementType: bestMovementTypeOverride,
                                      }: {
    run: Activity5RunDraft;
    teamId: string;
    createdBy: string;
    reflection: string;
    rating: number;

    bestImprovementScore?: number; // already scaled if provided
    bestParticipantId?: string;
    bestMovementType?: string;
}) {
    if (!teamId) throw new Error("User has no team.");
    if (!createdBy) throw new Error("Missing user.");

    // Prediction required
    if (!run.prediction?.createdAt) {
        throw new Error("Prediction is required before starting trials.");
    }

    // Require at least one dataset
    const hasAnyDataset = (run.trials ?? []).some(
        (t) => t?.dataset && Array.isArray(t.dataset.samples) && t.dataset.samples.length > 0
    );
    if (!hasAnyDataset) {
        throw new Error("Recorded sensor dataset (accelerometer) is required.");
    }

    // Require baseline + feedback with metrics
    const hasBaseline = (run.trials ?? []).some((t) => t?.mode === "baseline" && !!t.metrics);
    const hasFeedback = (run.trials ?? []).some((t) => t?.mode === "feedback" && !!t.metrics);
    if (!hasBaseline) throw new Error("At least 1 Baseline trial with computed metrics is required.");
    if (!hasFeedback) throw new Error("At least 1 Feedback trial with computed metrics is required.");

    // GPS required only when enabled
    if (run.session.gpsEnabled) {
        if (run.session.gpsPermission !== "granted") {
            throw new Error("GPS permission must be granted before submission.");
        }
        if (!run.session.geo) {
            throw new Error("GPS coordinate not saved yet. Please capture location before submitting.");
        }
    }

    // Reflection + rating
    const text = reflection.trim();
    if (text.length < 20) {
        throw new Error("Reflection is too short. Write at least 1–2 meaningful sentences.");
    }
    if (!isFiniteNumber(rating) || rating < 1 || rating > 5) {
        throw new Error("Rating must be between 1 and 5.");
    }

    // Improvements required (your current policy)
    if (!Array.isArray(run.improvements) || run.improvements.length === 0) {
        throw new Error("Improvement score could not be computed. Ensure baseline + feedback trials have metrics.");
    }

    // Score (store scaled)
    const SMOOTHNESS_SCORE_SCALE = 100;

    const computed = scoreActivity5(run);
    const computedScaled = computed.score * SMOOTHNESS_SCORE_SCALE;

    const scoreRaw =
        typeof bestImprovementScore === "number" && Number.isFinite(bestImprovementScore)
            ? bestImprovementScore // already scaled
            : computedScaled;

    const score = Math.max(0, scoreRaw);

    const bestParticipantId = bestParticipantIdOverride ?? computed.bestParticipantId;
    const bestMovementType = bestMovementTypeOverride ?? computed.bestMovementType;

    // Optional evidence upload
    const evidence: Array<{
        type: "video";
        storagePath: string;
        downloadURL: string;
        contentType?: string;
        kind: "session";
    }> = [];

    const sessionUri = run.evidence?.sessionVideo?.uri;
    if (isNonEmptyString(sessionUri)) {
        const storagePath = `evidence/${teamId}/${ACTIVITY_KEYS.HUMAN_PERFORMANCE}/${run.runId}/session.mp4`;

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

    const submissionRef = collection(db, "submissions");

    const payloadRaw = {
        activityId: run.session.activityId,
        activityKey: ACTIVITY_KEYS.HUMAN_PERFORMANCE,
        algorithmVersion: 2, // scaled score change

        teamId,
        createdBy,
        runId: run.runId,

        reflection: text,
        rating,

        score, // ✅ scaled leaderboard score
        scoreBreakdown: {
            bestParticipantId,
            bestMovementType,
            baselineSmoothnessIndex: computed.baselineSmoothnessIndex,
            feedbackSmoothnessIndex: computed.feedbackSmoothnessIndex,
            smoothnessScoreScale: SMOOTHNESS_SCORE_SCALE,
            scoreUnscaled: computed.score,
        },

        session: run.session,
        prediction: run.prediction,
        trials: run.trials,
        improvements: run.improvements,

        evidence, // may be empty

        seasonId: DEFAULT_SEASON_ID,
        status: "submitted" as const,
        createdAt: serverTimestamp(),
    };

    const payload = stripUndefinedDeep(payloadRaw);

    const newSubmission = await addDoc(submissionRef, payload);

    await updateTeamScoresTransactional(teamId, ACTIVITY_KEYS.HUMAN_PERFORMANCE, score);

    return {submissionId: newSubmission.id, score};
}