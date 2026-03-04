// src/store/activity4RunDraftStore.ts

export type A4MaterialContext = "paper" | "plastic";
export type GpsPermissionStatus = "unknown" | "granted" | "denied";
export type A4FinalScoreMethod = "sensor" | "manual_deg" | "manual_cm";

export type A4ValidationDraft = {
    delta: number;     // absolute difference between sensor vs manual (deg), if both exist
    flagged: boolean;  // e.g. delta > threshold
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
   Design metadata (earthquake structure design descriptors)
========================================================= */

export type A4DesignDraft = {
    index: number; // 0..designCount-1
    name?: string;

    // structure descriptors (optional; useful for reflection + comparison)
    foldCount?: number;     // 0..60
    pillarCount?: number;   // 0..30
    layers?: number;        // 1..10
    baseWidthCm?: number;   // 1..200
    baseLengthCm?: number;  // 1..200
    notes?: string;

    createdAt: number;
    updatedAt?: number;
};

/* =========================================================
   Session + Measurement + Run
========================================================= */

export type A4SessionDraft = {
    activityId: string;

    // designs metadata stored once per session
    designCount: number; // min 3
    designs: A4DesignDraft[];

    // metadata / timing
    startedAt: number;
    endsAt?: number;

    // optional context
    surfaceContext?: A4MaterialContext;

    // vibration policy
    vibrationDurationSec: number; // FR-A4-01 default 10

    // GPS policy: allow running if denied; block submission later
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

    // what we are measuring
    designIndex: number; // 0..designCount-1

    // raw sensor capture (FR-A4-02)
    magnitudeSamples?: number[];

    // computed sensor score (FR-A4-03): lower is better
    movementScore?: number;

    // manual outcome (fallback + validation)
    manualOutcomeDeg?: number; // user input degrees (optional)
    manualOutcomeCm?: number;  // user input cm (optional)

    // final score used by leaderboard/submission
    finalScore?: number; // lowest wins
    finalMethod?: A4FinalScoreMethod;

    // optional validation metadata (sensor vs manual)
    validation?: A4ValidationDraft;

    // evidence (per-measurement optional)
    video?: EvidenceDraft;

    // optional metadata
    geo?: GeoPointDraft;
    notes?: string;

    createdAt: number;
    updatedAt?: number;
};

export type A4ReflectionDraft = {
    reflectionText?: string;
    rating?: number; // 1..5
};

export type Activity4RunDraft = {
    runId: string;
    session: A4SessionDraft;

    // FR-A4-05: prediction required before measurement
    prediction?: {
        predictedBestDesignIndex?: number;
        predictedNotes?: string;
        createdAt: number;
        updatedAt?: number;
    };

    measurements: A4MeasurementDraft[];

    // FR-A4-07: submission requires session video + GPS + reflection etc.
    evidence?: {
        sessionVideo?: EvidenceDraft;
    };

    reflection?: A4ReflectionDraft;

    createdBy?: string;
    updatedAt: number;
};

/* =========================================================
   In-memory store
========================================================= */

const drafts = new Map<string, Activity4RunDraft>();

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

    // Trim if reduced
    let next = sorted.filter((x) => x.index < nextCount);

    // Append if increased
    for (let i = next.length; i < nextCount; i++) {
        next.push(makeDefaultDesign(i));
    }

    // Reindex safety
    next = next.map((x, i) => ({...x, index: i}));

    return next.map(sanitizeDesign);
}

/* =========================================================
   CRUD: Run draft
========================================================= */

export function createActivity4RunDraft(params: {
    activityId: string;
    createdBy?: string;
    designCount?: number; // default 3, min 3
    gpsEnabled?: boolean; // default true
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
    return d;
}

export function getActivity4RunDraft(runId: string): Activity4RunDraft | null {
    return drafts.get(runId) ?? null;
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

        // raw / computed
        magnitudeSamples?: number[];
        movementScore?: number;

        // manual
        manualOutcomeDeg?: number;
        manualOutcomeCm?: number;

        // final used for results/leaderboard
        finalScore?: number;
        finalMethod?: A4FinalScoreMethod;
        validation?: A4ValidationDraft;

        // meta
        geo?: GeoPointDraft;
        notes?: string;

        // optional per-measurement video
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
        // keep immutable identity + timestamps
        id,
        designIndex: input.designIndex,
        createdAt: prev ? prev.createdAt : ts,
        updatedAt: prev ? ts : undefined,

        // merge: keep previous values if patch doesn’t provide them
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
    return next;
}

/* =========================================================
   Validators (UI-level)
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