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

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function safeNum(x: unknown): number {
    return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

/**
 * Activity key registry
 * Add future activities here.
 */
export const ACTIVITY_KEYS = {
    PARACHUTE_DROP: "parachute_drop",
} as const;

const DEFAULT_SEASON_ID = "season_2026_s1";

/* =========================================================
   ACTIVITY 1 SCORING
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
   SUBMIT ACTIVITY 1 (WITH EVIDENCE UPLOAD)
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

        evidence, //

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