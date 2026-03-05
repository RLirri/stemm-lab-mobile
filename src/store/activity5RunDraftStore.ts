// src/store/activity5RunDraftStore.ts

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
    durationSec: number; // duration guidance (per movement)
    postureGuidance: string;
    visualKey?: string; // optional mapping key for animation asset
};

/* =========================================================
   Evidence + GPS (match A4 style)
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
   Sensor dataset (FR-A5-02)
========================================================= */

export type A5AccelSample = {
    tMs: number; // timestamp relative to trial start (ms)
    ax: number;  // acceleration x
    ay: number;  // acceleration y
    az: number;  // acceleration z
};

export type A5AccelDataset = {
    samples: A5AccelSample[];
    samplingHz: number;     // metadata
    startedAt: number;      // epoch ms
    platform?: "ios" | "android" | "unknown";
    osVersion?: string;
    deviceModel?: string;
};

/* =========================================================
   Computed metrics (FR-A5-04/05/06)
========================================================= */

export type A5TrialMetrics = {
    durationSec: number;             // FR-A5-04
    displacementMagnitudeCm: number; // FR-A5-05 (approx)
    smoothnessIndex: number;         // FR-A5-06 (lower = smoother)
};

export type A5ImprovementDraft = {
    participantId: string;
    movementType: A5MovementType;
    baselineSmoothnessIndex: number;
    feedbackSmoothnessIndex: number;
    improvementScore: number; // baseline - feedback
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

    // team / label
    sessionLabel?: string;

    // participants within a team session
    participantCount: number; // 1..6
    participants: A5ParticipantDraft[];

    // guided movement sequence (>= 3)
    movements: A5MovementSpec[];

    // capture policy
    samplingHz: number;        // 10..100
    movementDurationSec: number;// 10..60 (guidance)

    // feedback toggle (UI policy; trials still store actual mode)
    feedbackEnabled: boolean;

    // metadata / timing
    startedAt: number;
    endsAt?: number;

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

export type A5TrialDraft = {
    id: string;

    participantId: string;
    movementType: A5MovementType;
    mode: A5TrialMode;

    // raw sensor capture
    dataset?: A5AccelDataset;

    // computed outputs
    metrics?: A5TrialMetrics;

    // optional per-trial evidence
    video?: EvidenceDraft;

    // optional metadata
    geo?: GeoPointDraft;
    notes?: string;

    createdAt: number;
    updatedAt?: number;
};

export type A5ReflectionDraft = {
    reflectionText?: string;
    rating?: number; // 1..5
};

export type Activity5RunDraft = {
    runId: string;
    session: A5SessionDraft;

    // FR-A5-07: prediction required before first trial begins
    prediction?: {
        predictedVibrationLevel?: string;
        predictedMostDifficultMovement?: string; // store string (your select uses string[])
        createdAt: number;
        updatedAt?: number;
    };

    trials: A5TrialDraft[];

    // computed improvements cached for UI/leaderboard
    improvements?: A5ImprovementDraft[];

    // FR-A5-14: submission requires session video + GPS + reflection etc.
    evidence?: {
        sessionVideo?: EvidenceDraft;
    };

    reflection?: A5ReflectionDraft;

    createdBy?: string;
    updatedAt: number;
};

/* =========================================================
   In-memory store (match A4 pattern)
========================================================= */

const drafts = new Map<string, Activity5RunDraft>();

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

    // Trim if reduced
    let next = list.slice(0, nextCount);

    // Append if increased
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
                tMs: clampInt(s.tMs, 0, 10 * 60 * 1000), // cap at 10 minutes
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
    // Pair baseline and feedback by participantId + movementType.
    // Use the latest trial per mode if multiple exist.
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
    for (const [key, pair] of map.entries()) {
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

/* =========================================================
   CRUD: Run draft
========================================================= */

export function createActivity5RunDraft(params: {
    activityId: string;
    createdBy?: string;
    participantCount?: number; // default 1, min 1
    samplingHz?: number;       // default 50
    movementDurationSec?: number;// default 20
    gpsEnabled?: boolean;       // default true
    feedbackEnabled?: boolean;  // default true
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
    return d;
}

export function getActivity5RunDraft(runId: string): Activity5RunDraft | null {
    return drafts.get(runId) ?? null;
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

    // If duration updated, refresh movement guidance durations (keep movement identity + order).
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
    return next;
}

/* =========================================================
   Updates: Prediction (FR-A5-07)
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

    // sanitize strings
    nextPred.predictedVibrationLevel = trimOrUndef(nextPred.predictedVibrationLevel);
    nextPred.predictedMostDifficultMovement = trimOrUndef(nextPred.predictedMostDifficultMovement);

    const next: Activity5RunDraft = {
        ...d,
        prediction: nextPred,
        updatedAt: now(),
    };

    drafts.set(runId, next);
    return next;
}

/* =========================================================
   Updates: Trials (FR-A5-03/10)
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

    // UI-level: prediction must exist before trials can be recorded
    if (!d.prediction) {
        throw new Error("Prediction is required before starting trials (FR-A5-07).");
    }

    // validate participant exists
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
    return next;
}

/* =========================================================
   Updates: Evidence + Reflection (FR-A5-14)
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
    return next;
}

/* =========================================================
   Validators (UI-level)
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

/**
 * Submission-level validation (FR-A5-14).
 * IMPORTANT: This mirrors A4 behavior: allow running even if GPS denied, but block submission.
 */
export function validateA5Submission(d: Activity5RunDraft): string[] {
    const missing: string[] = [];

    // prediction required
    if (validateA5Prediction(d)) missing.push("Prediction entry");

    // at least one trial dataset recorded
    const hasAnyDataset = d.trials.some((t) => t.dataset && Array.isArray(t.dataset.samples) && t.dataset.samples.length > 0);
    if (!hasAnyDataset) missing.push("Recorded sensor dataset (accelerometer)");

    // video evidence required (session-level)
    if (!d.evidence?.sessionVideo?.uri) missing.push("Session video evidence");

    // reflection + rating required
    if (!trimOrUndef(d.reflection?.reflectionText)) missing.push("Reflection text");
    if (d.reflection?.rating == null) missing.push("Rating (1–5)");

    // GPS required when gpsEnabled
    if (d.session.gpsEnabled) {
        if (d.session.gpsPermission !== "granted") missing.push("GPS permission granted");
        if (!d.session.geo) missing.push("GPS coordinates captured");
    }

    // baseline vs feedback improvement expectation (recommended)
    const hasBaseline = d.trials.some((t) => t.mode === "baseline" && t.metrics);
    const hasFeedback = d.trials.some((t) => t.mode === "feedback" && t.metrics);
    if (!hasBaseline) missing.push("At least 1 Baseline trial with computed metrics");
    if (!hasFeedback) missing.push("At least 1 Feedback trial with computed metrics");

    return missing;
}

/**
 * Leaderboard score helper (FR-A5-11/13):
 * Return best improvement score in session (max), plus metadata.
 */
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