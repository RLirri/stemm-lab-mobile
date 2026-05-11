// src/store/activity4RunDraftStore.ts

import {offlineDraftService} from "../services/offlineDraftService";
import type {OfflineDraftStatus} from "../types/offlineDraft";

export type A4MaterialContext = "paper" | "plastic";
export type GpsPermissionStatus = "unknown" | "granted" | "denied";
export type A4FinalScoreMethod = "sensor" | "manual_deg" | "manual_cm";

export type A4ValidationDraft = {
    delta: number;
    flagged: boolean;
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
   Design metadata
========================================================= */

export type A4DesignDraft = {
    index: number;
    name?: string;
    foldCount?: number;
    pillarCount?: number;
    layers?: number;
    baseWidthCm?: number;
    baseLengthCm?: number;
    notes?: string;
    createdAt: number;
    updatedAt?: number;
};

/* =========================================================
   Session + Measurement + Run
========================================================= */

export type A4SessionDraft = {
    activityId: string;
    designCount: number;
    designs: A4DesignDraft[];
    startedAt: number;
    endsAt?: number;
    surfaceContext?: A4MaterialContext;
    vibrationDurationSec: number;
    gpsEnabled: boolean;
    geo?: {
        lat: number;
        lng: number;
        accuracyM?: number;
        capturedAt: number;
    };
    gpsPermission: GpsPermissionStatus;
};

export type A4MeasurementDraft = {
    id: string;
    designIndex: number;
    magnitudeSamples?: number[];
    movementScore?: number;
    manualOutcomeDeg?: number;
    manualOutcomeCm?: number;
    finalScore?: number;
    finalMethod?: A4FinalScoreMethod;
    validation?: A4ValidationDraft;
    video?: EvidenceDraft;
    geo?: GeoPointDraft;
    notes?: string;
    createdAt: number;
    updatedAt?: number;
};

export type A4ReflectionDraft = {
    reflectionText?: string;
    rating?: number;
};

export type Activity4RunDraft = {
    runId: string;
    session: A4SessionDraft;
    prediction?: {
        predictedBestDesignIndex?: number;
        predictedNotes?: string;
        createdAt: number;
        updatedAt?: number;
    };
    measurements: A4MeasurementDraft[];
    evidence?: {
        sessionVideo?: EvidenceDraft;
    };
    reflection?: A4ReflectionDraft;
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

const DRAFTS_KEY = "__STEMM_A4_RUN_DRAFTS__";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

const drafts: Map<string, Activity4RunDraft> =
    (g[DRAFTS_KEY] ?? new Map<string, Activity4RunDraft>()) as Map<string, Activity4RunDraft>;

g[DRAFTS_KEY] = drafts;

function now() {
    return Date.now();
}

function genRunId() {
    return `a4_${now()}_${Math.random().toString(16).slice(2)}`;
}

function genMeasurementId() {
    return `m_${now()}_${Math.random().toString(16).slice(2)}`;
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNum(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function timestampToIso(timestampMs: number): string {
    return new Date(timestampMs).toISOString();
}

/* =========================================================
   Defaults + Sanitize
========================================================= */

function makeDefaultDesign(index: number): A4DesignDraft {
    const ts = now();
    return {
        index,
        name: `Design ${index + 1}`,
        createdAt: ts,
    };
}

function buildDesigns(count: number): A4DesignDraft[] {
    return Array.from({length: count}, (_, i) => makeDefaultDesign(i));
}

function sanitizeDesign(d: A4DesignDraft): A4DesignDraft {
    return {
        ...d,
        name: d.name?.trim() ? d.name.trim() : d.name,
        foldCount: d.foldCount == null ? undefined : clampInt(d.foldCount, 0, 60),
        pillarCount: d.pillarCount == null ? undefined : clampInt(d.pillarCount, 0, 30),
        layers: d.layers == null ? undefined : clampInt(d.layers, 1, 10),
        baseWidthCm: d.baseWidthCm == null ? undefined : clampNum(d.baseWidthCm, 1, 200),
        baseLengthCm: d.baseLengthCm == null ? undefined : clampNum(d.baseLengthCm, 1, 200),
        notes: d.notes?.trim() ? d.notes.trim() : undefined,
    };
}

function normalizeDesignsForCount(existing: A4DesignDraft[], nextCount: number): A4DesignDraft[] {
    const sorted = [...(existing ?? [])].sort((a, b) => a.index - b.index);

    let next = sorted.filter((x) => x.index < nextCount);

    for (let i = next.length; i < nextCount; i++) {
        next.push(makeDefaultDesign(i));
    }

    next = next.map((x, i) => ({...x, index: i}));

    return next.map(sanitizeDesign);
}

function normalizeRecoveredActivity4Draft(payload: Activity4RunDraft): Activity4RunDraft {
    const count = clampInt(payload.session?.designCount ?? 3, 3, 8);

    return {
        ...payload,
        session: {
            ...payload.session,
            designCount: count,
            designs: normalizeDesignsForCount(payload.session?.designs ?? [], count),
            vibrationDurationSec: clampInt(payload.session?.vibrationDurationSec ?? 10, 1, 60),
            gpsEnabled: payload.session?.gpsEnabled ?? true,
            gpsPermission: payload.session?.gpsPermission ?? "unknown",
        },
        measurements: Array.isArray(payload.measurements) ? payload.measurements : [],
    };
}

async function persistDraftInternal(
    draft: Activity4RunDraft,
    options?: PersistOptions
): Promise<void> {
    await offlineDraftService.saveDraft<Activity4RunDraft>({
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
    draft: Activity4RunDraft,
    options?: PersistOptions
): void {
    void persistDraftInternal(draft, options).catch((error) => {
        console.error("[activity4RunDraftStore] Failed to persist draft", {
            runId: draft.runId,
            error,
        });
    });
}

/* =========================================================
   CRUD: Run draft
========================================================= */

export function createActivity4RunDraft(params: {
    activityId: string;
    createdBy?: string;
    designCount?: number;
    gpsEnabled?: boolean;
}): Activity4RunDraft {
    const runId = genRunId();
    const count = clampInt(params.designCount ?? 3, 3, 8);

    const d: Activity4RunDraft = {
        runId,
        session: {
            activityId: params.activityId,
            designCount: count,
            designs: buildDesigns(count),
            startedAt: now(),
            vibrationDurationSec: 10,
            gpsEnabled: params.gpsEnabled ?? true,
            gpsPermission: "unknown",
        },
        measurements: [],
        evidence: undefined,
        reflection: undefined,
        createdBy: params.createdBy,
        updatedAt: now(),
    };

    drafts.set(runId, d);
    fireAndForgetPersist(d);
    return d;
}

export function getActivity4RunDraft(runId: string): Activity4RunDraft | null {
    return drafts.get(runId) ?? null;
}

export function getAllActivity4RunDrafts(): Activity4RunDraft[] {
    return Array.from(drafts.values());
}

export function clearActivity4RunDraft(runId: string) {
    drafts.delete(runId);
}

/* =========================================================
   Updates: Session + Designs
========================================================= */

export function updateActivity4Session(runId: string, patch: Partial<A4SessionDraft>): Activity4RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 4 draft not found.");

    const nextCount =
        patch.designCount != null ? clampInt(patch.designCount, 3, 8) : d.session.designCount;

    const nextVibration =
        patch.vibrationDurationSec != null
            ? clampInt(patch.vibrationDurationSec, 1, 60)
            : d.session.vibrationDurationSec;

    const incomingDesigns = patch.designs ?? d.session.designs ?? [];
    const nextDesigns = normalizeDesignsForCount(incomingDesigns, nextCount);

    const next: Activity4RunDraft = {
        ...d,
        session: {
            ...d.session,
            ...patch,
            designCount: nextCount,
            vibrationDurationSec: nextVibration,
            designs: nextDesigns,
        },
        updatedAt: now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

export function updateActivity4Design(
    runId: string,
    designIndex: number,
    patch: Partial<Omit<A4DesignDraft, "index" | "createdAt">>
): Activity4RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 4 draft not found.");

    const designs = d.session.designs ?? [];
    if (designIndex < 0 || designIndex >= designs.length) throw new Error("Design index out of range.");

    const ts = now();

    const nextDesigns = designs.map((x) => {
        if (x.index !== designIndex) return x;

        const merged: A4DesignDraft = {
            ...x,
            ...patch,
            index: x.index,
            createdAt: x.createdAt,
            updatedAt: ts,
        };

        return sanitizeDesign(merged);
    });

    const next: Activity4RunDraft = {
        ...d,
        session: {
            ...d.session,
            designs: nextDesigns,
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

export function setActivity4Prediction(
    runId: string,
    patch: Partial<NonNullable<Activity4RunDraft["prediction"]>>
): Activity4RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 4 draft not found.");

    const existing = d.prediction;

    const nextPred = {
        predictedBestDesignIndex: existing?.predictedBestDesignIndex,
        predictedNotes: existing?.predictedNotes,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
        ...patch,
    };

    const next: Activity4RunDraft = {
        ...d,
        prediction: nextPred,
        updatedAt: now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

/* =========================================================
   Updates: Measurements
========================================================= */

export function upsertActivity4Measurement(
    runId: string,
    input: {
        id?: string;
        designIndex: number;
        magnitudeSamples?: number[];
        movementScore?: number;
        manualOutcomeDeg?: number;
        manualOutcomeCm?: number;
        finalScore?: number;
        finalMethod?: A4FinalScoreMethod;
        validation?: A4ValidationDraft;
        geo?: GeoPointDraft;
        notes?: string;
        video?: EvidenceDraft;
    }
): Activity4RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 4 draft not found.");

    const id = input.id ?? genMeasurementId();
    const existingIndex = d.measurements.findIndex((m) => m.id === id);
    const ts = now();

    const prev = existingIndex >= 0 ? d.measurements[existingIndex] : undefined;

    const nextItem: A4MeasurementDraft = {
        id,
        designIndex: input.designIndex,
        createdAt: prev ? prev.createdAt : ts,
        updatedAt: prev ? ts : undefined,
        magnitudeSamples: input.magnitudeSamples ?? prev?.magnitudeSamples,
        movementScore: input.movementScore ?? prev?.movementScore,
        manualOutcomeDeg: input.manualOutcomeDeg ?? prev?.manualOutcomeDeg,
        manualOutcomeCm: input.manualOutcomeCm ?? prev?.manualOutcomeCm,
        finalScore: input.finalScore ?? prev?.finalScore,
        finalMethod: input.finalMethod ?? prev?.finalMethod,
        validation: input.validation ?? prev?.validation,
        video: input.video ?? prev?.video,
        geo: input.geo ?? prev?.geo,
        notes: input.notes?.trim() ? input.notes.trim() : (prev?.notes ?? undefined),
    };

    const nextMeasurements =
        existingIndex >= 0
            ? d.measurements.map((m, i) => (i === existingIndex ? nextItem : m))
            : [...d.measurements, nextItem];

    const next: Activity4RunDraft = {
        ...d,
        measurements: nextMeasurements,
        updatedAt: ts,
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

export function removeActivity4Measurement(runId: string, measurementId: string): Activity4RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 4 draft not found.");

    const next: Activity4RunDraft = {
        ...d,
        measurements: d.measurements.filter((m) => m.id !== measurementId),
        updatedAt: now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);
    return next;
}

/* =========================================================
   Updates: Evidence + Reflection
========================================================= */

export function setActivity4SessionVideo(runId: string, video: EvidenceDraft | undefined): Activity4RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 4 draft not found.");

    const next: Activity4RunDraft = {
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

export function setActivity4Reflection(
    runId: string,
    patch: Partial<A4ReflectionDraft>
): Activity4RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 4 draft not found.");

    const next: Activity4RunDraft = {
        ...d,
        reflection: {
            ...d.reflection,
            ...patch,
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

export async function saveActivity4RunDraftToLocalDb(
    runId: string,
    options?: PersistOptions
): Promise<Activity4RunDraft> {
    const current = drafts.get(runId);
    if (!current) throw new Error("Activity 4 draft not found.");

    await persistDraftInternal(current, options);
    return current;
}

export async function hydrateActivity4RunDraftFromLocalDb(
    runId: string
): Promise<Activity4RunDraft | null> {
    const record = await offlineDraftService.getDraftByRunId<Activity4RunDraft>(runId);
    if (!record) return null;

    const normalized = normalizeRecoveredActivity4Draft(record.payload);
    drafts.set(normalized.runId, normalized);

    await offlineDraftService.markRecovered(normalized.runId);

    return normalized;
}

export async function getLatestRecoverableActivity4RunDraft(params: {
    activityId: string;
    createdBy: string;
    teamId?: string | null;
}): Promise<Activity4RunDraft | null> {
    const record = await offlineDraftService.getLatestRecoverableDraft<Activity4RunDraft>({
        activityId: params.activityId,
        userId: params.createdBy,
        teamId: params.teamId ?? null,
    });

    if (!record) return null;

    const normalized = normalizeRecoveredActivity4Draft(record.payload);
    drafts.set(normalized.runId, normalized);

    await offlineDraftService.markRecovered(normalized.runId);

    return normalized;
}

export async function markActivity4RunDraftSubmittedInLocalDb(
    runId: string,
    remoteSubmissionId?: string | null
): Promise<void> {
    await offlineDraftService.markSubmitted({
        runId,
        remoteSubmissionId: remoteSubmissionId ?? null,
    });
}

export async function discardActivity4RunDraft(runId: string): Promise<void> {
    drafts.delete(runId);
    await offlineDraftService.discardDraft(runId);
}

/* =========================================================
   Validators
========================================================= */

export function validateA4Session(d: Activity4RunDraft): string | null {
    const s = d.session;

    if (s.designCount < 3 || s.designCount > 8) return "Design count must be between 3 and 8.";

    if (!Array.isArray(s.designs) || s.designs.length !== s.designCount) {
        return "Design metadata not initialized correctly. Please restart the session.";
    }

    if (!Number.isFinite(s.vibrationDurationSec) || s.vibrationDurationSec <= 0) {
        return "Vibration duration must be a positive number.";
    }

    return null;
}