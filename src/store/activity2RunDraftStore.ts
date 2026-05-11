// Activity 2 draft store (in-memory, Fast Refresh safe).
// Pure state store — no Firebase, no Expo side effects.
import type {SoundRiskCategory} from "../services/scoringService";
import {offlineDraftService} from "../services/offlineDraftService";
import type {OfflineDraftStatus} from "../types/offlineDraft";

/* =========================================================
   Types
========================================================= */

export type A2GpsPoint = {
    lat: number;
    lng: number;
    accuracyM?: number;
};

export type A2PredictionRelation =
    | "PREDICTED_LOUDEST"
    | "NOT_PREDICTED_LOUDEST"
    | "UNKNOWN"; // before we compute loudest

export type A2MeasurementDraft = {
    id: string;

    actionLabel: string;

    // recorded values
    dbAvg?: number;
    dbMax?: number;
    durationSec?: number;

    recordedAt: number; // ms (when measurement was taken)
    gps?: A2GpsPoint;

    // classification & validation (filled as user measures / edits)
    riskCategory?: SoundRiskCategory;
    riskLabel?: string;

    isValid: boolean;

    // prediction analysis (filled after results computed)
    predictionRelation?: A2PredictionRelation;
    userWasRight?: boolean;

    notes?: string;
};

export type A2SessionDraft = {
    startedAt?: number;
    endsAt?: number;

    // A2 setup fields
    sessionLabel?: string;
    gpsEnabled: boolean;

    predictedLoudestAction?: string;

    // evidence policy (A): one session video required (we store local uri here)
    sessionVideo?: {
        type: "video";
        uri?: string; // local
        storagePath?: string; // later
        downloadUrl?: string; // later
        createdAt: number; // ms
    };
};

export type Activity2RunDraft = {
    runId: string;
    activityId: string;
    createdBy: string;

    createdAt: number;
    updatedAt: number;

    session: A2SessionDraft;

    // measurements (min 3 required for submission)
    actions: A2MeasurementDraft[];

    // cached results (optional; computed on results screen)
    computed?: {
        validCount: number;
        avgDb: number;
        score: number;
        loudestActionLabel?: string;
        wasPredictionCorrect?: boolean;
        updatedAt: number;
    };
};

type PersistOptions = {
    currentStep?: string | null;
    status?: OfflineDraftStatus;
    teamId?: string | null;
};

/* =========================================================
   In-memory store (Fast Refresh safe)
========================================================= */

const DRAFTS_KEY = "__STEMM_A2_RUN_DRAFTS__";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

const drafts: Map<string, Activity2RunDraft> =
    (g[DRAFTS_KEY] ?? new Map<string, Activity2RunDraft>()) as Map<string, Activity2RunDraft>;

g[DRAFTS_KEY] = drafts;

/* =========================================================
   Utilities
========================================================= */

function newRunId() {
    return `a2run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function newMeasurementId() {
    return `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeLabel(x: unknown): string {
    const s = typeof x === "string" ? x.trim() : "";
    return s;
}

function timestampToIso(timestampMs: number): string {
    return new Date(timestampMs).toISOString();
}

function normalizeRecoveredActivity2Draft(payload: Activity2RunDraft): Activity2RunDraft {
    return {
        ...payload,
        session: {
            ...payload.session,
            gpsEnabled: payload.session?.gpsEnabled ?? true,
        },
        actions: Array.isArray(payload.actions) ? payload.actions : [],
    };
}

async function persistDraftInternal(
    draft: Activity2RunDraft,
    options?: PersistOptions
): Promise<void> {
    await offlineDraftService.saveDraft<Activity2RunDraft>({
        runId: draft.runId,
        activityId: draft.activityId,
        payload: draft,
        currentStep: options?.currentStep ?? null,
        status: options?.status ?? "draft",
        userId: draft.createdBy,
        teamId: options?.teamId ?? null,
        createdAt: timestampToIso(draft.createdAt),
    });
}

function fireAndForgetPersist(
    draft: Activity2RunDraft,
    options?: PersistOptions
): void {
    void persistDraftInternal(draft, options).catch((error) => {
        console.error("[activity2RunDraftStore] Failed to persist draft", {
            runId: draft.runId,
            error,
        });
    });
}

/* =========================================================
   CRUD
========================================================= */

export function createActivity2RunDraft(activityId: string, createdBy: string): Activity2RunDraft {
    const runId = newRunId();
    const now = Date.now();

    const draft: Activity2RunDraft = {
        runId,
        activityId,
        createdBy,
        createdAt: now,
        updatedAt: now,
        session: {
            gpsEnabled: true,
        },
        actions: [],
    };

    drafts.set(runId, draft);
    fireAndForgetPersist(draft);

    return draft;
}

export function getActivity2RunDraft(runId: string): Activity2RunDraft | null {
    return drafts.get(runId) ?? null;
}

export function getAllActivity2RunDrafts(): Activity2RunDraft[] {
    return Array.from(drafts.values());
}

export function updateActivity2RunDraft(
    runId: string,
    patch: Partial<Activity2RunDraft>
): Activity2RunDraft {
    const current = drafts.get(runId);
    if (!current) throw new Error("A2 run draft not found");

    const next: Activity2RunDraft = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);

    return next;
}

export function updateActivity2Session(
    runId: string,
    patch: Partial<A2SessionDraft>
): Activity2RunDraft {
    const current = drafts.get(runId);
    if (!current) throw new Error("A2 run draft not found");

    const next: Activity2RunDraft = {
        ...current,
        session: {
            ...current.session,
            ...patch,
        },
        updatedAt: Date.now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);

    return next;
}

/* =========================================================
   Measurements API
========================================================= */

/**
 * Create a new measurement row with required fields.
 * You can fill dbAvg/dbMax/gps later.
 */
export function addA2Measurement(runId: string, actionLabel: string): Activity2RunDraft {
    const current = drafts.get(runId);
    if (!current) throw new Error("A2 run draft not found");

    const now = Date.now();
    const label = normalizeLabel(actionLabel);

    const m: A2MeasurementDraft = {
        id: newMeasurementId(),
        actionLabel: label.length ? label : "Unnamed action",
        recordedAt: now,
        isValid: false, // becomes true once dbAvg + duration validate
    };

    const next: Activity2RunDraft = {
        ...current,
        actions: [...current.actions, m],
        updatedAt: now,
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);

    return next;
}

export function updateA2Measurement(
    runId: string,
    measurementId: string,
    patch: Partial<A2MeasurementDraft>
): Activity2RunDraft {
    const current = drafts.get(runId);
    if (!current) throw new Error("A2 run draft not found");

    const idx = current.actions.findIndex((a) => a.id === measurementId);
    if (idx < 0) throw new Error("A2 measurement not found");

    const now = Date.now();
    const existing = current.actions[idx];

    const nextItem: A2MeasurementDraft = {
        ...existing,
        ...patch,
        actionLabel: patch.actionLabel != null ? normalizeLabel(patch.actionLabel) : existing.actionLabel,
    };

    const nextActions = current.actions.slice();
    nextActions[idx] = nextItem;

    const next: Activity2RunDraft = {
        ...current,
        actions: nextActions,
        updatedAt: now,
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);

    return next;
}

export function removeA2Measurement(runId: string, measurementId: string): Activity2RunDraft {
    const current = drafts.get(runId);
    if (!current) throw new Error("A2 run draft not found");

    const next: Activity2RunDraft = {
        ...current,
        actions: current.actions.filter((a) => a.id !== measurementId),
        updatedAt: Date.now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);

    return next;
}

/**
 * Replace all measurements in one go (useful for bulk recompute).
 */
export function setA2Measurements(runId: string, actions: A2MeasurementDraft[]): Activity2RunDraft {
    const current = drafts.get(runId);
    if (!current) throw new Error("A2 run draft not found");

    const next: Activity2RunDraft = {
        ...current,
        actions: actions.slice(),
        updatedAt: Date.now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);

    return next;
}

/* =========================================================
   Computed cache API
========================================================= */

export function setA2Computed(
    runId: string,
    computed: Activity2RunDraft["computed"]
): Activity2RunDraft {
    const current = drafts.get(runId);
    if (!current) throw new Error("A2 run draft not found");

    const next: Activity2RunDraft = {
        ...current,
        computed: computed
            ? {
                ...computed,
                updatedAt: Date.now(),
            }
            : undefined,
        updatedAt: Date.now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);

    return next;
}

/* =========================================================
   Explicit persistence / recovery helpers
========================================================= */

export async function saveActivity2RunDraftToLocalDb(
    runId: string,
    options?: PersistOptions
): Promise<Activity2RunDraft> {
    const current = drafts.get(runId);
    if (!current) throw new Error("A2 run draft not found");

    await persistDraftInternal(current, options);
    return current;
}

export async function hydrateActivity2RunDraftFromLocalDb(
    runId: string
): Promise<Activity2RunDraft | null> {
    const record = await offlineDraftService.getDraftByRunId<Activity2RunDraft>(runId);
    if (!record) return null;

    const normalized = normalizeRecoveredActivity2Draft(record.payload);
    drafts.set(normalized.runId, normalized);

    await offlineDraftService.markRecovered(normalized.runId);

    return normalized;
}

export async function getLatestRecoverableActivity2RunDraft(params: {
    activityId: string;
    createdBy: string;
    teamId?: string | null;
}): Promise<Activity2RunDraft | null> {
    const record = await offlineDraftService.getLatestRecoverableDraft<Activity2RunDraft>({
        activityId: params.activityId,
        userId: params.createdBy,
        teamId: params.teamId ?? null,
    });

    if (!record) return null;

    const normalized = normalizeRecoveredActivity2Draft(record.payload);
    drafts.set(normalized.runId, normalized);

    await offlineDraftService.markRecovered(normalized.runId);

    return normalized;
}

export async function markActivity2RunDraftSubmittedInLocalDb(
    runId: string,
    remoteSubmissionId?: string | null
): Promise<void> {
    await offlineDraftService.markSubmitted({
        runId,
        remoteSubmissionId: remoteSubmissionId ?? null,
    });
}

export async function discardActivity2RunDraft(runId: string): Promise<void> {
    drafts.delete(runId);
    await offlineDraftService.discardDraft(runId);
}

/* =========================================================
   Clearing
========================================================= */

export function clearActivity2RunDraft(runId: string) {
    drafts.delete(runId);
}

export function clearAllActivity2RunDrafts() {
    drafts.clear();
}