// src/store/activityRunDraftStore.ts

export type EvidenceDraft = {
    type: "video" | "image";
    uri?: string;          // local uri for now (later upload to Storage)
    storagePath?: string;  // future
    downloadUrl?: string;  // future
    createdAt: number;     // ms
};

export type SessionDraft = {
    durationMin: number;          // default 20
    startedAt?: number;           // ms
    endsAt?: number;              // ms

    // Setup inputs
    dropHeightM?: number;         // required before attempt save (can "measure later" initially)
    targetZoneEnabled?: boolean;
    targetPreset?: "50cm_circle" | "1m_circle" | "none";
    environment?: "indoor" | "outdoor";
    payloadType?: string;

    // Mass can be unknown (then some physics is not computed)
    payloadMassG?: number;        // grams
    payloadMassUnknown?: boolean;

    // Safety checklist confirmations
    safety: {
        stableSurface: boolean;
        keepAreaClear: boolean;
        doNotThrow: boolean;
    };
};

export type AttemptType = "baseline" | "prototype";

export type AttemptPlanDraft = {
    attemptType: AttemptType; // baseline/prototype
    predictionSec?: number;

    // Design tags (for prototype)
    designTags?: {
        canopyMaterial?: "paper" | "plastic" | "fabric" | "other";
        canopyShape?: "circle" | "square" | "other";
        stringsCount?: number;
        canopySizeCm?: number;    // diameter or side length
        stringLengthCm?: number;
        notes?: string;
    };

    // Per-attempt parameters (prefill from session, but editable)
    dropHeightM?: number;
    payloadMassG?: number;
    payloadMassUnknown?: boolean;

    sketch?: EvidenceDraft; // optional photo
};

export type AttemptMeasurementsDraft = {
    tHitSec?: number;       // time to first ground contact
    tStopSec?: number;      // time from contact to stop moving
    inTargetZone?: boolean; // required if target enabled
    distanceFromCenterCm?: number; // optional
    bounceOccurred?: boolean;
    bounceTimeToPeakSec?: number; // optional if bounceOccurred
};

export type AttemptComputedDraft = {
    // computed values (optional)
    velocity?: number;     // m/s
    acceleration?: number; // m/s^2
    netForce?: number;     // N
    weight?: number;       // N
    dragForce?: number;    // N
    gForce?: number;       // unitless (multiples of g)
};

export type AttemptDraft = {
    index: number; // 0..3
    label: string; // "Baseline" / "Prototype 1" etc.

    plan: AttemptPlanDraft;

    // Video evidence (always expected in SRS; v1 we store metadata only)
    video?: EvidenceDraft;

    // Optional GPS metadata (if permission granted later)
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

    // Attempt 0..3
    attempts: Record<number, AttemptDraft>;
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
    return draft;
}

export function getRunDraft(runId: string): ActivityRunDraft | null {
    return drafts.get(runId) ?? null;
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
    return next;
}

export function clearRunDraft(runId: string) {
    drafts.delete(runId);
}

export function clearAllRunDrafts() {
    drafts.clear();
}