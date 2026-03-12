// src/services/activitySubmissionService.ts
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
import type {Activity6RunDraft} from "../store/activity6RunDraftStore";
import type {Activity7RunDraft} from "../store/activity7RunDraftStore";

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

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
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
    REACTION_BOARD: "reaction_board",
    BREATHING_PACE: "breathing_pace",
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

        score, // scaled leaderboard score
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

/* =========================================================
   ACTIVITY 6 HELPERS (Reaction Board)
========================================================= */

const A6_DEFAULT_ACCURACY_THRESHOLD = 60;

function getA6ReactionTrials(run: Activity6RunDraft): any[] {
    const list = (run as any)?.reactionTrials ?? (run as any)?.trials ?? [];
    return Array.isArray(list) ? list : [];
}

function getA6TracingResults(run: Activity6RunDraft): any[] {
    const list =
        (run as any)?.tracingResults ??
        (run as any)?.tracingResult ??
        (run as any)?.tracing ??
        [];
    return Array.isArray(list) ? list : list ? [list] : [];
}

function getA6LatestTracing(run: Activity6RunDraft): any | null {
    const list = getA6TracingResults(run);
    if (list.length === 0) return null;

    return [...list].sort((a, b) => safeNum(b?.endedAt) - safeNum(a?.endedAt))[0] ?? null;
}

function getA6AccuracyScorePercent(run: Activity6RunDraft): number | null {
    const list = getA6TracingResults(run);

    const accuracies = list
        .map((tr) => {
            const raw =
                tr?.accuracyScorePct ??
                tr?.accuracyScorePercent ??
                tr?.accuracyPct ??
                tr?.accuracyScore;
            if (!isFiniteNumber(raw)) return null;
            if (raw <= 1) return Math.max(0, Math.min(100, raw * 100));
            return Math.max(0, Math.min(100, raw));
        })
        .filter((v): v is number => isFiniteNumber(v));

    if (accuracies.length === 0) return null;

    // Use average tracing accuracy across all saved tracing runs
    return computeMean(accuracies);
}

function getA6MinAccuracyScorePercent(run: Activity6RunDraft): number | null {
    const list = getA6TracingResults(run);

    const accuracies = list
        .map((tr) => {
            const raw =
                tr?.accuracyScorePct ??
                tr?.accuracyScorePercent ??
                tr?.accuracyPct ??
                tr?.accuracyScore;
            if (!isFiniteNumber(raw)) return null;
            if (raw <= 1) return Math.max(0, Math.min(100, raw * 100));
            return Math.max(0, Math.min(100, raw));
        })
        .filter((v): v is number => isFiniteNumber(v));

    if (accuracies.length === 0) return null;
    return Math.min(...accuracies);
}

function computeMean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function computeStdDev(arr: number[]): number {
    if (arr.length === 0) return 0;
    const mean = computeMean(arr);
    const v = arr.reduce((s, x) => s + (x - mean) * (x - mean), 0) / arr.length;
    return Math.sqrt(v);
}

/* =========================================================
   ACTIVITY 6 SCORING (LOWEST mean reaction time wins)
   Eligibility requires tracing accuracy >= threshold.
========================================================= */

export function scoreActivity6(run: Activity6RunDraft, opts?: { accuracyThreshold?: number }) {
    const accuracyThreshold = clampInt(opts?.accuracyThreshold ?? A6_DEFAULT_ACCURACY_THRESHOLD, 0, 100);

    const trials = getA6ReactionTrials(run);

    const reactionMs: number[] = trials
        .map((t) => safeNum(t?.reactionTimeMs ?? t?.reactionTime ?? t?.rtMs, NaN))
        .filter((v) => Number.isFinite(v) && v >= 0);

    if (reactionMs.length === 0) {
        throw new Error("No valid reaction time trials found.");
    }

    const meanMs = computeMean(reactionMs);
    const stdMs = computeStdDev(reactionMs);

    const avgAccuracy = getA6AccuracyScorePercent(run);
    const minAccuracy = getA6MinAccuracyScorePercent(run);

    const eligible =
        isFiniteNumber(minAccuracy) && minAccuracy >= accuracyThreshold;

    // For now, store mean reaction time directly as score (lower is better).
    // const score = Math.round(meanMs);
    const score = Math.max(0, Math.round(100 - meanMs / 10));

    return {
        score,
        meanReactionTimeMs: Math.round(meanMs),
        stdDevReactionTimeMs: Math.round(stdMs),
        trialCount: reactionMs.length,
        avgAccuracyScorePercent: avgAccuracy,
        minAccuracyScorePercent: minAccuracy,
        accuracyThreshold,
        eligible,
    };
}

/* =========================================================
   SUBMIT ACTIVITY 6 (Reaction Board Challenge)
========================================================= */

export async function submitActivity6({
                                          run,
                                          teamId,
                                          createdBy,
                                          reflection,
                                          rating,
                                          accuracyThreshold,
                                      }: {
    run: Activity6RunDraft;
    teamId: string;
    createdBy: string;
    reflection: string;
    rating: number;
    accuracyThreshold?: number;
}) {
    if (!teamId) throw new Error("User has no team.");
    if (!createdBy) throw new Error("Missing user.");

    if (!(run as any)?.prediction?.createdAt) {
        throw new Error("Prediction is required before starting the reaction challenge.");
    }

    const trials = getA6ReactionTrials(run);
    const hasAnyReaction = trials.some((t) => {
        const rt = t?.reactionTimeMs ?? t?.reactionTime ?? t?.rtMs;
        return isFiniteNumber(rt) && rt >= 0;
    });
    if (!hasAnyReaction) {
        throw new Error("Recorded reaction time dataset is required.");
    }

    const tracingResults = getA6TracingResults(run);
    if (tracingResults.length === 0) {
        throw new Error("Tracing challenge results are required.");
    }

    const thr = clampInt(accuracyThreshold ?? A6_DEFAULT_ACCURACY_THRESHOLD, 0, 100);
    const scored = scoreActivity6(run, {accuracyThreshold: thr});

    if (!isFiniteNumber(scored.avgAccuracyScorePercent)) {
        throw new Error("Tracing accuracy score is missing.");
    }

    if (!scored.eligible) {
        throw new Error(`Tracing accuracy must be at least ${thr}% to be eligible for leaderboard.`);
    }

    if ((run as any)?.session?.gpsEnabled) {
        if ((run as any)?.session?.gpsPermission !== "granted") {
            throw new Error("GPS permission must be granted before submission.");
        }
        if (!(run as any)?.session?.geo) {
            throw new Error("GPS coordinate not saved yet. Please capture location before submitting.");
        }
    }

    const text = reflection.trim();
    if (text.length < 20) throw new Error("Reflection is too short. Write at least 1–2 meaningful sentences.");
    if (!isFiniteNumber(rating) || rating < 1 || rating > 5) throw new Error("Rating must be between 1 and 5.");

    const evidence: Array<{
        type: "video";
        storagePath: string;
        downloadURL: string;
        contentType?: string;
        kind: "session";
    }> = [];

    const sessionUri = (run as any)?.evidence?.sessionVideo?.uri ?? (run as any)?.evidence?.video?.uri;
    if (isNonEmptyString(sessionUri)) {
        const storagePath = `evidence/${teamId}/${ACTIVITY_KEYS.REACTION_BOARD}/${(run as any).runId}/session.mp4`;

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
        activityId: (run as any)?.session?.activityId ?? (run as any)?.activityId,
        activityKey: ACTIVITY_KEYS.REACTION_BOARD,
        algorithmVersion: 2,

        teamId,
        createdBy,
        runId: (run as any).runId,

        reflection: text,
        rating,

        score: scored.score,
        scoreBreakdown: {
            meanReactionTimeMs: scored.meanReactionTimeMs,
            stdDevReactionTimeMs: scored.stdDevReactionTimeMs,
            trialCount: scored.trialCount,
            avgAccuracyScorePercent: scored.avgAccuracyScorePercent,
            minAccuracyScorePercent: scored.minAccuracyScorePercent,
            accuracyThreshold: scored.accuracyThreshold,
            leaderboardEligible: scored.eligible,
        },

        session: (run as any)?.session,
        prediction: (run as any)?.prediction,

        reactionTrials: (run as any)?.reactionTrials ?? (run as any)?.trials,
        tracingResults,
        tracingResultLatest: getA6LatestTracing(run),

        evidence,

        seasonId: DEFAULT_SEASON_ID,
        status: "submitted" as const,
        createdAt: serverTimestamp(),
    };

    const payload = stripUndefinedDeep(payloadRaw);

    const newSubmission = await addDoc(submissionRef, payload);

    await updateTeamScoresTransactional(teamId, ACTIVITY_KEYS.REACTION_BOARD, scored.score);

    return {
        submissionId: newSubmission.id,
        score: scored.score,
        meanReactionTimeMs: scored.meanReactionTimeMs,
        avgAccuracyPct: scored.avgAccuracyScorePercent,
        minAccuracyPct: scored.minAccuracyScorePercent,
    };
}

/* =========================================================
   ACTIVITY 7 HELPERS (Breathing Pace Trainer)
========================================================= */

function getA7Measurements(run: Activity7RunDraft): any[] {
    const list = (run as any)?.measurements ?? [];
    return Array.isArray(list) ? list : [];
}

function getA7Participants(run: Activity7RunDraft): any[] {
    const list = (run as any)?.session?.participants ?? [];
    return Array.isArray(list) ? list : [];
}

function getA7MeasurementForPhase(
    run: Activity7RunDraft,
    participantId: string,
    phase: "rest" | "post_jog_1min" | "post_star_jumps_100"
): any | null {
    const rows = getA7Measurements(run)
        .filter((m) => m?.participantId === participantId && m?.phase === phase)
        .sort((a, b) => safeNum(b?.endedAt) - safeNum(a?.endedAt));

    return rows[0] ?? null;
}

function getA7BreathingRate(m: any): number | null {
    const v = m?.estimatedBreathsPerMin ?? m?.breathsPerMinute ?? m?.bpm;
    return isFiniteNumber(v) ? v : null;
}

function getA7Prediction(run: Activity7RunDraft) {
    return (run as any)?.prediction ?? null;
}

/**
 * Lower is better.
 * Recovery consistency compares how similarly post-exercise breathing relates back to rest.
 */
function computeA7RecoveryConsistency(args: {
    restBpm?: number | null;
    postJogBpm?: number | null;
    postStarJumpBpm?: number | null;
}): number | null {
    const {restBpm, postJogBpm, postStarJumpBpm} = args;

    if (!isFiniteNumber(restBpm) || !isFiniteNumber(postJogBpm) || !isFiniteNumber(postStarJumpBpm)) {
        return null;
    }

    const d1 = Math.abs(postJogBpm - restBpm);
    const d2 = Math.abs(postStarJumpBpm - restBpm);

    const variability = Math.abs(d1 - d2);
    const meanGap = (d1 + d2) / 2;

    return Math.round((variability + meanGap * 0.25) * 1000) / 1000;
}

function computeA7PredictionErrors(run: Activity7RunDraft, participantId: string) {
    const pred = getA7Prediction(run);

    const rest = getA7MeasurementForPhase(run, participantId, "rest");
    const jog = getA7MeasurementForPhase(run, participantId, "post_jog_1min");
    const star = getA7MeasurementForPhase(run, participantId, "post_star_jumps_100");

    const restBpm = getA7BreathingRate(rest);
    const jogBpm = getA7BreathingRate(jog);
    const starBpm = getA7BreathingRate(star);

    const predictedRest = pred?.predictedRestBpm;
    const predictedAfterExercise = pred?.predictedAfterExerciseBpm;

    return {
        restAbsError:
            isFiniteNumber(predictedRest) && isFiniteNumber(restBpm)
                ? Math.abs(restBpm - predictedRest)
                : null,
        postJogAbsError:
            isFiniteNumber(predictedAfterExercise) && isFiniteNumber(jogBpm)
                ? Math.abs(jogBpm - predictedAfterExercise)
                : null,
        postStarJumpAbsError:
            isFiniteNumber(predictedAfterExercise) && isFiniteNumber(starBpm)
                ? Math.abs(starBpm - predictedAfterExercise)
                : null,
    };
}

function buildA7ParticipantSummaries(run: Activity7RunDraft) {
    const participants = getA7Participants(run);

    return participants.map((p) => {
        const participantId = safeStr(p?.id);
        const participantName = safeStr(p?.name) || "Participant";

        const rest = getA7MeasurementForPhase(run, participantId, "rest");
        const jog = getA7MeasurementForPhase(run, participantId, "post_jog_1min");
        const star = getA7MeasurementForPhase(run, participantId, "post_star_jumps_100");

        const restBpm = getA7BreathingRate(rest);
        const postJogBpm = getA7BreathingRate(jog);
        const postStarJumpBpm = getA7BreathingRate(star);

        const recoveryConsistencyScore = computeA7RecoveryConsistency({
            restBpm,
            postJogBpm,
            postStarJumpBpm,
        });

        const predictionErrors = computeA7PredictionErrors(run, participantId);

        return {
            participantId,
            participantName,

            restBpm,
            postJogBpm,
            postStarJumpBpm,

            deltaRestToJog:
                isFiniteNumber(restBpm) && isFiniteNumber(postJogBpm)
                    ? Math.round((postJogBpm - restBpm) * 10) / 10
                    : null,
            deltaRestToStarJump:
                isFiniteNumber(restBpm) && isFiniteNumber(postStarJumpBpm)
                    ? Math.round((postStarJumpBpm - restBpm) * 10) / 10
                    : null,
            deltaJogToStarJump:
                isFiniteNumber(postJogBpm) && isFiniteNumber(postStarJumpBpm)
                    ? Math.round((postStarJumpBpm - postJogBpm) * 10) / 10
                    : null,

            recoveryConsistencyScore,

            prediction: predictionErrors,
        };
    });
}

function scoreActivity7(run: Activity7RunDraft) {
    const summaries = buildA7ParticipantSummaries(run);

    const valid = summaries.filter((s) => isFiniteNumber(s.recoveryConsistencyScore));
    if (valid.length === 0) {
        throw new Error("No valid recovery consistency score could be computed.");
    }

    valid.sort(
        (a, b) =>
            safeNum(a.recoveryConsistencyScore, Number.POSITIVE_INFINITY) -
            safeNum(b.recoveryConsistencyScore, Number.POSITIVE_INFINITY)
    );

    const best = valid[0];

    const teamRecoveryConsistencyScore =
        valid.length > 0
            ? Math.round(
            (valid.reduce((sum, s) => sum + safeNum(s.recoveryConsistencyScore), 0) / valid.length) * 1000
        ) / 1000
            : null;

    return {
        /**
         * Lower recovery score is better scientifically,
         * but team totalScore system currently adds points.
         * So store an inverse-style positive leaderboard score.
         */
        score: Math.max(0, Math.round(1000 - safeNum(best.recoveryConsistencyScore) * 100)),
        bestParticipantId: best.participantId,
        bestParticipantName: best.participantName,
        bestParticipantRecoveryConsistencyScore: best.recoveryConsistencyScore,
        teamRecoveryConsistencyScore,
        participantSummaries: summaries,
    };
}

/* =========================================================
   SUBMIT ACTIVITY 7 (Breathing Pace Trainer)
========================================================= */

export async function submitActivity7({
                                          run,
                                          teamId,
                                          createdBy,
                                          reflection,
                                          rating,
                                      }: {
    run: Activity7RunDraft;
    teamId: string;
    createdBy: string;
    reflection: string;
    rating: number;
}) {
    if (!teamId) throw new Error("User has no team.");
    if (!createdBy) throw new Error("Missing user.");

    if (!(run as any)?.prediction?.createdAt) {
        throw new Error("Prediction is required before starting breathing measurements.");
    }

    const participants = getA7Participants(run);
    if (participants.length === 0) {
        throw new Error("No participants found in this session.");
    }

    for (const p of participants) {
        const pid = safeStr(p?.id);
        const pname = safeStr(p?.name) || "Participant";

        const rest = getA7MeasurementForPhase(run, pid, "rest");
        const jog = getA7MeasurementForPhase(run, pid, "post_jog_1min");
        const star = getA7MeasurementForPhase(run, pid, "post_star_jumps_100");

        if (!rest) throw new Error(`Missing rest measurement for ${pname}.`);
        if (!jog) throw new Error(`Missing post-jog measurement for ${pname}.`);
        if (!star) throw new Error(`Missing post-star-jumps measurement for ${pname}.`);

        if (!Array.isArray(rest?.samples) || rest.samples.length === 0) {
            throw new Error(`Rest sensor dataset is missing for ${pname}.`);
        }
        if (!Array.isArray(jog?.samples) || jog.samples.length === 0) {
            throw new Error(`Post-jog sensor dataset is missing for ${pname}.`);
        }
        if (!Array.isArray(star?.samples) || star.samples.length === 0) {
            throw new Error(`Post-star-jumps sensor dataset is missing for ${pname}.`);
        }

        if (!isFiniteNumber(getA7BreathingRate(rest))) {
            throw new Error(`Rest breathing rate is missing for ${pname}.`);
        }
        if (!isFiniteNumber(getA7BreathingRate(jog))) {
            throw new Error(`Post-jog breathing rate is missing for ${pname}.`);
        }
        if (!isFiniteNumber(getA7BreathingRate(star))) {
            throw new Error(`Post-star-jumps breathing rate is missing for ${pname}.`);
        }
    }

    if ((run as any)?.session?.gpsEnabled) {
        if ((run as any)?.session?.gpsPermission !== "granted") {
            throw new Error("GPS permission must be granted before submission.");
        }
        if (!(run as any)?.session?.geo) {
            throw new Error("GPS coordinate not saved yet. Please capture location before submitting.");
        }
    }

    const text = reflection.trim();
    if (text.length < 20) {
        throw new Error("Reflection is too short. Write at least 1–2 meaningful sentences.");
    }
    if (!isFiniteNumber(rating) || rating < 1 || rating > 5) {
        throw new Error("Rating must be between 1 and 5.");
    }

    const scored = scoreActivity7(run);

    const evidence: Array<{
        type: "video";
        storagePath: string;
        downloadURL: string;
        contentType?: string;
        kind: "session";
    }> = [];

    const sessionUri = (run as any)?.evidence?.sessionVideo?.uri;
    if (isNonEmptyString(sessionUri)) {
        const storagePath = `evidence/${teamId}/${ACTIVITY_KEYS.BREATHING_PACE}/${(run as any).runId}/session.mp4`;

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
        activityId: (run as any)?.session?.activityId ?? (run as any)?.activityId,
        activityKey: ACTIVITY_KEYS.BREATHING_PACE,
        algorithmVersion: 1,

        teamId,
        createdBy,
        runId: (run as any).runId,

        reflection: text,
        rating,

        score: scored.score,
        scoreBreakdown: {
            bestParticipantId: scored.bestParticipantId,
            bestParticipantName: scored.bestParticipantName,
            bestParticipantRecoveryConsistencyScore: scored.bestParticipantRecoveryConsistencyScore,
            teamRecoveryConsistencyScore: scored.teamRecoveryConsistencyScore,
        },

        session: (run as any)?.session,
        prediction: (run as any)?.prediction,
        measurements: getA7Measurements(run),
        participantSummaries: scored.participantSummaries,

        evidence,

        seasonId: DEFAULT_SEASON_ID,
        status: "submitted" as const,
        createdAt: serverTimestamp(),
    };

    const payload = stripUndefinedDeep(payloadRaw);

    const newSubmission = await addDoc(submissionRef, payload);

    await updateTeamScoresTransactional(teamId, ACTIVITY_KEYS.BREATHING_PACE, scored.score);

    return {
        submissionId: newSubmission.id,
        score: scored.score,
        teamRecoveryConsistencyScore: scored.teamRecoveryConsistencyScore,
        bestParticipantId: scored.bestParticipantId,
        bestParticipantName: scored.bestParticipantName,
        bestParticipantRecoveryConsistencyScore: scored.bestParticipantRecoveryConsistencyScore,
    };
}