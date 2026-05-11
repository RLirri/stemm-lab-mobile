// src/store/activityRunDraftStore.ts

import {offlineDraftService} from "../services/offlineDraftService";
import type {OfflineDraftStatus} from "../types/offlineDraft";

export type EvidenceDraft = {
    type: "video" | "image";
    uri?: string;
    storagePath?: string;
    downloadUrl?: string;
    createdAt: number;
};

export type SessionDraft = {
    durationMin: number;
    startedAt?: number;
    endsAt?: number;

    dropHeightM?: number;
    targetZoneEnabled?: boolean;
    targetPreset?: "50cm_circle" | "1m_circle" | "none";
    environment?: "indoor" | "outdoor";
    payloadType?: string;

    payloadMassG?: number;
    payloadMassUnknown?: boolean;

    safety: {
        stableSurface: boolean;
        keepAreaClear: boolean;
        doNotThrow: boolean;
    };
};

export type AttemptType = "baseline" | "prototype";

export type AttemptPlanDraft = {
    attemptType: AttemptType;
    predictionSec?: number;

    designTags?: {
        canopyMaterial?: "paper" | "plastic" | "fabric" | "other";
        canopyShape?: "circle" | "square" | "other";
        stringsCount?: number;
        canopySizeCm?: number;
        stringLengthCm?: number;
        notes?: string;
    };

    dropHeightM?: number;
    payloadMassG?: number;
    payloadMassUnknown?: boolean;

    sketch?: EvidenceDraft;
};

export type AttemptMeasurementsDraft = {
    tHitSec?: number;
    tStopSec?: number;
    inTargetZone?: boolean;
    distanceFromCenterCm?: number;
    bounceOccurred?: boolean;
    bounceTimeToPeakSec?: number;
};

export type AttemptComputedDraft = {
    velocity?: number;
    acceleration?: number;
    netForce?: number;
    weight?: number;
    dragForce?: number;
    gForce?: number;
};

export type AttemptDraft = {
    index: number;
    label: string;

    plan: AttemptPlanDraft;
    video?: EvidenceDraft;
    gps?: { lat: number; lng: number; accuracyM?: number };
    measurements?: AttemptMeasurementsDraft;
    computed?: AttemptComputedDraft;

    createdAt: number;
    updatedAt: number;
};

export type ActivityRunDraft = {
    runId: string;
    activityId: string;
    createdBy: string;
    createdAt: number;
    updatedAt: number;

    session: SessionDraft;
    attempts: Record<number, AttemptDraft>;
};

type PersistOptions = {
    currentStep?: string | null;
    status?: OfflineDraftStatus;
    teamId?: string | null;
};

const DRAFTS_KEY = "__STEMM_RUN_DRAFTS__";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

const drafts: Map<string, ActivityRunDraft> =
    (g[DRAFTS_KEY] ?? new Map<string, ActivityRunDraft>()) as Map<string, ActivityRunDraft>;

g[DRAFTS_KEY] = drafts;

function newRunId() {
    return `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function makeAttempt(index: number): AttemptDraft {
    const now = Date.now();
    const isBaseline = index === 0;

    return {
        index,
        label: isBaseline ? "Baseline (No parachute)" : `Prototype ${index}`,
        plan: {
            attemptType: isBaseline ? "baseline" : "prototype",
        },
        createdAt: now,
        updatedAt: now,
    };
}

function timestampToIso(timestampMs: number): string {
    return new Date(timestampMs).toISOString();
}

function normalizeRecoveredDraft(payload: ActivityRunDraft): ActivityRunDraft {
    return {
        ...payload,
        attempts: payload.attempts ?? {
            0: makeAttempt(0),
            1: makeAttempt(1),
            2: makeAttempt(2),
            3: makeAttempt(3),
        },
        session: payload.session ?? {
            durationMin: 20,
            targetZoneEnabled: false,
            targetPreset: "none",
            payloadMassUnknown: false,
            safety: {
                stableSurface: false,
                keepAreaClear: false,
                doNotThrow: false,
            },
        },
    };
}

async function persistDraftInternal(
    draft: ActivityRunDraft,
    options?: PersistOptions
): Promise<void> {
    await offlineDraftService.saveDraft<ActivityRunDraft>({
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
    draft: ActivityRunDraft,
    options?: PersistOptions
): void {
    void persistDraftInternal(draft, options).catch((error) => {
        console.error("[activityRunDraftStore] Failed to persist draft", {
            runId: draft.runId,
            error,
        });
    });
}

export function createRunDraft(activityId: string, createdBy: string): ActivityRunDraft {
    const runId = newRunId();
    const now = Date.now();

    const draft: ActivityRunDraft = {
        runId,
        activityId,
        createdBy,
        createdAt: now,
        updatedAt: now,
        session: {
            durationMin: 20,
            targetZoneEnabled: false,
            targetPreset: "none",
            payloadMassUnknown: false,
            safety: {
                stableSurface: false,
                keepAreaClear: false,
                doNotThrow: false,
            },
        },
        attempts: {
            0: makeAttempt(0),
            1: makeAttempt(1),
            2: makeAttempt(2),
            3: makeAttempt(3),
        },
    };

    drafts.set(runId, draft);
    fireAndForgetPersist(draft);

    return draft;
}

export function getRunDraft(runId: string): ActivityRunDraft | null {
    return drafts.get(runId) ?? null;
}

export function getAllRunDrafts(): ActivityRunDraft[] {
    return Array.from(drafts.values());
}

export function updateRunDraft(runId: string, patch: Partial<ActivityRunDraft>): ActivityRunDraft {
    const current = drafts.get(runId);
    if (!current) throw new Error("Run draft not found");

    const next: ActivityRunDraft = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);

    return next;
}

export function updateSession(runId: string, patch: Partial<SessionDraft>): ActivityRunDraft {
    const current = drafts.get(runId);
    if (!current) throw new Error("Run draft not found");

    const next: ActivityRunDraft = {
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

export function updateAttempt(
    runId: string,
    attemptIndex: number,
    patch: Partial<AttemptDraft>
): ActivityRunDraft {
    const current = drafts.get(runId);
    if (!current) throw new Error("Run draft not found");

    const existing = current.attempts?.[attemptIndex];
    if (!existing) throw new Error("Attempt not found");

    const nextAttempt: AttemptDraft = {
        ...existing,
        ...patch,
        updatedAt: Date.now(),
    };

    const next: ActivityRunDraft = {
        ...current,
        attempts: {
            ...current.attempts,
            [attemptIndex]: nextAttempt,
        },
        updatedAt: Date.now(),
    };

    drafts.set(runId, next);
    fireAndForgetPersist(next);

    return next;
}

/**
 * Explicit save hook for screens that want to persist after navigation milestones
 * such as "prediction completed", "measurement completed", "results viewed", etc.
 */
export async function saveRunDraftToLocalDb(
    runId: string,
    options?: PersistOptions
): Promise<ActivityRunDraft> {
    const current = drafts.get(runId);
    if (!current) throw new Error("Run draft not found");

    await persistDraftInternal(current, options);
    return current;
}

/**
 * Hydrate one known run from SQLite into in-memory store.
 * Safe for app restart / crash recovery.
 */
export async function hydrateRunDraftFromLocalDb(
    runId: string
): Promise<ActivityRunDraft | null> {
    const record = await offlineDraftService.getDraftByRunId<ActivityRunDraft>(runId);
    if (!record) return null;

    const normalized = normalizeRecoveredDraft(record.payload);
    drafts.set(normalized.runId, normalized);

    await offlineDraftService.markRecovered(normalized.runId);

    return normalized;
}

/**
 * Find the latest recoverable Activity 1 draft for a given user/activity.
 * This is the main entry point for "Resume previous draft?" UX later.
 */
export async function getLatestRecoverableRunDraft(params: {
    activityId: string;
    createdBy: string;
    teamId?: string | null;
}): Promise<ActivityRunDraft | null> {
    const record = await offlineDraftService.getLatestRecoverableDraft<ActivityRunDraft>({
        activityId: params.activityId,
        userId: params.createdBy,
        teamId: params.teamId ?? null,
    });

    if (!record) return null;

    const normalized = normalizeRecoveredDraft(record.payload);
    drafts.set(normalized.runId, normalized);

    await offlineDraftService.markRecovered(normalized.runId);

    return normalized;
}

/**
 * Mark as submitted in local DB after successful remote submission.
 * Keep in-memory state available until caller decides to clear it.
 */
export async function markRunDraftSubmittedInLocalDb(
    runId: string,
    remoteSubmissionId?: string | null
): Promise<void> {
    await offlineDraftService.markSubmitted({
        runId,
        remoteSubmissionId: remoteSubmissionId ?? null,
    });
}

/**
 * Remove from both memory and SQLite.
 * Use this for explicit discard or final cleanup.
 */
export async function discardRunDraft(runId: string): Promise<void> {
    drafts.delete(runId);
    await offlineDraftService.discardDraft(runId);
}

/**
 * Existing memory-only clear preserved for compatibility.
 * Use discardRunDraft() when you want local DB cleanup too.
 */
export function clearRunDraft(runId: string) {
    drafts.delete(runId);
}

/**
 * Existing memory-only clear preserved for compatibility.
 */
export function clearAllRunDrafts() {
    drafts.clear();
}