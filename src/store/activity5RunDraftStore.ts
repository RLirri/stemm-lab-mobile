// src/store/activity5RunDraftStore.ts

import {offlineDraftService} from "../services/offlineDraftService";
import type {OfflineDraftStatus} from "../types/offlineDraft";

export type GpsPermissionStatus = "unknown" | "granted" | "denied";
export type A5TrialMode = "baseline" | "feedback";

/* =========================================================
   Guided movements (fixed set; must be >= 3)
========================================================= */

export type A5MovementType =
    | "slow_arm_extension"
    | "controlled_forward_stretch"
    | "coordinated_lateral_motion";

export type A5MovementSpec = {
    type: A5MovementType;
    title: string;
    durationSec: number;
    postureGuidance: string;
    visualKey?: string;
};

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
   Sensor dataset
========================================================= */

export type A5AccelSample = {
    tMs: number;
    ax: number;
    ay: number;
    az: number;
};

export type A5AccelDataset = {
    samples: A5AccelSample[];
    samplingHz: number;
    startedAt: number;
    platform?: "ios" | "android" | "unknown";
    osVersion?: string;
    deviceModel?: string;
};

/* =========================================================
   Computed metrics
========================================================= */

export type A5TrialMetrics = {
    durationSec: number;
    displacementMagnitudeCm: number;
    smoothnessIndex: number;
};

export type A5ImprovementDraft = {
    participantId: string;
    movementType: A5MovementType;
    baselineSmoothnessIndex: number;
    feedbackSmoothnessIndex: number;
    improvementScore: number;
};

/* =========================================================
   Participants
========================================================= */

export type A5ParticipantDraft = {
    id: string;
    name: string;
    createdAt: number;
    updatedAt?: number;
};

/* =========================================================
   Session + Trial + Run
========================================================= */

export type A5SessionDraft = {
    activityId: string;
    sessionLabel?: string;
    participantCount: number;
    participants: A5ParticipantDraft[];
    movements: A5MovementSpec[];
    samplingHz: number;
    movementDurationSec: number;
    feedbackEnabled: boolean;
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

export type A5TrialDraft = {
    id: string;
    participantId: string;
    movementType: A5MovementType;
    mode: A5TrialMode;
    dataset?: A5AccelDataset;
    metrics?: A5TrialMetrics;
    video?: EvidenceDraft;
    geo?: GeoPointDraft;
    notes?: string;
    createdAt: number;
    updatedAt?: number;
};

export type A5ReflectionDraft = {
    reflectionText?: string;
    rating?: number;
};

export type Activity5RunDraft = {
    runId: string;
    session: A5SessionDraft;
    prediction?: {
        predictedVibrationLevel?: string;
        predictedMostDifficultMovement?: string;
        createdAt: number;
        updatedAt?: number;
    };
    trials: A5TrialDraft[];
    improvements?: A5ImprovementDraft[];
    evidence?: {
        sessionVideo?: EvidenceDraft;
    };
    reflection?: A5ReflectionDraft;
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

const DRAFTS_KEY = "__STEMM_A5_RUN_DRAFTS__";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

const drafts: Map<string, Activity5RunDraft> =
    (g[DRAFTS_KEY] ?? new Map<string, Activity5RunDraft>()) as Map<string, Activity5RunDraft>;

g[DRAFTS_KEY] = drafts;

function now() {
    return Date.now();
}

function genRunId() {
    return `a5_${now()}_${Math.random().toString(16).slice(2)}`;
}

function genTrialId() {
    return `t_${now()}_${Math.random().toString(16).slice(2)}`;
}

function genParticipantId() {
    return `p_${now()}_${Math.random().toString(16).slice(2)}`;
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
   Defaults + Sanitize
========================================================= */

function defaultMovements(durationSec: number): A5MovementSpec[] {
    const d = clampInt(durationSec, 10, 60);

    return [
        {
            type: "slow_arm_extension",
            title: "Movement 1 – Slow arm extension",
            durationSec: d,
            postureGuidance:
                "Stand tall, shoulders relaxed. Extend your arm slowly and smoothly with control.",
            visualKey: "a5_m1_arm_extension",
        },
        {
            type: "controlled_forward_stretch",
            title: "Movement 2 – Controlled forward stretch",
            durationSec: d,
            postureGuidance:
                "Feet shoulder-width apart. Hinge at hips gently, keep back neutral, move slowly.",
            visualKey: "a5_m2_forward_stretch",
        },
        {
            type: "coordinated_lateral_motion",
            title: "Movement 3 – Coordinated lateral motion",
            durationSec: d,
            postureGuidance:
                "Shift weight left-to-right smoothly. Keep core engaged and motion steady.",
            visualKey: "a5_m3_lateral_motion",
        },
    ];
}

function makeDefaultParticipant(index: number): A5ParticipantDraft {
    const ts = now();
    return {
        id: genParticipantId(),
        name: `Participant ${index + 1}`,
        createdAt: ts,
    };
}

function buildParticipants(count: number): A5ParticipantDraft[] {
    return Array.from({length: count}, (_, i) => makeDefaultParticipant(i));
}

function sanitizeParticipant(p: A5ParticipantDraft): A5ParticipantDraft {
    return {
        ...p,
        name: trimOrUndef(p.name) ?? p.name,
    };
}

function normalizeParticipantsForCount(
    existing: A5ParticipantDraft[],
    nextCount: number
): A5ParticipantDraft[] {
    const list = [...(existing ?? [])];

    let next = list.slice(0, nextCount);

    for (let i = next.length; i < nextCount; i++) {
        next.push(makeDefaultParticipant(i));
    }

    return next.map(sanitizeParticipant);
}

function sanitizeAccelDataset(ds: A5AccelDataset | undefined): A5AccelDataset | undefined {
    if (!ds) return undefined;

    const samplingHz = clampInt(ds.samplingHz ?? 50, 10, 100);

    const samples = Array.isArray(ds.samples)
        ? ds.samples
            .filter((s) => s && Number.isFinite(s.tMs))
            .map((s) => ({
                tMs: clampInt(s.tMs, 0, 10 * 60 * 1000),
                ax: Number.isFinite(s.ax) ? s.ax : 0,
                ay: Number.isFinite(s.ay) ? s.ay : 0,
                az: Number.isFinite(s.az) ? s.az : 0,
            }))
        : [];

    return {
        ...ds,
        samplingHz,
        startedAt: Number.isFinite(ds.startedAt) ? ds.startedAt : now(),
        samples,
        platform: ds.platform ?? "unknown",
        osVersion: trimOrUndef(ds.osVersion),
        deviceModel: trimOrUndef(ds.deviceModel),
    };
}

function sanitizeMetrics(m: A5TrialMetrics | undefined): A5TrialMetrics | undefined {
    if (!m) return undefined;
    return {
        durationSec: clampNum(m.durationSec ?? 0, 0, 600),
        displacementMagnitudeCm: clampNum(m.displacementMagnitudeCm ?? 0, 0, 100000),
        smoothnessIndex: clampNum(m.smoothnessIndex ?? 0, 0, 1e12),
    };
}

function recomputeImprovements(trials: A5TrialDraft[]): A5ImprovementDraft[] {
    const map = new Map<
        string,
        { baseline?: A5TrialDraft; feedback?: A5TrialDraft }
    >();

    for (const t of trials) {
        const key = `${t.participantId}::${t.movementType}`;
        const cur = map.get(key) ?? {};
        if (t.mode === "baseline") cur.baseline = t;
        if (t.mode === "feedback") cur.feedback = t;
        map.set(key, cur);
    }

    const out: A5ImprovementDraft[] = [];
    for (const [, pair] of map.entries()) {
        if (!pair.baseline?.metrics || !pair.feedback?.metrics) continue;

        const participantId = pair.baseline.participantId;
        const movementType = pair.baseline.movementType;

        const baselineSmoothnessIndex = pair.baseline.metrics.smoothnessIndex;
        const feedbackSmoothnessIndex = pair.feedback.metrics.smoothnessIndex;
        const improvementScore = baselineSmoothnessIndex - feedbackSmoothnessIndex;

        out.push({
            participantId,
            movementType,
            baselineSmoothnessIndex,
            feedbackSmoothnessIndex,
            improvementScore,
        });
    }

    return out.sort((a, b) => b.improvementScore - a.improvementScore);
}

function normalizeRecoveredActivity5Draft(payload: Activity5RunDraft): Activity5RunDraft {
    const participantCount = clampInt(payload.session?.participantCount ?? 1, 1, 6);
    const movementDurationSec = clampInt(payload.session?.movementDurationSec ?? 20, 10, 60);

    const normalizedTrials = Array.isArray(payload.trials) ? payload.trials : [];

    return {
        ...payload,
        session: {
            ...payload.session,
            participantCount,
            participants: normalizeParticipantsForCount(payload.session?.participants ?? [], participantCount),
            movements: Array.isArray(payload.session?.movements) && payload.session.movements.length >= 3
                ? payload.session.movements.map((m) => ({
                    ...m,
                    durationSec: clampInt(m.durationSec ?? movementDurationSec, 10, 60),
                }))
                : defaultMovements(movementDurationSec),
            samplingHz: clampInt(payload.session?.samplingHz ?? 50, 10, 100),
            movementDurationSec,
            feedbackEnabled: payload.session?.feedbackEnabled ?? true,
            gpsEnabled: payload.session?.gpsEnabled ?? true,
            gpsPermission: payload.session?.gpsPermission ?? "unknown",
        },
        trials: normalizedTrials,
        improvements: Array.isArray(payload.improvements) ? payload.improvements : recomputeImprovements(normalizedTrials),
    };
}

async function persistDraftInternal(
    draft: Activity5RunDraft,
    options?: PersistOptions
): Promise<void> {
    await offlineDraftService.saveDraft<Activity5RunDraft>({
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
    draft: Activity5RunDraft,
    options?: PersistOptions
): void {
    void persistDraftInternal(draft, options).catch((error) => {
        console.error("[activity5RunDraftStore] Failed to persist draft", {
            runId: draft.runId,
            error,
        });
    });
}

/* =========================================================
   CRUD: Run draft
========================================================= */

export function createActivity5RunDraft(params: {
    activityId: string;
    createdBy?: string;
    participantCount?: number;
    samplingHz?: number;
    movementDurationSec?: number;
    gpsEnabled?: boolean;
    feedbackEnabled?: boolean;
    sessionLabel?: string;
}): Activity5RunDraft {
    const runId = genRunId();

    const participantCount = clampInt(params.participantCount ?? 1, 1, 6);
    const samplingHz = clampInt(params.samplingHz ?? 50, 10, 100);
    const movementDurationSec = clampInt(params.movementDurationSec ?? 20, 10, 60);

    const d: Activity5RunDraft = {
        runId,
        session: {
            activityId: params.activityId,
            sessionLabel: trimOrUndef(params.sessionLabel),
            participantCount,
            participants: buildParticipants(participantCount),
            movements: defaultMovements(movementDurationSec),
            samplingHz,
            movementDurationSec,
            feedbackEnabled: params.feedbackEnabled ?? true,
            startedAt: now(),
            gpsEnabled: params.gpsEnabled ?? true,
            gpsPermission: "unknown",
        },
        prediction: undefined,
        trials: [],
        improvements: [],
        evidence: undefined,
        reflection: undefined,
        createdBy: params.createdBy,
        updatedAt: now(),
    };

    drafts.set(runId, d);
    fireAndForgetPersist(d);
    return d;
}

export function getActivity5RunDraft(runId: string): Activity5RunDraft | null {
    return drafts.get(runId) ?? null;
}

export function getAllActivity5RunDrafts(): Activity5RunDraft[] {
    return Array.from(drafts.values());
}

export function clearActivity5RunDraft(runId: string) {
    drafts.delete(runId);
}

/* =========================================================
   Updates: Session + Participants
========================================================= */

export function updateActivity5Session(
    runId: string,
    patch: Partial<A5SessionDraft>
): Activity5RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 5 draft not found.");

    const nextParticipantCount =
        patch.participantCount != null
            ? clampInt(patch.participantCount, 1, 6)
            : d.session.participantCount;

    const nextSamplingHz =
        patch.samplingHz != null ? clampInt(patch.samplingHz, 10, 100) : d.session.samplingHz;

    const nextDuration =
        patch.movementDurationSec != null
            ? clampInt(patch.movementDurationSec, 10, 60)
            : d.session.movementDurationSec;

    const incomingParticipants = patch.participants ?? d.session.participants ?? [];
    const nextParticipants = normalizeParticipantsForCount(incomingParticipants, nextParticipantCount);

    const nextMovements =
        patch.movements != null
            ? patch.movements
            : d.session.movements.map((m) => ({...m, durationSec: nextDuration}));

    const next: Activity5RunDraft = {
        ...d,
        session: {
            ...d.session,
            ...patch,
            sessionLabel: trimOrUndef(patch.sessionLabel ?? d.session.sessionLabel),
            participantCount: nextParticipantCount,
            participants: nextParticipants,
            samplingHz: nextSamplingHz,
            movementDurationSec: nextDuration,
            movements: nextMovements,
        },
        updatedAt: now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

export function updateActivity5Participant(
    runId: string,
    participantId: string,
    patch: Partial<Omit<A5ParticipantDraft, "id" | "createdAt">>
): Activity5RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 5 draft not found.");

    const list = d.session.participants ?? [];
    const idx = list.findIndex((p) => p.id === participantId);
    if (idx < 0) throw new Error("Participant not found.");

    const ts = now();

    const nextParticipants = list.map((p) => {
        if (p.id !== participantId) return p;

        const merged: A5ParticipantDraft = {
            ...p,
            ...patch,
            id: p.id,
            createdAt: p.createdAt,
            updatedAt: ts,
        };

        return sanitizeParticipant(merged);
    });

    const next: Activity5RunDraft = {
        ...d,
        session: {
            ...d.session,
            participants: nextParticipants,
        },
        updatedAt: ts,
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

/* =========================================================
   Updates: Prediction
========================================================= */

export function setActivity5Prediction(
    runId: string,
    patch: Partial<NonNullable<Activity5RunDraft["prediction"]>>
): Activity5RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 5 draft not found.");

    const existing = d.prediction;

    const nextPred = {
        predictedVibrationLevel: existing?.predictedVibrationLevel,
        predictedMostDifficultMovement: existing?.predictedMostDifficultMovement,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
        ...patch,
    };

    nextPred.predictedVibrationLevel = trimOrUndef(nextPred.predictedVibrationLevel);
    nextPred.predictedMostDifficultMovement = trimOrUndef(nextPred.predictedMostDifficultMovement);

    const next: Activity5RunDraft = {
        ...d,
        prediction: nextPred,
        updatedAt: now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

/* =========================================================
   Updates: Trials
========================================================= */

export function upsertActivity5Trial(
    runId: string,
    input: {
        id?: string;
        participantId: string;
        movementType: A5MovementType;
        mode: A5TrialMode;
        dataset?: A5AccelDataset;
        metrics?: A5TrialMetrics;
        video?: EvidenceDraft;
        geo?: GeoPointDraft;
        notes?: string;
    }
): Activity5RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 5 draft not found.");

    if (!d.prediction) {
        throw new Error("Prediction is required before starting trials (FR-A5-07).");
    }

    const hasParticipant = d.session.participants.some((p) => p.id === input.participantId);
    if (!hasParticipant) throw new Error("Participant not found for this session.");

    const id = input.id ?? genTrialId();
    const existingIndex = d.trials.findIndex((t) => t.id === id);
    const ts = now();

    const prev = existingIndex >= 0 ? d.trials[existingIndex] : undefined;

    const nextItem: A5TrialDraft = {
        id,
        participantId: input.participantId,
        movementType: input.movementType,
        mode: input.mode,
        createdAt: prev ? prev.createdAt : ts,
        updatedAt: prev ? ts : undefined,
        dataset: input.dataset !== undefined ? sanitizeAccelDataset(input.dataset) : prev?.dataset,
        metrics: input.metrics !== undefined ? sanitizeMetrics(input.metrics) : prev?.metrics,
        video: input.video ?? prev?.video,
        geo: input.geo ?? prev?.geo,
        notes: trimOrUndef(input.notes) ?? prev?.notes,
    };

    const nextTrials =
        existingIndex >= 0 ? d.trials.map((t, i) => (i === existingIndex ? nextItem : t)) : [...d.trials, nextItem];

    const nextImprovements = recomputeImprovements(nextTrials);

    const next: Activity5RunDraft = {
        ...d,
        trials: nextTrials,
        improvements: nextImprovements,
        updatedAt: ts,
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

export function removeActivity5Trial(runId: string, trialId: string): Activity5RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 5 draft not found.");

    const nextTrials = d.trials.filter((t) => t.id !== trialId);
    const nextImprovements = recomputeImprovements(nextTrials);

    const next: Activity5RunDraft = {
        ...d,
        trials: nextTrials,
        improvements: nextImprovements,
        updatedAt: now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

/* =========================================================
   Updates: Evidence + Reflection
========================================================= */

export function setActivity5SessionVideo(
    runId: string,
    video: EvidenceDraft | undefined
): Activity5RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 5 draft not found.");

    const next: Activity5RunDraft = {
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

export function setActivity5Reflection(
    runId: string,
    patch: Partial<A5ReflectionDraft>
): Activity5RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 5 draft not found.");

    const nextRating =
        patch.rating == null
            ? d.reflection?.rating
            : clampInt(patch.rating, 1, 5);

    const next: Activity5RunDraft = {
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

export async function saveActivity5RunDraftToLocalDb(
    runId: string,
    options?: PersistOptions
): Promise<Activity5RunDraft> {
    const current = drafts.get(runId);
    if (!current) throw new Error("Activity 5 draft not found.");

    await persistDraftInternal(current, options);
    return current;
}

export async function hydrateActivity5RunDraftFromLocalDb(
    runId: string
): Promise<Activity5RunDraft | null> {
    const record = await offlineDraftService.getDraftByRunId<Activity5RunDraft>(runId);
    if (!record) return null;

    const normalized = normalizeRecoveredActivity5Draft(record.payload);
    drafts.set(normalized.runId, normalized);

    await offlineDraftService.markRecovered(normalized.runId);

    return normalized;
}

export async function getLatestRecoverableActivity5RunDraft(params: {
    activityId: string;
    createdBy: string;
    teamId?: string | null;
}): Promise<Activity5RunDraft | null> {
    const record = await offlineDraftService.getLatestRecoverableDraft<Activity5RunDraft>({
        activityId: params.activityId,
        userId: params.createdBy,
        teamId: params.teamId ?? null,
    });

    if (!record) return null;

    const normalized = normalizeRecoveredActivity5Draft(record.payload);
    drafts.set(normalized.runId, normalized);

    await offlineDraftService.markRecovered(normalized.runId);

    return normalized;
}

export async function markActivity5RunDraftSubmittedInLocalDb(
    runId: string,
    remoteSubmissionId?: string | null
): Promise<void> {
    await offlineDraftService.markSubmitted({
        runId,
        remoteSubmissionId: remoteSubmissionId ?? null,
    });
}

export async function discardActivity5RunDraft(runId: string): Promise<void> {
    drafts.delete(runId);
    await offlineDraftService.discardDraft(runId);
}

/* =========================================================
   Validators
========================================================= */

export function validateA5Session(d: Activity5RunDraft): string | null {
    const s = d.session;

    if (s.participantCount < 1 || s.participantCount > 6) {
        return "Participant count must be between 1 and 6.";
    }

    if (!Array.isArray(s.participants) || s.participants.length !== s.participantCount) {
        return "Participants not initialized correctly. Please restart the session.";
    }

    if (!Array.isArray(s.movements) || s.movements.length < 3) {
        return "Movements must include at least 3 guided instructions.";
    }

    if (!Number.isFinite(s.samplingHz) || s.samplingHz < 10 || s.samplingHz > 100) {
        return "Sampling rate must be between 10 and 100 Hz.";
    }

    if (!Number.isFinite(s.movementDurationSec) || s.movementDurationSec < 10 || s.movementDurationSec > 60) {
        return "Movement duration must be between 10 and 60 seconds.";
    }

    return null;
}

export function validateA5Prediction(d: Activity5RunDraft): string | null {
    const p = d.prediction;
    if (!p) return "Prediction is required before measurement trials.";
    if (!trimOrUndef(p.predictedVibrationLevel)) return "Please enter a predicted vibration level.";
    if (!trimOrUndef(p.predictedMostDifficultMovement)) return "Please choose the predicted hardest movement.";
    return null;
}

export function validateA5Submission(d: Activity5RunDraft): string[] {
    const missing: string[] = [];

    if (validateA5Prediction(d)) missing.push("Prediction entry");

    const hasAnyDataset = d.trials.some((t) => t.dataset && Array.isArray(t.dataset.samples) && t.dataset.samples.length > 0);
    if (!hasAnyDataset) missing.push("Recorded sensor dataset (accelerometer)");

    if (!d.evidence?.sessionVideo?.uri) missing.push("Session video evidence");

    if (!trimOrUndef(d.reflection?.reflectionText)) missing.push("Reflection text");
    if (d.reflection?.rating == null) missing.push("Rating (1–5)");

    if (d.session.gpsEnabled) {
        if (d.session.gpsPermission !== "granted") missing.push("GPS permission granted");
        if (!d.session.geo) missing.push("GPS coordinates captured");
    }

    const hasBaseline = d.trials.some((t) => t.mode === "baseline" && t.metrics);
    const hasFeedback = d.trials.some((t) => t.mode === "feedback" && t.metrics);
    if (!hasBaseline) missing.push("At least 1 Baseline trial with computed metrics");
    if (!hasFeedback) missing.push("At least 1 Feedback trial with computed metrics");

    return missing;
}

export function getA5BestImprovement(d: Activity5RunDraft): {
    bestScore: number;
    participantId?: string;
    movementType?: A5MovementType;
} {
    const list = d.improvements ?? recomputeImprovements(d.trials);
    if (list.length === 0) return {bestScore: 0};

    const best = list[0];
    return {
        bestScore: best.improvementScore,
        participantId: best.participantId,
        movementType: best.movementType,
    };
}