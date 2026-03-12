// src/store/activity7RunDraftStore.ts

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
   Activity 7 – Breathing Types
========================================================= */

export type A7MeasurementPhase =
    | "rest"
    | "post_jog_1min"
    | "post_star_jumps_100";

export type A7PhaseLabel =
    | "Rest Measurement"
    | "Post-Exercise Measurement 1"
    | "Post-Exercise Measurement 2";

export type A7SensorSample = {
    timestamp: number; // epoch ms
    x: number;
    y: number;
    z: number;
    magnitude?: number; // optional cached magnitude
};

export type A7SamplingMetadata = {
    targetSamplingHz?: number;
    actualSamplingHz?: number;
    sampleCount: number;
};

export type A7MeasurementDraft = {
    id: string;

    participantId: string;
    phase: A7MeasurementPhase;

    startedAt: number;
    endedAt: number;
    durationMs: number;

    samples: A7SensorSample[];
    sampling: A7SamplingMetadata;

    estimatedBreathsPerMin?: number;
    detectedCycles?: number;

    video?: EvidenceDraft;
    geo?: GeoPointDraft;
    notes?: string;

    createdAt: number;
    updatedAt?: number;
};

/* =========================================================
   Participants
========================================================= */

export type A7ParticipantDraft = {
    id: string;
    name: string;
    createdAt: number;
    updatedAt?: number;
};

/* =========================================================
   Prediction + Reflection
========================================================= */

export type A7PredictionDraft = {
    predictedRestBpm?: number;
    predictedAfterExerciseBpm?: number;
    expectedHighestPhase?: A7MeasurementPhase;
    createdAt: number;
    updatedAt?: number;
};

export type A7ReflectionDraft = {
    reflectionText?: string;
    wereYouRight?: string;
    highestBreathingRate?: string;
    surprises?: string;
    exerciseEffect?: string;
    rating?: number; // 1..5
};

/* =========================================================
   Computed Metrics
========================================================= */

export type A7PredictionComparison = {
    restAbsError?: number;
    postJogAbsError?: number;
    postStarJumpAbsError?: number;
};

export type A7ParticipantSummary = {
    participantId: string;

    restBpm?: number;
    postJogBpm?: number;
    postStarJumpBpm?: number;

    deltaRestToJog?: number;
    deltaRestToStarJump?: number;
    deltaJogToStarJump?: number;

    recoveryConsistencyScore?: number;
    prediction?: A7PredictionComparison;
};

export type A7SessionMetrics = {
    participantSummaries: A7ParticipantSummary[];

    bestParticipantId?: string;
    teamRecoveryConsistencyScore?: number;

    avgRestBpm?: number;
    avgPostJogBpm?: number;
    avgPostStarJumpBpm?: number;
};

/* =========================================================
   Session + Run
========================================================= */

export type A7SessionDraft = {
    activityId: string;

    sessionLabel?: string;

    participantCount: number; // 1..6
    participants: A7ParticipantDraft[];

    measurementDurationSec: number; // e.g. 30
    targetSamplingHz?: number;
    smoothingWindowSec?: number;
    minPeakGapMs?: number;

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

export type Activity7RunDraft = {
    runId: string;
    session: A7SessionDraft;

    prediction?: A7PredictionDraft;

    measurements: A7MeasurementDraft[];

    metrics?: A7SessionMetrics;

    evidence?: {
        sessionVideo?: EvidenceDraft;
    };

    reflection?: A7ReflectionDraft;

    createdBy?: string;
    updatedAt: number;
};

/* =========================================================
   In-memory store
========================================================= */

const drafts = new Map<string, Activity7RunDraft>();

function now() {
    return Date.now();
}

function genRunId() {
    return `a7_${now()}_${Math.random().toString(16).slice(2)}`;
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

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}

function mean(xs: number[]): number {
    if (xs.length === 0) return 0;
    let s = 0;
    for (const x of xs) s += x;
    return s / xs.length;
}

/* =========================================================
   Defaults + Sanitizers
========================================================= */

function makeDefaultParticipant(index: number): A7ParticipantDraft {
    const ts = now();
    return {
        id: genId("p"),
        name: `Participant ${index + 1}`,
        createdAt: ts,
    };
}

function buildParticipants(count: number): A7ParticipantDraft[] {
    return Array.from({length: count}, (_, i) => makeDefaultParticipant(i));
}

function sanitizeParticipant(p: A7ParticipantDraft): A7ParticipantDraft {
    return {
        ...p,
        name: trimOrUndef(p.name) ?? p.name,
    };
}

function normalizeParticipantsForCount(
    existing: A7ParticipantDraft[],
    nextCount: number
): A7ParticipantDraft[] {
    const list = [...(existing ?? [])];

    let next = list.slice(0, nextCount);
    for (let i = next.length; i < nextCount; i++) next.push(makeDefaultParticipant(i));

    return next.map(sanitizeParticipant);
}

function sanitizePhase(phase: A7MeasurementPhase): A7MeasurementPhase {
    if (
        phase === "rest" ||
        phase === "post_jog_1min" ||
        phase === "post_star_jumps_100"
    ) {
        return phase;
    }
    return "rest";
}

export function getA7PhaseLabel(phase: A7MeasurementPhase): A7PhaseLabel {
    switch (phase) {
        case "rest":
            return "Rest Measurement";
        case "post_jog_1min":
            return "Post-Exercise Measurement 1";
        case "post_star_jumps_100":
            return "Post-Exercise Measurement 2";
        default:
            return "Rest Measurement";
    }
}

function sanitizeSensorSamples(
    samples: A7SensorSample[] | undefined
): A7SensorSample[] {
    if (!Array.isArray(samples)) return [];

    return samples
        .filter(
            (s) =>
                s &&
                isFiniteNumber(s.timestamp) &&
                isFiniteNumber(s.x) &&
                isFiniteNumber(s.y) &&
                isFiniteNumber(s.z)
        )
        .map((s) => {
            const magnitude =
                isFiniteNumber(s.magnitude)
                    ? s.magnitude
                    : Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);

            return {
                timestamp: Math.max(0, Math.round(s.timestamp)),
                x: s.x,
                y: s.y,
                z: s.z,
                magnitude,
            };
        })
        .sort((a, b) => a.timestamp - b.timestamp);
}

function sanitizeSamplingMetadata(
    input: Partial<A7SamplingMetadata> | undefined,
    sampleCount: number,
    durationMs: number,
    fallbackTargetSamplingHz?: number
): A7SamplingMetadata {
    const actualSamplingHz =
        sampleCount > 1 && durationMs > 0
            ? (sampleCount / durationMs) * 1000
            : undefined;

    return {
        targetSamplingHz: isFiniteNumber(input?.targetSamplingHz)
            ? clampNum(input!.targetSamplingHz!, 1, 500)
            : isFiniteNumber(fallbackTargetSamplingHz)
                ? clampNum(fallbackTargetSamplingHz!, 1, 500)
                : undefined,
        actualSamplingHz,
        sampleCount: clampInt(sampleCount, 0, 1_000_000),
    };
}

function getMeasurementForPhase(
    measurements: A7MeasurementDraft[],
    participantId: string,
    phase: A7MeasurementPhase
): A7MeasurementDraft | undefined {
    return [...measurements]
        .filter((m) => m.participantId === participantId && m.phase === phase)
        .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
}

function computePhaseDelta(from?: number, to?: number): number | undefined {
    if (!isFiniteNumber(from) || !isFiniteNumber(to)) return undefined;
    return to - from;
}

/**
 * Lower is better:
 * - variability between post-exercise recovery gaps is better when smaller
 * - average distance from resting rate is also better when smaller
 */
function computeRecoveryConsistencyScore(args: {
    restBpm?: number;
    postJogBpm?: number;
    postStarJumpBpm?: number;
}): number | undefined {
    const {restBpm, postJogBpm, postStarJumpBpm} = args;

    if (
        !isFiniteNumber(restBpm) ||
        !isFiniteNumber(postJogBpm) ||
        !isFiniteNumber(postStarJumpBpm)
    ) {
        return undefined;
    }

    const d1 = Math.abs(postJogBpm - restBpm);
    const d2 = Math.abs(postStarJumpBpm - restBpm);
    const variability = Math.abs(d1 - d2);
    const meanGap = (d1 + d2) / 2;

    return variability + meanGap * 0.25;
}

function computePredictionComparison(
    prediction: A7PredictionDraft | undefined,
    restBpm?: number,
    postJogBpm?: number,
    postStarJumpBpm?: number
): A7PredictionComparison {
    return {
        restAbsError:
            isFiniteNumber(prediction?.predictedRestBpm) && isFiniteNumber(restBpm)
                ? Math.abs(restBpm - prediction!.predictedRestBpm!)
                : undefined,
        postJogAbsError:
            isFiniteNumber(prediction?.predictedAfterExerciseBpm) &&
            isFiniteNumber(postJogBpm)
                ? Math.abs(postJogBpm - prediction!.predictedAfterExerciseBpm!)
                : undefined,
        postStarJumpAbsError:
            isFiniteNumber(prediction?.predictedAfterExerciseBpm) &&
            isFiniteNumber(postStarJumpBpm)
                ? Math.abs(postStarJumpBpm - prediction!.predictedAfterExerciseBpm!)
                : undefined,
    };
}

function computeSessionMetrics(d: Activity7RunDraft): A7SessionMetrics {
    const participants = d.session.participants ?? [];
    const summaries: A7ParticipantSummary[] = [];

    for (const p of participants) {
        const rest = getMeasurementForPhase(d.measurements, p.id, "rest");
        const postJog = getMeasurementForPhase(d.measurements, p.id, "post_jog_1min");
        const postStar = getMeasurementForPhase(
            d.measurements,
            p.id,
            "post_star_jumps_100"
        );

        const restBpm = rest?.estimatedBreathsPerMin;
        const postJogBpm = postJog?.estimatedBreathsPerMin;
        const postStarJumpBpm = postStar?.estimatedBreathsPerMin;

        const summary: A7ParticipantSummary = {
            participantId: p.id,

            restBpm,
            postJogBpm,
            postStarJumpBpm,

            deltaRestToJog: computePhaseDelta(restBpm, postJogBpm),
            deltaRestToStarJump: computePhaseDelta(restBpm, postStarJumpBpm),
            deltaJogToStarJump: computePhaseDelta(postJogBpm, postStarJumpBpm),

            recoveryConsistencyScore: computeRecoveryConsistencyScore({
                restBpm,
                postJogBpm,
                postStarJumpBpm,
            }),

            prediction: computePredictionComparison(
                d.prediction,
                restBpm,
                postJogBpm,
                postStarJumpBpm
            ),
        };

        summaries.push(summary);
    }

    const ranked = [...summaries]
        .filter((s) => isFiniteNumber(s.recoveryConsistencyScore))
        .sort((a, b) => a.recoveryConsistencyScore! - b.recoveryConsistencyScore!);

    const recoveryScores = summaries
        .map((s) => s.recoveryConsistencyScore)
        .filter((v): v is number => isFiniteNumber(v));

    const rests = summaries
        .map((s) => s.restBpm)
        .filter((v): v is number => isFiniteNumber(v));

    const jogs = summaries
        .map((s) => s.postJogBpm)
        .filter((v): v is number => isFiniteNumber(v));

    const stars = summaries
        .map((s) => s.postStarJumpBpm)
        .filter((v): v is number => isFiniteNumber(v));

    return {
        participantSummaries: summaries,
        bestParticipantId: ranked[0]?.participantId,
        teamRecoveryConsistencyScore: recoveryScores.length
            ? mean(recoveryScores)
            : undefined,
        avgRestBpm: rests.length ? mean(rests) : undefined,
        avgPostJogBpm: jogs.length ? mean(jogs) : undefined,
        avgPostStarJumpBpm: stars.length ? mean(stars) : undefined,
    };
}

/* =========================================================
   CRUD: Run draft
========================================================= */

export function createActivity7RunDraft(params: {
    activityId: string;
    createdBy?: string;

    participantCount?: number;
    measurementDurationSec?: number;
    targetSamplingHz?: number;
    smoothingWindowSec?: number;
    minPeakGapMs?: number;

    gpsEnabled?: boolean;
    sessionLabel?: string;
}): Activity7RunDraft {
    const runId = genRunId();
    const participantCount = clampInt(params.participantCount ?? 1, 1, 6);

    const d: Activity7RunDraft = {
        runId,
        session: {
            activityId: params.activityId,
            sessionLabel: trimOrUndef(params.sessionLabel),

            participantCount,
            participants: buildParticipants(participantCount),

            measurementDurationSec: clampInt(params.measurementDurationSec ?? 30, 10, 120),
            targetSamplingHz: isFiniteNumber(params.targetSamplingHz)
                ? clampNum(params.targetSamplingHz, 1, 500)
                : undefined,
            smoothingWindowSec: isFiniteNumber(params.smoothingWindowSec)
                ? clampNum(params.smoothingWindowSec, 0.1, 5)
                : undefined,
            minPeakGapMs: isFiniteNumber(params.minPeakGapMs)
                ? clampInt(params.minPeakGapMs, 500, 10_000)
                : undefined,

            startedAt: now(),

            gpsEnabled: params.gpsEnabled ?? true,
            gpsPermission: "unknown",
        },

        prediction: undefined,
        measurements: [],
        metrics: {participantSummaries: []},
        evidence: undefined,
        reflection: undefined,
        createdBy: params.createdBy,
        updatedAt: now(),
    };

    drafts.set(runId, d);
    return d;
}

export function getActivity7RunDraft(runId: string): Activity7RunDraft | null {
    return drafts.get(runId) ?? null;
}

export function clearActivity7RunDraft(runId: string) {
    drafts.delete(runId);
}

/* =========================================================
   Updates: Session + Participants
========================================================= */

export function updateActivity7Session(
    runId: string,
    patch: Partial<A7SessionDraft>
): Activity7RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 7 draft not found.");

    const nextParticipantCount =
        patch.participantCount != null
            ? clampInt(patch.participantCount, 1, 6)
            : d.session.participantCount;

    const incomingParticipants = patch.participants ?? d.session.participants ?? [];
    const nextParticipants = normalizeParticipantsForCount(
        incomingParticipants,
        nextParticipantCount
    );

    const next: Activity7RunDraft = {
        ...d,
        session: {
            ...d.session,
            ...patch,
            sessionLabel: trimOrUndef(patch.sessionLabel ?? d.session.sessionLabel),
            participantCount: nextParticipantCount,
            participants: nextParticipants,
            measurementDurationSec:
                patch.measurementDurationSec != null
                    ? clampInt(patch.measurementDurationSec, 10, 120)
                    : d.session.measurementDurationSec,
            targetSamplingHz:
                patch.targetSamplingHz != null
                    ? clampNum(patch.targetSamplingHz, 1, 500)
                    : d.session.targetSamplingHz,
            smoothingWindowSec:
                patch.smoothingWindowSec != null
                    ? clampNum(patch.smoothingWindowSec, 0.1, 5)
                    : d.session.smoothingWindowSec,
            minPeakGapMs:
                patch.minPeakGapMs != null
                    ? clampInt(patch.minPeakGapMs, 500, 10_000)
                    : d.session.minPeakGapMs,
        },
        updatedAt: now(),
    };

    next.metrics = computeSessionMetrics(next);

    drafts.set(runId, next);
    return next;
}

export function updateActivity7Participant(
    runId: string,
    participantId: string,
    patch: Partial<Omit<A7ParticipantDraft, "id" | "createdAt">>
): Activity7RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 7 draft not found.");

    const list = d.session.participants ?? [];
    const idx = list.findIndex((p) => p.id === participantId);
    if (idx < 0) throw new Error("Participant not found.");

    const ts = now();

    const nextParticipants = list.map((p) => {
        if (p.id !== participantId) return p;

        const merged: A7ParticipantDraft = {
            ...p,
            ...patch,
            id: p.id,
            createdAt: p.createdAt,
            updatedAt: ts,
            name: trimOrUndef((patch as { name?: string }).name) ?? p.name,
        };

        return sanitizeParticipant(merged);
    });

    const next: Activity7RunDraft = {
        ...d,
        session: {
            ...d.session,
            participants: nextParticipants,
        },
        updatedAt: ts,
    };

    next.metrics = computeSessionMetrics(next);

    drafts.set(runId, next);
    return next;
}

/* =========================================================
   Updates: Prediction
========================================================= */

export function setActivity7Prediction(
    runId: string,
    patch: Partial<A7PredictionDraft>
): Activity7RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 7 draft not found.");

    const existing = d.prediction;

    const nextPred: A7PredictionDraft = {
        predictedRestBpm: existing?.predictedRestBpm,
        predictedAfterExerciseBpm: existing?.predictedAfterExerciseBpm,
        expectedHighestPhase: existing?.expectedHighestPhase,
        createdAt: existing?.createdAt ?? now(),
        updatedAt: now(),
        ...patch,
    };

    if (nextPred.predictedRestBpm != null) {
        nextPred.predictedRestBpm = clampInt(nextPred.predictedRestBpm, 1, 80);
    }

    if (nextPred.predictedAfterExerciseBpm != null) {
        nextPred.predictedAfterExerciseBpm = clampInt(
            nextPred.predictedAfterExerciseBpm,
            1,
            120
        );
    }

    if (nextPred.expectedHighestPhase) {
        nextPred.expectedHighestPhase = sanitizePhase(nextPred.expectedHighestPhase);
    }

    const next: Activity7RunDraft = {
        ...d,
        prediction: nextPred,
        updatedAt: now(),
    };

    next.metrics = computeSessionMetrics(next);

    drafts.set(runId, next);
    return next;
}

/* =========================================================
   Updates: Measurements
========================================================= */

export function upsertActivity7Measurement(
    runId: string,
    input: {
        id?: string;

        participantId: string;
        phase: A7MeasurementPhase;

        startedAt: number;
        endedAt: number;

        samples: A7SensorSample[];
        sampling?: Partial<A7SamplingMetadata>;

        estimatedBreathsPerMin?: number;
        detectedCycles?: number;

        video?: EvidenceDraft;
        geo?: GeoPointDraft;
        notes?: string;
    }
): Activity7RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 7 draft not found.");

    if (!d.prediction) {
        throw new Error(
            "Prediction is required before starting breathing measurements (FR-A7-04)."
        );
    }

    const hasParticipant = d.session.participants.some(
        (p) => p.id === input.participantId
    );
    if (!hasParticipant) throw new Error("Participant not found for this session.");

    const id = input.id ?? genId("m");
    const ts = now();

    const existingIndex = d.measurements.findIndex((m) => m.id === id);
    const prev = existingIndex >= 0 ? d.measurements[existingIndex] : undefined;

    const phase = sanitizePhase(input.phase);
    const startedAt = isFiniteNumber(input.startedAt)
        ? Math.round(input.startedAt)
        : prev?.startedAt ?? ts;
    const endedAt = isFiniteNumber(input.endedAt)
        ? Math.round(input.endedAt)
        : prev?.endedAt ?? ts;

    const durationMs = clampInt(Math.max(0, endedAt - startedAt), 0, 10 * 60 * 1000);

    const samples = sanitizeSensorSamples(input.samples ?? prev?.samples);
    const sampling = sanitizeSamplingMetadata(
        input.sampling ?? prev?.sampling,
        samples.length,
        durationMs,
        d.session.targetSamplingHz
    );

    const nextItem: A7MeasurementDraft = {
        id,

        participantId: input.participantId,
        phase,

        startedAt,
        endedAt,
        durationMs,

        samples,
        sampling,

        estimatedBreathsPerMin: isFiniteNumber(input.estimatedBreathsPerMin)
            ? clampNum(input.estimatedBreathsPerMin, 0, 200)
            : prev?.estimatedBreathsPerMin,
        detectedCycles: isFiniteNumber(input.detectedCycles)
            ? clampInt(input.detectedCycles, 0, 10_000)
            : prev?.detectedCycles,

        video: input.video ?? prev?.video,
        geo: input.geo ?? prev?.geo,
        notes: trimOrUndef(input.notes) ?? prev?.notes,

        createdAt: prev ? prev.createdAt : ts,
        updatedAt: prev ? ts : undefined,
    };

    /**
     * Uniqueness policy:
     * keep one active record per participant + phase by replacing the latest matching record
     * unless explicit id is used for update.
     */
    let nextMeasurements = [...d.measurements];

    if (existingIndex >= 0) {
        nextMeasurements = nextMeasurements.map((m, i) => (i === existingIndex ? nextItem : m));
    } else {
        const sameSlotIndex = nextMeasurements.findIndex(
            (m) => m.participantId === input.participantId && m.phase === phase
        );

        if (sameSlotIndex >= 0) {
            nextMeasurements = nextMeasurements.map((m, i) =>
                i === sameSlotIndex ? nextItem : m
            );
        } else {
            nextMeasurements.push(nextItem);
        }
    }

    const next: Activity7RunDraft = {
        ...d,
        measurements: nextMeasurements,
        updatedAt: ts,
    };

    next.metrics = computeSessionMetrics(next);

    drafts.set(runId, next);
    return next;
}

export function removeActivity7Measurement(
    runId: string,
    measurementId: string
): Activity7RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 7 draft not found.");

    const next: Activity7RunDraft = {
        ...d,
        measurements: d.measurements.filter((m) => m.id !== measurementId),
        updatedAt: now(),
    };

    next.metrics = computeSessionMetrics(next);

    drafts.set(runId, next);
    return next;
}

/* =========================================================
   Updates: GPS / Evidence / Reflection
========================================================= */

export function setActivity7SessionGeo(
    runId: string,
    geo:
        | {
        lat: number;
        lng: number;
        accuracyM?: number;
        capturedAt?: number;
    }
        | undefined
): Activity7RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 7 draft not found.");

    const next: Activity7RunDraft = {
        ...d,
        session: {
            ...d.session,
            geo: geo
                ? {
                    lat: geo.lat,
                    lng: geo.lng,
                    accuracyM: geo.accuracyM,
                    capturedAt: geo.capturedAt ?? now(),
                }
                : undefined,
        },
        updatedAt: now(),
    };

    drafts.set(runId, next);
    return next;
}

export function setActivity7GpsPermission(
    runId: string,
    gpsPermission: GpsPermissionStatus
): Activity7RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 7 draft not found.");

    const next: Activity7RunDraft = {
        ...d,
        session: {
            ...d.session,
            gpsPermission,
        },
        updatedAt: now(),
    };

    drafts.set(runId, next);
    return next;
}

export function setActivity7SessionVideo(
    runId: string,
    video: EvidenceDraft | undefined
): Activity7RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 7 draft not found.");

    const next: Activity7RunDraft = {
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

export function setActivity7Reflection(
    runId: string,
    patch: Partial<A7ReflectionDraft>
): Activity7RunDraft {
    const d = drafts.get(runId);
    if (!d) throw new Error("Activity 7 draft not found.");

    const nextRating =
        patch.rating == null ? d.reflection?.rating : clampInt(patch.rating, 1, 5);

    const next: Activity7RunDraft = {
        ...d,
        reflection: {
            ...d.reflection,
            ...patch,
            reflectionText:
                trimOrUndef(patch.reflectionText) ?? d.reflection?.reflectionText,
            wereYouRight: trimOrUndef(patch.wereYouRight) ?? d.reflection?.wereYouRight,
            highestBreathingRate:
                trimOrUndef(patch.highestBreathingRate) ??
                d.reflection?.highestBreathingRate,
            surprises: trimOrUndef(patch.surprises) ?? d.reflection?.surprises,
            exerciseEffect:
                trimOrUndef(patch.exerciseEffect) ?? d.reflection?.exerciseEffect,
            rating: nextRating,
        },
        updatedAt: now(),
    };

    drafts.set(runId, next);
    return next;
}

/* =========================================================
   Flow helpers
========================================================= */

export const A7_REQUIRED_PHASES: A7MeasurementPhase[] = [
    "rest",
    "post_jog_1min",
    "post_star_jumps_100",
];

export function getA7ParticipantPhaseCompletion(
    d: Activity7RunDraft,
    participantId: string
): Record<A7MeasurementPhase, boolean> {
    return {
        rest: !!getMeasurementForPhase(d.measurements, participantId, "rest"),
        post_jog_1min: !!getMeasurementForPhase(
            d.measurements,
            participantId,
            "post_jog_1min"
        ),
        post_star_jumps_100: !!getMeasurementForPhase(
            d.measurements,
            participantId,
            "post_star_jumps_100"
        ),
    };
}

export function isA7ParticipantComplete(
    d: Activity7RunDraft,
    participantId: string
): boolean {
    const c = getA7ParticipantPhaseCompletion(d, participantId);
    return c.rest && c.post_jog_1min && c.post_star_jumps_100;
}

export function getA7NextMeasurementSlot(
    d: Activity7RunDraft
):
    | {
    participantId: string;
    phase: A7MeasurementPhase;
}
    | null {
    for (const p of d.session.participants ?? []) {
        for (const phase of A7_REQUIRED_PHASES) {
            const hasMeasurement = !!getMeasurementForPhase(d.measurements, p.id, phase);
            if (!hasMeasurement) {
                return {
                    participantId: p.id,
                    phase,
                };
            }
        }
    }

    return null;
}

/* =========================================================
   Validators
========================================================= */

export function validateA7Session(d: Activity7RunDraft): string | null {
    const s = d.session;

    if (s.participantCount < 1 || s.participantCount > 6) {
        return "Participant count must be between 1 and 6.";
    }

    if (!Array.isArray(s.participants) || s.participants.length !== s.participantCount) {
        return "Participants not initialized correctly. Please restart the session.";
    }

    if (
        !Number.isFinite(s.measurementDurationSec) ||
        s.measurementDurationSec < 10 ||
        s.measurementDurationSec > 120
    ) {
        return "Measurement duration must be between 10 and 120 seconds.";
    }

    if (
        s.targetSamplingHz != null &&
        (!Number.isFinite(s.targetSamplingHz) ||
            s.targetSamplingHz < 1 ||
            s.targetSamplingHz > 500)
    ) {
        return "Target sampling rate must be between 1 and 500 Hz.";
    }

    if (
        s.smoothingWindowSec != null &&
        (!Number.isFinite(s.smoothingWindowSec) ||
            s.smoothingWindowSec < 0.1 ||
            s.smoothingWindowSec > 5)
    ) {
        return "Signal smoothing window must be between 0.1 and 5 seconds.";
    }

    if (
        s.minPeakGapMs != null &&
        (!Number.isFinite(s.minPeakGapMs) ||
            s.minPeakGapMs < 500 ||
            s.minPeakGapMs > 10000)
    ) {
        return "Minimum gap between breathing peaks must be between 500 and 10000 ms.";
    }

    return null;
}

export function validateA7Prediction(d: Activity7RunDraft): string | null {
    const p = d.prediction;
    if (!p) return "Prediction is required before starting measurements.";
    if (!isFiniteNumber(p.predictedRestBpm)) {
        return "Please enter the predicted breathing rate at rest.";
    }
    if (!isFiniteNumber(p.predictedAfterExerciseBpm)) {
        return "Please enter the predicted breathing rate after exercise.";
    }
    return null;
}

export function validateA7MeasurementCoverage(d: Activity7RunDraft): string[] {
    const missing: string[] = [];

    for (const p of d.session.participants ?? []) {
        const rest = getMeasurementForPhase(d.measurements, p.id, "rest");
        const jog = getMeasurementForPhase(d.measurements, p.id, "post_jog_1min");
        const star = getMeasurementForPhase(
            d.measurements,
            p.id,
            "post_star_jumps_100"
        );

        if (!rest) missing.push(`${p.name}: rest measurement`);
        if (!jog) missing.push(`${p.name}: post-jog measurement`);
        if (!star) missing.push(`${p.name}: post-star-jumps measurement`);
    }

    return missing;
}

export function validateA7MeasurementDatasets(d: Activity7RunDraft): string[] {
    const missing: string[] = [];

    for (const p of d.session.participants ?? []) {
        for (const phase of A7_REQUIRED_PHASES) {
            const m = getMeasurementForPhase(d.measurements, p.id, phase);
            if (!m) continue;

            if (!Array.isArray(m.samples) || m.samples.length === 0) {
                missing.push(`${p.name}: ${getA7PhaseLabel(phase)} sensor dataset`);
            }

            if (!isFiniteNumber(m.estimatedBreathsPerMin)) {
                missing.push(`${p.name}: ${getA7PhaseLabel(phase)} estimated BPM`);
            }
        }
    }

    return missing;
}

/**
 * Submission-level validation.
 * Required:
 * - valid session
 * - prediction
 * - all required participant/phase measurements
 * - sensor dataset for each measurement
 * - reflection text
 * - rating
 * - GPS permission + coordinates when gpsEnabled
 *
 * Optional:
 * - video evidence
 */
export function validateA7Submission(d: Activity7RunDraft): string[] {
    const missing: string[] = [];

    const sessionErr = validateA7Session(d);
    if (sessionErr) missing.push(`Session: ${sessionErr}`);

    if (validateA7Prediction(d)) missing.push("Prediction entry");

    const coverage = validateA7MeasurementCoverage(d);
    if (coverage.length) missing.push(...coverage);

    const datasets = validateA7MeasurementDatasets(d);
    if (datasets.length) missing.push(...datasets);

    if (!trimOrUndef(d.reflection?.reflectionText)) missing.push("Reflection text");
    if (d.reflection?.rating == null) missing.push("Rating (1–5)");

    if (d.session.gpsEnabled) {
        if (d.session.gpsPermission !== "granted") missing.push("GPS permission granted");
        if (!d.session.geo) missing.push("GPS coordinates captured");
    }

    return missing;
}

/* =========================================================
   Leaderboard helpers
========================================================= */

/**
 * Activity 7 leaderboard philosophy:
 * lower recoveryConsistencyScore is better.
 * A run is eligible only if every participant has all 3 required phases completed
 * and each summary has a computed recovery consistency score.
 */
export function isA7LeaderboardEligible(d: Activity7RunDraft): boolean {
    const participants = d.session.participants ?? [];
    if (participants.length === 0) return false;

    const metrics = d.metrics ?? computeSessionMetrics(d);
    const map = new Map(metrics.participantSummaries.map((s) => [s.participantId, s]));

    for (const p of participants) {
        const summary = map.get(p.id);
        if (!summary) return false;

        if (!isFiniteNumber(summary.restBpm)) return false;
        if (!isFiniteNumber(summary.postJogBpm)) return false;
        if (!isFiniteNumber(summary.postStarJumpBpm)) return false;
        if (!isFiniteNumber(summary.recoveryConsistencyScore)) return false;
    }

    return true;
}

export function getA7LeaderboardMetrics(d: Activity7RunDraft): {
    eligible: boolean;
    teamRecoveryConsistencyScore?: number;
    bestParticipantId?: string;
    bestParticipantRecoveryConsistencyScore?: number;
} {
    const metrics = d.metrics ?? computeSessionMetrics(d);
    const eligible = isA7LeaderboardEligible(d);

    const ranked = [...metrics.participantSummaries]
        .filter((s) => isFiniteNumber(s.recoveryConsistencyScore))
        .sort((a, b) => a.recoveryConsistencyScore! - b.recoveryConsistencyScore!);

    return {
        eligible,
        teamRecoveryConsistencyScore: metrics.teamRecoveryConsistencyScore,
        bestParticipantId: ranked[0]?.participantId,
        bestParticipantRecoveryConsistencyScore: ranked[0]?.recoveryConsistencyScore,
    };
}