// src/store/activity3RunDraftStore.ts

import {offlineDraftService} from "../services/offlineDraftService";
import type {OfflineDraftStatus} from "../types/offlineDraft";

export type FanDistanceCm = 15 | 30 | 45;
export type FanMaterial = "paper" | "cardboard";
export type SurfaceContext = "table" | "floor";
export type FanFoldType = "flat" | "folded" | "pleated";

/* =========================================================
   Design metadata (controls for the "fan design → airflow" question)
========================================================= */

export type A3FanDesignDraft = {
    index: number;
    name?: string;
    hasFolds?: boolean;
    foldType?: FanFoldType;
    foldCount?: number;
    layers?: number;
    widthCm?: number;
    heightCm?: number;
    notes?: string;
    createdAt: number;
    updatedAt?: number;
};

/* =========================================================
   Evidence + GPS
========================================================= */

export type GpsPermissionStatus = "unknown" | "granted" | "denied";

export type EvidenceDraft = {
    uri: string;
    createdAt: number;
};

export type GeoPointDraft = {
    lat: number;
    lng: number;
    accuracyM?: number;
};

/* =========================================================
   Session + Measurement + Run
========================================================= */

export type A3SessionDraft = {
    activityId: string;
    fanDesigns: A3FanDesignDraft[];
    startedAt: number;
    endsAt?: number;
    surfaceContext?: SurfaceContext;
    fanDesignCount: number;
    advancedMode: boolean;
    stiffnessK?: number;
    gpsEnabled: boolean;
    gpsPermission: GpsPermissionStatus;
};

export type A3MeasurementDraft = {
    id: string;
    designIndex: number;
    distanceCm: FanDistanceCm;
    material: FanMaterial;
    video?: EvidenceDraft;
    bendAngleDeg?: number;
    geo?: GeoPointDraft;
    notes?: string;
    createdAt: number;
    updatedAt?: number;
};

export type A3ReflectionDraft = {
    reflectionText?: string;
    rating?: number;
};

export type Activity3RunDraft = {
    runId: string;
    session: A3SessionDraft;
    prediction?: {
        predictedBestDesignIndex?: number;
        predictedBestDistanceCm?: FanDistanceCm;
        predictedNotes?: string;
        createdAt: number;
        updatedAt?: number;
    };
    measurements: A3MeasurementDraft[];
    evidence?: {
        sessionVideo?: EvidenceDraft;
    };
    reflection?: A3ReflectionDraft;
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

const DRAFTS_KEY = "__STEMM_A3_RUN_DRAFTS__";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

const drafts: Map<string, Activity3RunDraft> =
    (g[DRAFTS_KEY] ?? new Map<string, Activity3RunDraft>()) as Map<string, Activity3RunDraft>;

g[DRAFTS_KEY] = drafts;

function now() {
    return Date.now();
}

function genRunId() {
    return `a3_${now()}_${Math.random().toString(16).slice(2)}`;
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

function makeDefaultDesign(index: number): A3FanDesignDraft {
    const ts = now();
    return {
        index,
        name: `Design ${index + 1}`,
        createdAt: ts,
    };
}

function buildDesigns(count: number): A3FanDesignDraft[] {
    return Array.from({length: count}, (_, i) => makeDefaultDesign(i));
}

function sanitizeDesign(d: A3FanDesignDraft): A3FanDesignDraft {
    return {
        ...d,
        name: d.name?.trim() ? d.name.trim() : d.name,
        foldCount: d.foldCount == null ? undefined : clampInt(d.foldCount, 0, 60),
        layers: d.layers == null ? undefined : clampInt(d.layers, 1, 5),
        widthCm: d.widthCm == null ? undefined : clampNum(d.widthCm, 1, 200),
        heightCm: d.heightCm == null ? undefined : clampNum(d.heightCm, 1, 200),
        notes: d.notes?.trim() ? d.notes.trim() : undefined,
    };
}

function normalizeDesignsForCount(existing: A3FanDesignDraft[], nextCount: number): A3FanDesignDraft[] {
    const sorted = [...(existing ?? [])].sort((a, b) => a.index - b.index);

    let next = sorted.filter((x) => x.index < nextCount);

    for (let i = next.length; i < nextCount; i++) {
        next.push(makeDefaultDesign(i));
    }

    next = next.map((x, i) => ({...x, index: i}));

    return next.map(sanitizeDesign);
}

function normalizeRecoveredActivity3Draft(payload: Activity3RunDraft): Activity3RunDraft {
    const count = clampInt(payload.session?.fanDesignCount ?? 3, 1, 8);

    return {
        ...payload,
        session: {
            ...payload.session,
            fanDesignCount: count,
            fanDesigns: normalizeDesignsForCount(payload.session?.fanDesigns ?? [], count),
            gpsEnabled: payload.session?.gpsEnabled ?? true,
            gpsPermission: payload.session?.gpsPermission ?? "unknown",
        },
        measurements: Array.isArray(payload.measurements) ? payload.measurements : [],
    };
}

async function persistDraftInternal(
    draft: Activity3RunDraft,
    options?: PersistOptions
): Promise<void> {
    await offlineDraftService.saveDraft<Activity3RunDraft>({
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
    draft: Activity3RunDraft,
    options?: PersistOptions
): void {
    void persistDraftInternal(draft, options).catch((error) => {
        console.error("[activity3RunDraftStore] Failed to persist draft", {
            runId: draft.runId,
            error,
        });
    });
}

/* =========================================================
   CRUD: Run draft
========================================================= */

export function createActivity3RunDraft(params: {
    activityId: string;
    createdBy?: string;
    fanDesignCount?: number;
    advancedMode?: boolean;
}): Activity3RunDraft {
    const runId = genRunId();
    const count = clampInt(params.fanDesignCount ?? 3, 1, 8);

    const d: Activity3RunDraft = {
        runId,
        session: {
            activityId: params.activityId,
            fanDesignCount: count,
            fanDesigns: buildDesigns(count),
            startedAt: now(),
            advancedMode: Boolean(params.advancedMode),
            stiffnessK: undefined,
            gpsEnabled: true,
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

export function getActivity3RunDraft(runId: string): Activity3RunDraft | null {
    return drafts.get(runId) ?? null;
}

export function getAllActivity3RunDrafts(): Activity3RunDraft[] {
    return Array.from(drafts.values());
}

export function clearActivity3RunDraft(runId: string) {
    drafts.delete(runId);
}

/* =========================================================
   Updates: Session + Designs
========================================================= */

export function updateActivity3Session(runId: string, patch: Partial<A3SessionDraft>): Activity3RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 3 draft not found.");

    const nextCount =
        patch.fanDesignCount != null ? clampInt(patch.fanDesignCount, 1, 8) : d.session.fanDesignCount;

    const nextAdvancedMode = patch.advancedMode != null ? Boolean(patch.advancedMode) : d.session.advancedMode;
    const nextStiffnessK =
        patch.advancedMode === false
            ? undefined
            : patch.stiffnessK !== undefined
                ? patch.stiffnessK
                : d.session.stiffnessK;

    const incomingDesigns = patch.fanDesigns ?? d.session.fanDesigns ?? [];
    const nextDesigns = normalizeDesignsForCount(incomingDesigns, nextCount);

    const next: Activity3RunDraft = {
        ...d,
        session: {
            ...d.session,
            ...patch,
            fanDesignCount: nextCount,
            fanDesigns: nextDesigns,
            advancedMode: nextAdvancedMode,
            stiffnessK: nextStiffnessK,
        },
        updatedAt: now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);

    return next;
}

export function updateActivity3FanDesign(
    runId: string,
    designIndex: number,
    patch: Partial<Omit<A3FanDesignDraft, "index" | "createdAt">>
): Activity3RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 3 draft not found.");

    const designs = d.session.fanDesigns ?? [];
    if (designIndex < 0 || designIndex >= designs.length) throw new Error("Design index out of range.");

    const ts = now();

    const nextDesigns = designs.map((x) => {
        if (x.index !== designIndex) return x;

        const merged: A3FanDesignDraft = {
            ...x,
            ...patch,
            index: x.index,
            createdAt: x.createdAt,
            updatedAt: ts,
        };

        return sanitizeDesign(merged);
    });

    const next: Activity3RunDraft = {
        ...d,
        session: {
            ...d.session,
            fanDesigns: nextDesigns,
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

export function setActivity3Prediction(
    runId: string,
    patch: Partial<NonNullable<Activity3RunDraft["prediction"]>>
): Activity3RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 3 draft not found.");

    const existing = d.prediction;

    const nextPred = {
        predictedBestDesignIndex: existing?.predictedBestDesignIndex,
        predictedBestDistanceCm: existing?.predictedBestDistanceCm,
        predictedNotes: existing?.predictedNotes,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
        ...patch,
    };

    const next: Activity3RunDraft = {
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

export function upsertActivity3Measurement(
    runId: string,
    input: {
        id?: string;
        designIndex: number;
        distanceCm: FanDistanceCm;
        material: FanMaterial;
        bendAngleDeg?: number;
        geo?: GeoPointDraft;
        notes?: string;
        video?: EvidenceDraft;
    }
): Activity3RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 3 draft not found.");

    const id = input.id ?? genMeasurementId();
    const existingIndex = d.measurements.findIndex((m) => m.id === id);
    const ts = now();

    const nextItem: A3MeasurementDraft = {
        id,
        designIndex: input.designIndex,
        distanceCm: input.distanceCm,
        material: input.material,
        video: input.video,
        bendAngleDeg: input.bendAngleDeg,
        geo: input.geo,
        notes: input.notes?.trim() ? input.notes.trim() : undefined,
        createdAt: existingIndex >= 0 ? d.measurements[existingIndex].createdAt : ts,
        updatedAt: existingIndex >= 0 ? ts : undefined,
    };

    const nextMeasurements =
        existingIndex >= 0
            ? d.measurements.map((m, i) => (i === existingIndex ? nextItem : m))
            : [...d.measurements, nextItem];

    const next: Activity3RunDraft = {
        ...d,
        measurements: nextMeasurements,
        updatedAt: ts,
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);

    return next;
}

export function removeActivity3Measurement(runId: string, measurementId: string): Activity3RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 3 draft not found.");

    const next: Activity3RunDraft = {
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

export function setActivity3SessionVideo(runId: string, video: EvidenceDraft | undefined): Activity3RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 3 draft not found.");

    const next: Activity3RunDraft = {
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

export function setActivity3Reflection(runId: string, patch: Partial<A3ReflectionDraft>): Activity3RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 3 draft not found.");

    const next: Activity3RunDraft = {
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

export async function saveActivity3RunDraftToLocalDb(
    runId: string,
    options?: PersistOptions
): Promise<Activity3RunDraft> {
    const current = drafts.get(runId);
    if (!current) throw new Error("Activity 3 draft not found.");

    await persistDraftInternal(current, options);
    return current;
}

export async function hydrateActivity3RunDraftFromLocalDb(
    runId: string
): Promise<Activity3RunDraft | null> {
    const record = await offlineDraftService.getDraftByRunId<Activity3RunDraft>(runId);
    if (!record) return null;

    const normalized = normalizeRecoveredActivity3Draft(record.payload);
    drafts.set(normalized.runId, normalized);

    await offlineDraftService.markRecovered(normalized.runId);

    return normalized;
}

export async function getLatestRecoverableActivity3RunDraft(params: {
    activityId: string;
    createdBy: string;
    teamId?: string | null;
}): Promise<Activity3RunDraft | null> {
    const record = await offlineDraftService.getLatestRecoverableDraft<Activity3RunDraft>({
        activityId: params.activityId,
        userId: params.createdBy,
        teamId: params.teamId ?? null,
    });

    if (!record) return null;

    const normalized = normalizeRecoveredActivity3Draft(record.payload);
    drafts.set(normalized.runId, normalized);

    await offlineDraftService.markRecovered(normalized.runId);

    return normalized;
}

export async function markActivity3RunDraftSubmittedInLocalDb(
    runId: string,
    remoteSubmissionId?: string | null
): Promise<void> {
    await offlineDraftService.markSubmitted({
        runId,
        remoteSubmissionId: remoteSubmissionId ?? null,
    });
}

export async function discardActivity3RunDraft(runId: string): Promise<void> {
    drafts.delete(runId);
    await offlineDraftService.discardDraft(runId);
}

/* =========================================================
   Convenience validators (UI-level)
========================================================= */

export function validateA3Session(d: Activity3RunDraft): string | null {
    const s = d.session;

    if (s.fanDesignCount < 1 || s.fanDesignCount > 8) return "Fan design count must be between 1 and 8.";

    if (!Array.isArray(s.fanDesigns) || s.fanDesigns.length !== s.fanDesignCount) {
        return "Fan designs are not initialized correctly. Please restart the session.";
    }

    if (s.advancedMode) {
        if (s.stiffnessK != null && (!Number.isFinite(s.stiffnessK) || s.stiffnessK <= 0)) {
            return "Stiffness coefficient k must be a positive number.";
        }
    }

    return null;
}