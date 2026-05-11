// src/store/activity6RunDraftStore.ts

import {offlineDraftService} from "../services/offlineDraftService";
import type {OfflineDraftStatus} from "../types/offlineDraft";

export type GpsPermissionStatus = "unknown" | "granted" | "denied";

/* =========================================================
   Evidence + GPS
========================================================= */

export type EvidenceDraft = {
    uri: string;
    createdAt: number;
};

export type GeoPointDraft = {
    lat: number;
    lng: number;
    accuracyM?: number;
    captureAt: number;
};

/* =========================================================
   Reaction + Tracing Types
========================================================= */

export type A6HandType = "dominant" | "non_dominant";

export type A6TargetConfig = {
    delayMinSec: number;
    delayMaxSec: number;
    targetSizePx: number;
};

export type A6TargetPresentation = {
    delayMs: number;
    appearedAt: number;
    location: { x: number; y: number };
};

export type A6ReactionTrialDraft = {
    id: string;
    participantId: string;
    hand: A6HandType;
    trialNumber: number;
    timestamp: number;
    target?: A6TargetPresentation;
    tapAt?: number;
    reactionTimeMs?: number;
    video?: EvidenceDraft;
    geo?: GeoPointDraft;
    notes?: string;
    createdAt: number;
    updatedAt?: number;
};

export type A6TracePoint = {
    tMs: number;
    x: number;
    y: number;
};

export type A6TracingPathType = "circle" | "wave" | "zigzag" | "figure8";

export type A6TracingResultDraft = {
    id: string;
    participantId: string;
    pathType: A6TracingPathType;
    startedAt: number;
    endedAt: number;
    durationMs: number;
    userPath: A6TracePoint[];
    referencePath: A6TracePoint[];
    avgDeviationPx: number;
    maxAllowedDeviationPx: number;
    accuracyScorePct: number;
    video?: EvidenceDraft;
    geo?: GeoPointDraft;
    notes?: string;
    createdAt: number;
    updatedAt?: number;
};

/* =========================================================
   Participants
========================================================= */

export type A6ParticipantDraft = {
    id: string;
    name: string;
    dominantHand?: "left" | "right";
    createdAt: number;
    updatedAt?: number;
};

/* =========================================================
   Computed Metrics
========================================================= */

export type A6ReactionStats = {
    participantId: string;
    hand: A6HandType;
    n: number;
    meanReactionTimeMs: number;
    stdDevReactionTimeMs: number;
    fastestReactionTimeMs?: number;
};

export type A6ParticipantSummary = {
    participantId: string;
    dominant?: A6ReactionStats;
    nonDominant?: A6ReactionStats;
    tracingAccuracyPct?: number;
    overallMeanReactionTimeMs?: number;
};

export type A6SessionMetrics = {
    participantSummaries: A6ParticipantSummary[];
    fastestParticipantId?: string;
    mostAccurateParticipantId?: string;
    teamMeanReactionTimeMs?: number;
};

/* =========================================================
   Session + Run
========================================================= */

export type A6SessionDraft = {
    activityId: string;
    sessionLabel?: string;
    participantCount: number;
    participants: A6ParticipantDraft[];
    trialsPerHand: number;
    target: A6TargetConfig;
    tracingPathType: A6TracingPathType;
    maxAllowedDeviationPx: number;
    accuracyThresholdPct: number;
    startedAt: number;
    endsAt?: number;
    gpsEnabled: boolean;
    geo?: {
        lat: number;
        lng: number;
        accuracyM?: number;
        capturedAt: number;
    };
    gpsPermission: GpsPermissionStatus;
};

export type A6PredictionDraft = {
    predictedReactionTimeMs?: number;
    predictedHandFaster?: "Dominant" | "Non-dominant" | "Same";
    createdAt: number;
    updatedAt?: number;
};

export type A6ReflectionDraft = {
    reflectionText?: string;
    rating?: number;
};

export type Activity6RunDraft = {
    runId: string;
    session: A6SessionDraft;
    prediction?: A6PredictionDraft;
    reactionTrials: A6ReactionTrialDraft[];
    tracingResults: A6TracingResultDraft[];
    metrics?: A6SessionMetrics;
    evidence?: {
        sessionVideo?: EvidenceDraft;
    };
    reflection?: A6ReflectionDraft;
    createdBy?: string;
    updatedAt: number;
};

type PersistOptions = {
    currentStep?: string | null;
    status?: OfflineDraftStatus;
    teamId?: string | null;
};

/* =========================================================
   In-memory store
========================================================= */

const DRAFTS_KEY = "__STEMM_A6_RUN_DRAFTS__";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

const drafts: Map<string, Activity6RunDraft> =
    (g[DRAFTS_KEY] ?? new Map<string, Activity6RunDraft>()) as Map<string, Activity6RunDraft>;

g[DRAFTS_KEY] = drafts;

function now() {
    return Date.now();
}

function genRunId() {
    return `a6_${now()}_${Math.random().toString(16).slice(2)}`;
}

function genId(prefix: string) {
    return `${prefix}_${now()}_${Math.random().toString(16).slice(2)}`;
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNum(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function trimOrUndef(s?: string) {
    const t = s?.trim();
    return t ? t : undefined;
}

function timestampToIso(timestampMs: number): string {
    return new Date(timestampMs).toISOString();
}

/* =========================================================
   Defaults + Sanitizers
========================================================= */

function makeDefaultParticipant(index: number): A6ParticipantDraft {
    const ts = now();
    return {
        id: genId("p"),
        name: `Participant ${index + 1}`,
        createdAt: ts,
    };
}

function buildParticipants(count: number): A6ParticipantDraft[] {
    return Array.from({length: count}, (_, i) => makeDefaultParticipant(i));
}

function sanitizeParticipant(p: A6ParticipantDraft): A6ParticipantDraft {
    return {
        ...p,
        name: trimOrUndef(p.name) ?? p.name,
    };
}

function normalizeParticipantsForCount(
    existing: A6ParticipantDraft[],
    nextCount: number
): A6ParticipantDraft[] {
    const list = [...(existing ?? [])];

    let next = list.slice(0, nextCount);
    for (let i = next.length; i < nextCount; i++) next.push(makeDefaultParticipant(i));

    return next.map(sanitizeParticipant);
}

function sanitizeTargetConfig(t: Partial<A6TargetConfig> | undefined): A6TargetConfig {
    const min = clampNum(t?.delayMinSec ?? 1.0, 0.5, 10);
    const max = clampNum(t?.delayMaxSec ?? 3.0, 0.5, 10);
    const fixedMax = Math.max(max, min + 0.1);
    return {
        delayMinSec: min,
        delayMaxSec: fixedMax,
        targetSizePx: clampInt(t?.targetSizePx ?? 56, 24, 120),
    };
}

function sanitizeTracePointList(list: A6TracePoint[] | undefined): A6TracePoint[] {
    if (!Array.isArray(list)) return [];
    return list
        .filter((p) => p && Number.isFinite(p.tMs) && Number.isFinite(p.x) && Number.isFinite(p.y))
        .map((p) => ({
            tMs: clampInt(p.tMs, 0, 10 * 60 * 1000),
            x: clampNum(p.x, 0, 1),
            y: clampNum(p.y, 0, 1),
        }));
}

/* =========================================================
   Metrics helpers
========================================================= */

function mean(xs: number[]): number {
    if (xs.length === 0) return 0;
    let s = 0;
    for (const x of xs) s += x;
    return s / xs.length;
}

function stdDevPopulation(xs: number[], m: number): number {
    if (xs.length === 0) return 0;
    let sum = 0;
    for (const x of xs) {
        const d = x - m;
        sum += d * d;
    }
    return Math.sqrt(sum / xs.length);
}

function computeReactionStatsFor(
    trials: A6ReactionTrialDraft[],
    participantId: string,
    hand: A6HandType
): A6ReactionStats | undefined {
    const list = trials
        .filter((t) => t.participantId === participantId && t.hand === hand)
        .map((t) => t.reactionTimeMs)
        .filter((v): v is number => Number.isFinite(v));

    if (list.length === 0) return undefined;

    const m = mean(list);
    const sd = stdDevPopulation(list, m);
    const fastest = Math.min(...list);

    return {
        participantId,
        hand,
        n: list.length,
        meanReactionTimeMs: m,
        stdDevReactionTimeMs: sd,
        fastestReactionTimeMs: fastest,
    };
}

function computeSessionMetrics(d: Activity6RunDraft): A6SessionMetrics {
    const participants = d.session.participants ?? [];
    const summaries: A6ParticipantSummary[] = [];

    for (const p of participants) {
        const dominant = computeReactionStatsFor(d.reactionTrials, p.id, "dominant");
        const nonDominant = computeReactionStatsFor(d.reactionTrials, p.id, "non_dominant");

        const tracing = [...d.tracingResults]
            .filter((r) => r.participantId === p.id)
            .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];

        const rtValues: number[] = [];
        if (dominant) rtValues.push(dominant.meanReactionTimeMs);
        if (nonDominant) rtValues.push(nonDominant.meanReactionTimeMs);

        const overallMean = rtValues.length ? mean(rtValues) : undefined;

        summaries.push({
            participantId: p.id,
            dominant,
            nonDominant,
            tracingAccuracyPct: tracing?.accuracyScorePct,
            overallMeanReactionTimeMs: overallMean,
        });
    }

    const fastest = [...summaries]
        .filter((s) => Number.isFinite(s.overallMeanReactionTimeMs))
        .sort((a, b) => (a.overallMeanReactionTimeMs! - b.overallMeanReactionTimeMs!))[0];

    const accurate = [...summaries]
        .filter((s) => Number.isFinite(s.tracingAccuracyPct))
        .sort((a, b) => (b.tracingAccuracyPct! - a.tracingAccuracyPct!))[0];

    const teamMeans = summaries
        .map((s) => s.overallMeanReactionTimeMs)
        .filter((v): v is number => Number.isFinite(v));
    const teamMean = teamMeans.length ? mean(teamMeans) : undefined;

    return {
        participantSummaries: summaries,
        fastestParticipantId: fastest?.participantId,
        mostAccurateParticipantId: accurate?.participantId,
        teamMeanReactionTimeMs: teamMean,
    };
}

function normalizeRecoveredActivity6Draft(payload: Activity6RunDraft): Activity6RunDraft {
    const participantCount = clampInt(payload.session?.participantCount ?? 1, 1, 6);
    const reactionTrials = Array.isArray(payload.reactionTrials) ? payload.reactionTrials : [];
    const tracingResults = Array.isArray(payload.tracingResults) ? payload.tracingResults : [];

    const normalized: Activity6RunDraft = {
        ...payload,
        session: {
            ...payload.session,
            participantCount,
            participants: normalizeParticipantsForCount(payload.session?.participants ?? [], participantCount),
            trialsPerHand: clampInt(payload.session?.trialsPerHand ?? 3, 1, 10),
            target: sanitizeTargetConfig(payload.session?.target),
            tracingPathType: payload.session?.tracingPathType ?? "circle",
            maxAllowedDeviationPx: clampInt(payload.session?.maxAllowedDeviationPx ?? 40, 10, 200),
            accuracyThresholdPct: clampInt(payload.session?.accuracyThresholdPct ?? 70, 0, 100),
            gpsEnabled: payload.session?.gpsEnabled ?? true,
            gpsPermission: payload.session?.gpsPermission ?? "unknown",
        },
        reactionTrials,
        tracingResults,
    };

    return {
        ...normalized,
        metrics: payload.metrics ?? computeSessionMetrics(normalized),
    };
}

async function persistDraftInternal(
    draft: Activity6RunDraft,
    options?: PersistOptions
): Promise<void> {
    await offlineDraftService.saveDraft<Activity6RunDraft>({
        runId: draft.runId,
        activityId: draft.session.activityId,
        payload: draft,
        currentStep: options?.currentStep ?? null,
        status: options?.status ?? "draft",
        userId: draft.createdBy ?? null,
        teamId: options?.teamId ?? null,
        createdAt: timestampToIso(draft.session.startedAt),
    });
}

function fireAndForgetPersist(
    draft: Activity6RunDraft,
    options?: PersistOptions
): void {
    void persistDraftInternal(draft, options).catch((error) => {
        console.error("[activity6RunDraftStore] Failed to persist draft", {
            runId: draft.runId,
            error,
        });
    });
}

/* =========================================================
   CRUD: Run draft
========================================================= */

export function createActivity6RunDraft(params: {
    activityId: string;
    createdBy?: string;
    participantCount?: number;
    trialsPerHand?: number;
    target?: Partial<A6TargetConfig>;
    tracingPathType?: A6TracingPathType;
    maxAllowedDeviationPx?: number;
    accuracyThresholdPct?: number;
    gpsEnabled?: boolean;
    sessionLabel?: string;
}): Activity6RunDraft {
    const runId = genRunId();

    const participantCount = clampInt(params.participantCount ?? 1, 1, 6);
    const trialsPerHand = clampInt(params.trialsPerHand ?? 3, 1, 10);
    const target = sanitizeTargetConfig(params.target);
    const tracingPathType: A6TracingPathType = params.tracingPathType ?? "circle";
    const maxAllowedDeviationPx = clampInt(params.maxAllowedDeviationPx ?? 40, 10, 200);
    const accuracyThresholdPct = clampInt(params.accuracyThresholdPct ?? 70, 0, 100);

    const d: Activity6RunDraft = {
        runId,
        session: {
            activityId: params.activityId,
            sessionLabel: trimOrUndef(params.sessionLabel),
            participantCount,
            participants: buildParticipants(participantCount),
            trialsPerHand,
            target,
            tracingPathType,
            maxAllowedDeviationPx,
            accuracyThresholdPct,
            startedAt: now(),
            gpsEnabled: params.gpsEnabled ?? true,
            gpsPermission: "unknown",
        },
        prediction: undefined,
        reactionTrials: [],
        tracingResults: [],
        metrics: {participantSummaries: []},
        evidence: undefined,
        reflection: undefined,
        createdBy: params.createdBy,
        updatedAt: now(),
    };

    drafts.set(runId, d);
    fireAndForgetPersist(d);
    return d;
}

export function getActivity6RunDraft(runId: string): Activity6RunDraft | null {
    return drafts.get(runId) ?? null;
}

export function getAllActivity6RunDrafts(): Activity6RunDraft[] {
    return Array.from(drafts.values());
}

export function clearActivity6RunDraft(runId: string) {
    drafts.delete(runId);
}

/* =========================================================
   Updates: Session + Participants
========================================================= */

export function updateActivity6Session(
    runId: string,
    patch: Partial<A6SessionDraft>
): Activity6RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 6 draft not found.");

    const nextParticipantCount =
        patch.participantCount != null
            ? clampInt(patch.participantCount, 1, 6)
            : d.session.participantCount;

    const incomingParticipants = patch.participants ?? d.session.participants ?? [];
    const nextParticipants = normalizeParticipantsForCount(incomingParticipants, nextParticipantCount);

    const nextTrialsPerHand =
        patch.trialsPerHand != null ? clampInt(patch.trialsPerHand, 1, 10) : d.session.trialsPerHand;

    const nextTarget = patch.target ? sanitizeTargetConfig(patch.target) : d.session.target;

    const nextMaxDev =
        patch.maxAllowedDeviationPx != null
            ? clampInt(patch.maxAllowedDeviationPx, 10, 200)
            : d.session.maxAllowedDeviationPx;

    const nextAccThreshold =
        patch.accuracyThresholdPct != null
            ? clampInt(patch.accuracyThresholdPct, 0, 100)
            : d.session.accuracyThresholdPct;

    const next: Activity6RunDraft = {
        ...d,
        session: {
            ...d.session,
            ...patch,
            sessionLabel: trimOrUndef(patch.sessionLabel ?? d.session.sessionLabel),
            participantCount: nextParticipantCount,
            participants: nextParticipants,
            trialsPerHand: nextTrialsPerHand,
            target: nextTarget,
            maxAllowedDeviationPx: nextMaxDev,
            accuracyThresholdPct: nextAccThreshold,
        },
        updatedAt: now(),
    };

    next.metrics = computeSessionMetrics(next);

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

export function updateActivity6Participant(
    runId: string,
    participantId: string,
    patch: Partial<Omit<A6ParticipantDraft, "id" | "createdAt">>
): Activity6RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 6 draft not found.");

    const list = d.session.participants ?? [];
    const idx = list.findIndex((p) => p.id === participantId);
    if (idx < 0) throw new Error("Participant not found.");

    const ts = now();

    const nextParticipants = list.map((p) => {
        if (p.id !== participantId) return p;

        const merged: A6ParticipantDraft = {
            ...p,
            ...patch,
            id: p.id,
            createdAt: p.createdAt,
            updatedAt: ts,
            name: trimOrUndef((patch as any).name) ?? p.name,
        };

        return sanitizeParticipant(merged);
    });

    const next: Activity6RunDraft = {
        ...d,
        session: {
            ...d.session,
            participants: nextParticipants,
        },
        updatedAt: ts,
    };

    next.metrics = computeSessionMetrics(next);

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

/* =========================================================
   Updates: Prediction
========================================================= */

export function setActivity6Prediction(
    runId: string,
    patch: Partial<A6PredictionDraft>
): Activity6RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 6 draft not found.");

    const existing = d.prediction;

    const nextPred: A6PredictionDraft = {
        predictedReactionTimeMs: existing?.predictedReactionTimeMs,
        predictedHandFaster: existing?.predictedHandFaster,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
        ...patch,
    };

    if (nextPred.predictedReactionTimeMs != null) {
        nextPred.predictedReactionTimeMs = clampInt(nextPred.predictedReactionTimeMs, 100, 2000);
    }

    const next: Activity6RunDraft = {
        ...d,
        prediction: nextPred,
        updatedAt: now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

/* =========================================================
   Updates: Reaction Trials
========================================================= */

export function upsertActivity6ReactionTrial(
    runId: string,
    input: {
        id?: string;
        participantId: string;
        hand: A6HandType;
        trialNumber: number;
        target?: A6TargetPresentation;
        tapAt?: number;
        video?: EvidenceDraft;
        geo?: GeoPointDraft;
        notes?: string;
    }
): Activity6RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 6 draft not found.");

    if (!d.prediction) {
        throw new Error("Prediction is required before starting reaction trials (FR-A6-06).");
    }

    const hasParticipant = d.session.participants.some((p) => p.id === input.participantId);
    if (!hasParticipant) throw new Error("Participant not found for this session.");

    const id = input.id ?? genId("rt");
    const ts = now();

    const existingIndex = d.reactionTrials.findIndex((t) => t.id === id);
    const prev = existingIndex >= 0 ? d.reactionTrials[existingIndex] : undefined;

    const appearedAt = input.target?.appearedAt ?? prev?.target?.appearedAt;
    const tapAt = input.tapAt ?? prev?.tapAt;
    const reactionTimeMs =
        Number.isFinite(appearedAt) && Number.isFinite(tapAt) ? Math.max(0, tapAt! - appearedAt!) : prev?.reactionTimeMs;

    const nextItem: A6ReactionTrialDraft = {
        id,
        participantId: input.participantId,
        hand: input.hand,
        trialNumber: clampInt(input.trialNumber, 1, 100),
        timestamp: tapAt ?? ts,
        target: input.target ?? prev?.target,
        tapAt: tapAt ?? prev?.tapAt,
        reactionTimeMs,
        video: input.video ?? prev?.video,
        geo: input.geo ?? prev?.geo,
        notes: trimOrUndef(input.notes) ?? prev?.notes,
        createdAt: prev ? prev.createdAt : ts,
        updatedAt: prev ? ts : undefined,
    };

    const nextTrials =
        existingIndex >= 0
            ? d.reactionTrials.map((t, i) => (i === existingIndex ? nextItem : t))
            : [...d.reactionTrials, nextItem];

    const next: Activity6RunDraft = {
        ...d,
        reactionTrials: nextTrials,
        updatedAt: ts,
    };

    next.metrics = computeSessionMetrics(next);

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

export function removeActivity6ReactionTrial(runId: string, trialId: string): Activity6RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 6 draft not found.");

    const nextTrials = d.reactionTrials.filter((t) => t.id !== trialId);

    const next: Activity6RunDraft = {
        ...d,
        reactionTrials: nextTrials,
        updatedAt: now(),
    };

    next.metrics = computeSessionMetrics(next);

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

/* =========================================================
   Updates: Tracing Results
========================================================= */

export function upsertActivity6TracingResult(
    runId: string,
    input: {
        id?: string;
        participantId: string;
        pathType: A6TracingPathType;
        startedAt: number;
        endedAt: number;
        userPath: A6TracePoint[];
        referencePath: A6TracePoint[];
        avgDeviationPx: number;
        maxAllowedDeviationPx?: number;
        video?: EvidenceDraft;
        geo?: GeoPointDraft;
        notes?: string;
    }
): Activity6RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 6 draft not found.");

    const hasParticipant = d.session.participants.some((p) => p.id === input.participantId);
    if (!hasParticipant) throw new Error("Participant not found for this session.");

    const id = input.id ?? genId("tr");
    const ts = now();

    const existingIndex = d.tracingResults.findIndex((t) => t.id === id);
    const prev = existingIndex >= 0 ? d.tracingResults[existingIndex] : undefined;

    const startedAt = Number.isFinite(input.startedAt) ? input.startedAt : prev?.startedAt ?? ts;
    const endedAt = Number.isFinite(input.endedAt) ? input.endedAt : prev?.endedAt ?? ts;

    const durationMs = clampInt(Math.max(0, endedAt - startedAt), 0, 10 * 60 * 1000);

    const maxAllowedDeviationPx =
        clampInt(
            input.maxAllowedDeviationPx ?? d.session.maxAllowedDeviationPx ?? prev?.maxAllowedDeviationPx ?? 40,
            10,
            200
        );

    const avgDeviationPx = clampNum(input.avgDeviationPx ?? prev?.avgDeviationPx ?? 0, 0, 1e9);

    const normalized = avgDeviationPx / Math.max(1, maxAllowedDeviationPx);
    const accuracyScorePct = clampNum(100 - normalized * 45, 0, 100);

    const nextItem: A6TracingResultDraft = {
        id,
        participantId: input.participantId,
        pathType: input.pathType,
        startedAt,
        endedAt,
        durationMs,
        userPath: sanitizeTracePointList(input.userPath ?? prev?.userPath),
        referencePath: sanitizeTracePointList(input.referencePath ?? prev?.referencePath),
        avgDeviationPx,
        maxAllowedDeviationPx,
        accuracyScorePct,
        video: input.video ?? prev?.video,
        geo: input.geo ?? prev?.geo,
        notes: trimOrUndef(input.notes) ?? prev?.notes,
        createdAt: prev ? prev.createdAt : ts,
        updatedAt: prev ? ts : undefined,
    };

    const nextResults =
        existingIndex >= 0
            ? d.tracingResults.map((t, i) => (i === existingIndex ? nextItem : t))
            : [...d.tracingResults, nextItem];

    const next: Activity6RunDraft = {
        ...d,
        tracingResults: nextResults,
        updatedAt: ts,
    };

    next.metrics = computeSessionMetrics(next);

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

export function removeActivity6TracingResult(runId: string, tracingId: string): Activity6RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 6 draft not found.");

    const nextResults = d.tracingResults.filter((t) => t.id !== tracingId);

    const next: Activity6RunDraft = {
        ...d,
        tracingResults: nextResults,
        updatedAt: now(),
    };

    next.metrics = computeSessionMetrics(next);

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

/* =========================================================
   Updates: Evidence + Reflection
========================================================= */

export function setActivity6SessionVideo(
    runId: string,
    video: EvidenceDraft | undefined
): Activity6RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 6 draft not found.");

    const next: Activity6RunDraft = {
        ...d,
        evidence: {
            ...d.evidence,
            sessionVideo: video,
        },
        updatedAt: now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

export function setActivity6Reflection(
    runId: string,
    patch: Partial<A6ReflectionDraft>
): Activity6RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 6 draft not found.");

    const nextRating =
        patch.rating == null ? d.reflection?.rating : clampInt(patch.rating, 1, 5);

    const next: Activity6RunDraft = {
        ...d,
        reflection: {
            ...d.reflection,
            ...patch,
            reflectionText: trimOrUndef(patch.reflectionText) ?? d.reflection?.reflectionText,
            rating: nextRating,
        },
        updatedAt: now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

/* =========================================================
   Explicit persistence / recovery helpers
========================================================= */

export async function saveActivity6RunDraftToLocalDb(
    runId: string,
    options?: PersistOptions
): Promise<Activity6RunDraft> {
    const current = drafts.get(runId);
    if (!current) throw new Error("Activity 6 draft not found.");

    await persistDraftInternal(current, options);
    return current;
}

export async function hydrateActivity6RunDraftFromLocalDb(
    runId: string
): Promise<Activity6RunDraft | null> {
    const record = await offlineDraftService.getDraftByRunId<Activity6RunDraft>(runId);
    if (!record) return null;

    const normalized = normalizeRecoveredActivity6Draft(record.payload);
    drafts.set(normalized.runId, normalized);

    await offlineDraftService.markRecovered(normalized.runId);

    return normalized;
}

export async function getLatestRecoverableActivity6RunDraft(params: {
    activityId: string;
    createdBy: string;
    teamId?: string | null;
}): Promise<Activity6RunDraft | null> {
    const record = await offlineDraftService.getLatestRecoverableDraft<Activity6RunDraft>({
        activityId: params.activityId,
        userId: params.createdBy,
        teamId: params.teamId ?? null,
    });

    if (!record) return null;

    const normalized = normalizeRecoveredActivity6Draft(record.payload);
    drafts.set(normalized.runId, normalized);

    await offlineDraftService.markRecovered(normalized.runId);

    return normalized;
}

export async function markActivity6RunDraftSubmittedInLocalDb(
    runId: string,
    remoteSubmissionId?: string | null
): Promise<void> {
    await offlineDraftService.markSubmitted({
        runId,
        remoteSubmissionId: remoteSubmissionId ?? null,
    });
}

export async function discardActivity6RunDraft(runId: string): Promise<void> {
    drafts.delete(runId);
    await offlineDraftService.discardDraft(runId);
}

/* =========================================================
   Validators
========================================================= */

export function validateA6Session(d: Activity6RunDraft): string | null {
    const s = d.session;

    if (s.participantCount < 1 || s.participantCount > 6) {
        return "Participant count must be between 1 and 6.";
    }
    if (!Array.isArray(s.participants) || s.participants.length !== s.participantCount) {
        return "Participants not initialized correctly. Please restart the session.";
    }

    if (!Number.isFinite(s.trialsPerHand) || s.trialsPerHand < 1 || s.trialsPerHand > 10) {
        return "Trials per hand must be between 1 and 10.";
    }

    if (!s.target) return "Target configuration missing.";
    if (s.target.delayMinSec < 0.5 || s.target.delayMaxSec > 10 || s.target.delayMaxSec <= s.target.delayMinSec) {
        return "Target delay range must be valid (e.g. 1.0–3.0 seconds).";
    }
    if (s.target.targetSizePx < 24 || s.target.targetSizePx > 120) {
        return "Target size must be between 24 and 120 px.";
    }

    if (!Number.isFinite(s.maxAllowedDeviationPx) || s.maxAllowedDeviationPx < 10 || s.maxAllowedDeviationPx > 200) {
        return "Max allowed deviation must be between 10 and 200 px.";
    }
    if (!Number.isFinite(s.accuracyThresholdPct) || s.accuracyThresholdPct < 0 || s.accuracyThresholdPct > 100) {
        return "Accuracy threshold must be between 0 and 100%.";
    }

    return null;
}

export function validateA6Prediction(d: Activity6RunDraft): string | null {
    const p = d.prediction;
    if (!p) return "Prediction is required before reaction trials.";
    if (!Number.isFinite(p.predictedReactionTimeMs)) return "Please enter your predicted reaction time (ms).";
    if (!p.predictedHandFaster) return "Please choose which hand you think will be faster.";
    return null;
}

export function validateA6MinimumTrials(d: Activity6RunDraft): string[] {
    const missing: string[] = [];

    const participants = d.session.participants ?? [];
    for (const p of participants) {
        const hasDom = d.reactionTrials.some((t) => t.participantId === p.id && t.hand === "dominant" && Number.isFinite(t.reactionTimeMs));
        const hasNon = d.reactionTrials.some((t) => t.participantId === p.id && t.hand === "non_dominant" && Number.isFinite(t.reactionTimeMs));
        const hasTrace = d.tracingResults.some((r) => r.participantId === p.id && Number.isFinite(r.accuracyScorePct));

        if (!hasDom) missing.push(`${p.name}: dominant-hand reaction trial`);
        if (!hasNon) missing.push(`${p.name}: non-dominant reaction trial`);
        if (!hasTrace) missing.push(`${p.name}: tracing challenge result`);
    }

    return missing;
}

export function validateA6Submission(d: Activity6RunDraft): string[] {
    const missing: string[] = [];

    const sessionErr = validateA6Session(d);
    if (sessionErr) missing.push(`Session: ${sessionErr}`);

    if (validateA6Prediction(d)) missing.push("Prediction entry");

    const hasAnyReaction = d.reactionTrials.some((t) => Number.isFinite(t.reactionTimeMs));
    if (!hasAnyReaction) missing.push("Recorded reaction time dataset");

    const hasAnyTracing = d.tracingResults.some((r) => Number.isFinite(r.accuracyScorePct));
    if (!hasAnyTracing) missing.push("Tracing challenge results");

    const minCoverage = validateA6MinimumTrials(d);
    if (minCoverage.length) missing.push(...minCoverage);

    if (!trimOrUndef(d.reflection?.reflectionText)) missing.push("Reflection text");
    if (d.reflection?.rating == null) missing.push("Rating (1–5)");

    if (d.session.gpsEnabled) {
        if (d.session.gpsPermission !== "granted") missing.push("GPS permission granted");
        if (!d.session.geo) missing.push("GPS coordinates captured");
    }

    return missing;
}

export function isA6LeaderboardEligible(d: Activity6RunDraft): boolean {
    const threshold = d.session.accuracyThresholdPct ?? 60;

    const participants = d.session.participants ?? [];
    if (participants.length === 0) return false;

    for (const p of participants) {
        const latest = [...d.tracingResults]
            .filter((r) => r.participantId === p.id)
            .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];

        if (!latest || !Number.isFinite(latest.accuracyScorePct)) return false;
        if (latest.accuracyScorePct < threshold) return false;
    }

    return true;
}

export function getA6LeaderboardMetrics(d: Activity6RunDraft): {
    eligible: boolean;
    teamMeanReactionTimeMs?: number;
    minTracingAccuracyPct?: number;
    avgTracingAccuracyPct?: number;
} {
    const eligible = isA6LeaderboardEligible(d);

    const m = d.metrics ?? computeSessionMetrics(d);
    const teamMean = m.teamMeanReactionTimeMs;

    const accuracies = (m.participantSummaries ?? [])
        .map((s) => s.tracingAccuracyPct)
        .filter((v): v is number => Number.isFinite(v));

    const minAcc = accuracies.length ? Math.min(...accuracies) : undefined;
    const avgAcc = accuracies.length ? mean(accuracies) : undefined;

    return {
        eligible,
        teamMeanReactionTimeMs: teamMean,
        minTracingAccuracyPct: minAcc,
        avgTracingAccuracyPct: avgAcc,
    };
}