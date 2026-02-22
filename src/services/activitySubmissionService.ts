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