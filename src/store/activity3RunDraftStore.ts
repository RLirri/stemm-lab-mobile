// src/store/activity3RunDraftStore.ts

export type FanDistanceCm = 15 | 30 | 45;
export type FanMaterial = "paper" | "cardboard";
export type SurfaceContext = "table" | "floor";
export type FanFoldType = "flat" | "folded" | "pleated";

/* =========================================================
   Design metadata (controls for the "fan design → airflow" question)
========================================================= */

export type A3FanDesignDraft = {
    index: number; // 0..fanDesignCount-1
    name?: string;

    // airflow-related descriptors
    hasFolds?: boolean;
    foldType?: FanFoldType;
    foldCount?: number; // 0..60
    layers?: number; // 1..5
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

    // ✅ NEW: designs metadata stored once per session
    fanDesigns: A3FanDesignDraft[];

    // metadata / timing
    startedAt: number;
    endsAt?: number; // optional timer window

    // setup fields
    surfaceContext?: SurfaceContext;
    fanDesignCount: number; // default 3
    advancedMode: boolean;
    stiffnessK?: number; // optional, only if advancedMode

    // GPS policy: allow running if denied; block submission later (submission service will enforce)
    gpsEnabled: boolean;
    gpsPermission: GpsPermissionStatus;
};

export type A3MeasurementDraft = {
    id: string;

    // what we are measuring
    designIndex: number; // 0..fanDesignCount-1
    distanceCm: FanDistanceCm;
    material: FanMaterial;

    // ✅ NEW: per-measurement video
    video?: EvidenceDraft;

    // measured outcome
    bendAngleDeg?: number; // FR-A3-01

    // optional metadata
    geo?: GeoPointDraft;
    notes?: string;

    createdAt: number;
    updatedAt?: number;
};

export type A3ReflectionDraft = {
    reflectionText?: string;
    rating?: number; // 1..5
};

export type Activity3RunDraft = {
    runId: string;
    session: A3SessionDraft;

    // prediction is required before results (FR-A3-05)
    prediction?: {
        predictedBestDesignIndex?: number; // optional (you may change later)
        predictedBestDistanceCm?: FanDistanceCm;
        predictedNotes?: string;
        createdAt: number;
        updatedAt?: number;
    };

    measurements: A3MeasurementDraft[];

    // evidence required for submission (FR-A3-07)
    evidence?: {
        sessionVideo?: EvidenceDraft; // policy: 1 session video required
    };

    reflection?: A3ReflectionDraft;

    // housekeeping
    createdBy?: string;
    updatedAt: number;
};

/* =========================================================
   In-memory store
========================================================= */

const drafts = new Map<string, Activity3RunDraft>();

function now() {
    return Date.now();
}

function genRunId() {
    // deterministic enough for in-memory; if you later want UUID, swap safely.
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

function makeDefaultDesign(index: number): A3FanDesignDraft {
    const ts = now();
    return {
        index,
        name: `Design ${index + 1}`,
        // Default: not specified; students can fill in.
        createdAt: ts,
    };
}

function buildDesigns(count: number): A3FanDesignDraft[] {
    return Array.from({length: count}, (_, i) => makeDefaultDesign(i));
}

function sanitizeDesign(d: A3FanDesignDraft): A3FanDesignDraft {
    // Keep bounds clean (UI can still be permissive; store stays tidy)
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

    // Trim if reduced
    let next = sorted.filter((x) => x.index < nextCount);

    // Append if increased
    for (let i = next.length; i < nextCount; i++) {
        next.push(makeDefaultDesign(i));
    }

    // Re-index safety (just in case)
    next = next.map((x, i) => ({...x, index: i}));

    return next.map(sanitizeDesign);
}

/* =========================================================
   CRUD: Run draft
========================================================= */

export function createActivity3RunDraft(params: {
    activityId: string;
    createdBy?: string;
    fanDesignCount?: number; // default 3
    advancedMode?: boolean; // default false
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
    return d;
}

export function getActivity3RunDraft(runId: string): Activity3RunDraft | null {
    return drafts.get(runId) ?? null;
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

    // If advanced mode turned off, drop stiffnessK to prevent stale values
    const nextAdvancedMode = patch.advancedMode != null ? Boolean(patch.advancedMode) : d.session.advancedMode;
    const nextStiffnessK =
        patch.advancedMode === false
            ? undefined
            : patch.stiffnessK !== undefined
                ? patch.stiffnessK
                : d.session.stiffnessK;

    // Designs:
    // - If patch provides fanDesigns, use it (sanitized + normalized to count)
    // - Else keep existing but normalize to count if fanDesignCount changes
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

        // outcome
        bendAngleDeg?: number;

        // meta
        geo?: GeoPointDraft;
        notes?: string;

        // ✅ NEW
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
        existingIndex >= 0 ? d.measurements.map((m, i) => (i === existingIndex ? nextItem : m)) : [...d.measurements, nextItem];

    const next: Activity3RunDraft = {
        ...d,
        measurements: nextMeasurements,
        updatedAt: ts,
    };

    drafts.set(runId, next);
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
    return next;
}

/* =========================================================
   Convenience validators (UI-level)
========================================================= */

export function validateA3Session(d: Activity3RunDraft): string | null {
    const s = d.session;

    if (s.fanDesignCount < 1 || s.fanDesignCount > 8) return "Fan design count must be between 1 and 8.";

    // designs must exist and match count
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