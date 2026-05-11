// src/features/activities/services/activity7BreathingService.ts

/**
 * Activity 7 – Breathing Pace Trainer service
 * Responsibilities:
 * 1) Convert accelerometer chest-motion samples into a stable 1D signal
 * 2) Detrend + smooth + normalize the signal for breathing analysis
 * 3) Detect likely breathing cycles conservatively
 * 4) Estimate breaths per minute (BPM) from sensor data
 * 5) Compute per-participant comparison metrics and recovery consistency
 *
 * NOTE:
 * - This service is UI-agnostic.
 * - This service does NOT depend on store CRUD/state logic.
 * - Screens / stores map their own draft types into these service-facing types.
 */

/* =========================================================
   Service-facing Types
========================================================= */

export type A7MeasurementPhase =
    | "rest"
    | "post_jog_1min"
    | "post_star_jumps_100";

export type A7SensorSample = {
    timestamp: number; // epoch ms
    x: number;
    y: number;
    z: number;
    magnitude?: number; // optional cached magnitude
};

export type A7SignalPoint = {
    timestamp: number;
    value: number;
};

export type A7Peak = {
    timestamp: number;
    value: number;
    index: number;
};

export type A7SamplingMetadata = {
    targetSamplingHz?: number;
    actualSamplingHz?: number;
    sampleCount: number;
};

export type A7BreathingEstimationConfig = {
    smoothingWindowSec?: number;
    detrendWindowSec?: number;
    minPeakGapMs?: number;
    minProminence?: number;
};

export type A7BreathingEstimationResult = {
    breathsPerMinute?: number;
    detectedCycles: number;
    durationMs: number;
    sampleCount: number;
    sampling: A7SamplingMetadata;
    peaks: A7Peak[];
    filteredSignal: A7SignalPoint[];
    quality: {
        status: "good" | "limited" | "insufficient";
        reason?: string;
    };
};

export type A7PredictionInput = {
    predictedRestBpm?: number;
    predictedAfterExerciseBpm?: number;
};

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

export type A7ParticipantPhaseMap = {
    participantId: string;
    restBpm?: number;
    postJogBpm?: number;
    postStarJumpBpm?: number;
};

/* =========================================================
   Constants
========================================================= */

export const A7_DEFAULT_SMOOTHING_WINDOW_SEC = 0.6;
export const A7_DEFAULT_DETREND_WINDOW_SEC = 2.5;
export const A7_DEFAULT_MIN_PEAK_GAP_MS = 1_200;
export const A7_DEFAULT_MIN_PROMINENCE = 0.02;

export const A7_MIN_DURATION_MS = 8_000;
export const A7_MIN_REQUIRED_SAMPLES = 10;

export const A7_MIN_SMOOTHING_WINDOW_SEC = 0.1;
export const A7_MAX_SMOOTHING_WINDOW_SEC = 5.0;

export const A7_MIN_DETREND_WINDOW_SEC = 0.5;
export const A7_MAX_DETREND_WINDOW_SEC = 10.0;

export const A7_MIN_PEAK_GAP_MS = 500;
export const A7_MAX_PEAK_GAP_MS = 10_000;

/* =========================================================
   Helpers
========================================================= */

function clampNum(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function safeFinite(x: unknown): number {
    return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}

function mean(xs: number[]): number {
    if (xs.length === 0) return 0;
    return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function variance(xs: number[]): number {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length;
}

function stdDev(xs: number[]): number {
    return Math.sqrt(variance(xs));
}

function median(xs: number[]): number {
    if (xs.length === 0) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

function round(value: number, digits = 3): number {
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

function meanDeltaMs(timestamps: number[]): number | undefined {
    if (timestamps.length < 2) return undefined;

    const diffs: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
        const dt = timestamps[i] - timestamps[i - 1];
        if (dt > 0) diffs.push(dt);
    }

    if (diffs.length === 0) return undefined;
    return mean(diffs);
}

function computeSamplingHzFromTimestamps(timestamps: number[]): number | undefined {
    const dt = meanDeltaMs(timestamps);
    if (!isFiniteNumber(dt) || dt <= 0) return undefined;
    return 1000 / dt;
}

/* =========================================================
   Signal conversion
========================================================= */

/**
 * Magnitude reduces sensitivity to phone orientation.
 * This is safer than selecting only one axis.
 */
export function computeMagnitude(x: number, y: number, z: number): number {
    return Math.sqrt(x * x + y * y + z * z);
}

export function sanitizeSensorSamples(samples: A7SensorSample[] | undefined): A7SensorSample[] {
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
        .map((s) => ({
            timestamp: Math.max(0, Math.round(s.timestamp)),
            x: safeFinite(s.x),
            y: safeFinite(s.y),
            z: safeFinite(s.z),
            magnitude: isFiniteNumber(s.magnitude)
                ? s.magnitude
                : computeMagnitude(s.x, s.y, s.z),
        }))
        .sort((a, b) => a.timestamp - b.timestamp);
}

export function toMagnitudeSignal(samples: A7SensorSample[]): A7SignalPoint[] {
    return sanitizeSensorSamples(samples).map((s) => ({
        timestamp: s.timestamp,
        value: isFiniteNumber(s.magnitude)
            ? s.magnitude
            : computeMagnitude(s.x, s.y, s.z),
    }));
}

/* =========================================================
   Signal processing
========================================================= */

/**
 * Remove slow baseline drift using a moving average.
 * This helps isolate periodic breathing motion from posture / gravity bias.
 */
export function detrendSignal(
    signal: A7SignalPoint[],
    windowSec = A7_DEFAULT_DETREND_WINDOW_SEC
): A7SignalPoint[] {
    if (signal.length === 0) return [];

    const timestamps = signal.map((p) => p.timestamp);
    const samplingHz = computeSamplingHzFromTimestamps(timestamps) ?? 25;

    const winSec = clampNum(
        windowSec,
        A7_MIN_DETREND_WINDOW_SEC,
        A7_MAX_DETREND_WINDOW_SEC
    );
    const windowSize = Math.max(3, Math.round(winSec * samplingHz));
    const radius = Math.floor(windowSize / 2);

    const out: A7SignalPoint[] = [];

    for (let i = 0; i < signal.length; i++) {
        const start = Math.max(0, i - radius);
        const end = Math.min(signal.length - 1, i + radius);

        let sum = 0;
        let count = 0;

        for (let j = start; j <= end; j++) {
            sum += signal[j].value;
            count++;
        }

        const baseline = count > 0 ? sum / count : 0;

        out.push({
            timestamp: signal[i].timestamp,
            value: signal[i].value - baseline,
        });
    }

    return out;
}

/**
 * Moving-average smoothing for chest-motion signal.
 * Conservative smoothing is preferred to avoid fake peaks.
 */
export function smoothSignal(
    signal: A7SignalPoint[],
    windowSec = A7_DEFAULT_SMOOTHING_WINDOW_SEC
): A7SignalPoint[] {
    if (signal.length === 0) return [];

    const timestamps = signal.map((p) => p.timestamp);
    const samplingHz = computeSamplingHzFromTimestamps(timestamps) ?? 25;

    const winSec = clampNum(
        windowSec,
        A7_MIN_SMOOTHING_WINDOW_SEC,
        A7_MAX_SMOOTHING_WINDOW_SEC
    );
    const windowSize = Math.max(3, Math.round(winSec * samplingHz));
    const radius = Math.floor(windowSize / 2);

    const out: A7SignalPoint[] = [];

    for (let i = 0; i < signal.length; i++) {
        const start = Math.max(0, i - radius);
        const end = Math.min(signal.length - 1, i + radius);

        let sum = 0;
        let count = 0;

        for (let j = start; j <= end; j++) {
            sum += signal[j].value;
            count++;
        }

        out.push({
            timestamp: signal[i].timestamp,
            value: count > 0 ? sum / count : signal[i].value,
        });
    }

    return out;
}

/**
 * Normalize to roughly zero-mean, unit-scale.
 * Keeps thresholds more stable across devices / sessions.
 */
export function normalizeSignal(signal: A7SignalPoint[]): A7SignalPoint[] {
    if (signal.length === 0) return [];

    const values = signal.map((p) => p.value);
    const m = mean(values);
    const sd = stdDev(values);

    if (!isFiniteNumber(sd) || sd < 1e-8) {
        return signal.map((p) => ({
            timestamp: p.timestamp,
            value: p.value - m,
        }));
    }

    return signal.map((p) => ({
        timestamp: p.timestamp,
        value: (p.value - m) / sd,
    }));
}

/**
 * Full default pipeline:
 * raw magnitude -> detrend -> smooth -> normalize
 */
export function prepareBreathingSignal(
    samples: A7SensorSample[],
    config: A7BreathingEstimationConfig = {}
): A7SignalPoint[] {
    const raw = toMagnitudeSignal(samples);
    const detrended = detrendSignal(
        raw,
        config.detrendWindowSec ?? A7_DEFAULT_DETREND_WINDOW_SEC
    );
    const smoothed = smoothSignal(
        detrended,
        config.smoothingWindowSec ?? A7_DEFAULT_SMOOTHING_WINDOW_SEC
    );
    return normalizeSignal(smoothed);
}

/* =========================================================
   Peak detection
========================================================= */

function estimateLocalProminence(
    signal: A7SignalPoint[],
    index: number,
    lookAround = 4
): number {
    const current = signal[index]?.value;
    if (!isFiniteNumber(current)) return 0;

    let leftMin = current;
    let rightMin = current;

    for (let i = Math.max(0, index - lookAround); i < index; i++) {
        leftMin = Math.min(leftMin, signal[i].value);
    }

    for (let i = index + 1; i <= Math.min(signal.length - 1, index + lookAround); i++) {
        rightMin = Math.min(rightMin, signal[i].value);
    }

    return current - Math.max(leftMin, rightMin);
}

/**
 * Conservative peak detector for breathing cycles.
 * If two peaks are too close, keep the stronger one.
 */
export function detectBreathingPeaks(args: {
    signal: A7SignalPoint[];
    minPeakGapMs?: number;
    minProminence?: number;
}): A7Peak[] {
    const signal = args.signal ?? [];
    if (signal.length < 3) return [];

    const minPeakGapMs = clampInt(
        args.minPeakGapMs ?? A7_DEFAULT_MIN_PEAK_GAP_MS,
        A7_MIN_PEAK_GAP_MS,
        A7_MAX_PEAK_GAP_MS
    );
    const minProminence = clampNum(
        args.minProminence ?? A7_DEFAULT_MIN_PROMINENCE,
        0,
        10
    );

    const baseline = median(signal.map((p) => p.value));
    const candidates: A7Peak[] = [];

    for (let i = 1; i < signal.length - 1; i++) {
        const prev = signal[i - 1];
        const curr = signal[i];
        const next = signal[i + 1];

        const isLocalMax = curr.value > prev.value && curr.value >= next.value;
        if (!isLocalMax) continue;

        if (curr.value < baseline) continue;

        const prominence = estimateLocalProminence(signal, i);
        if (prominence < minProminence) continue;

        candidates.push({
            timestamp: curr.timestamp,
            value: curr.value,
            index: i,
        });
    }

    if (candidates.length === 0) return [];

    const accepted: A7Peak[] = [];

    for (const peak of candidates) {
        const prev = accepted[accepted.length - 1];
        if (!prev) {
            accepted.push(peak);
            continue;
        }

        const dt = peak.timestamp - prev.timestamp;
        if (dt >= minPeakGapMs) {
            accepted.push(peak);
            continue;
        }

        if (peak.value > prev.value) {
            accepted[accepted.length - 1] = peak;
        }
    }

    return accepted;
}

/* =========================================================
   Sampling metadata
========================================================= */

export function buildSamplingMetadata(args: {
    signal: A7SignalPoint[];
    targetSamplingHz?: number;
}): A7SamplingMetadata {
    const timestamps = args.signal.map((p) => p.timestamp);
    const actualSamplingHz = computeSamplingHzFromTimestamps(timestamps);

    return {
        targetSamplingHz: isFiniteNumber(args.targetSamplingHz)
            ? clampNum(args.targetSamplingHz, 1, 500)
            : undefined,
        actualSamplingHz,
        sampleCount: args.signal.length,
    };
}

/* =========================================================
   BPM estimation
========================================================= */

export function estimateBreathsFromPreparedSignal(args: {
    signal: A7SignalPoint[];
    targetSamplingHz?: number;
    minPeakGapMs?: number;
    minProminence?: number;
}): A7BreathingEstimationResult {
    const signal = args.signal ?? [];
    const sampleCount = signal.length;
    const timestamps = signal.map((p) => p.timestamp);

    const durationMs =
        timestamps.length >= 2
            ? Math.max(0, timestamps[timestamps.length - 1] - timestamps[0])
            : 0;

    const sampling = buildSamplingMetadata({
        signal,
        targetSamplingHz: args.targetSamplingHz,
    });

    if (sampleCount < A7_MIN_REQUIRED_SAMPLES) {
        return {
            breathsPerMinute: undefined,
            detectedCycles: 0,
            durationMs,
            sampleCount,
            sampling,
            peaks: [],
            filteredSignal: signal,
            quality: {
                status: "insufficient",
                reason: "Too few sensor samples for reliable breathing estimation.",
            },
        };
    }

    if (durationMs < A7_MIN_DURATION_MS) {
        return {
            breathsPerMinute: undefined,
            detectedCycles: 0,
            durationMs,
            sampleCount,
            sampling,
            peaks: [],
            filteredSignal: signal,
            quality: {
                status: "insufficient",
                reason: "Measurement duration is too short for reliable breathing estimation.",
            },
        };
    }

    const peaks = detectBreathingPeaks({
        signal,
        minPeakGapMs: args.minPeakGapMs,
        minProminence: args.minProminence,
    });

    const detectedCycles = peaks.length;

    if (detectedCycles === 0) {
        return {
            breathsPerMinute: undefined,
            detectedCycles,
            durationMs,
            sampleCount,
            sampling,
            peaks,
            filteredSignal: signal,
            quality: {
                status: "insufficient",
                reason: "No stable breathing cycles were detected.",
            },
        };
    }

    const bpm = (detectedCycles / durationMs) * 60_000;

    let quality: A7BreathingEstimationResult["quality"] = {
        status: "good",
    };

    if (detectedCycles < 3) {
        quality = {
            status: "limited",
            reason: "Very few breathing cycles were detected; the BPM estimate may be unstable.",
        };
    } else if (
        isFiniteNumber(sampling.actualSamplingHz) &&
        sampling.actualSamplingHz < 5
    ) {
        quality = {
            status: "limited",
            reason: "Sampling rate appears low; the BPM estimate may be less stable.",
        };
    }

    return {
        breathsPerMinute: round(bpm, 2),
        detectedCycles,
        durationMs,
        sampleCount,
        sampling,
        peaks,
        filteredSignal: signal,
        quality,
    };
}

export function estimateBreathsFromSamples(args: {
    samples: A7SensorSample[];
    targetSamplingHz?: number;
    smoothingWindowSec?: number;
    detrendWindowSec?: number;
    minPeakGapMs?: number;
    minProminence?: number;
}): A7BreathingEstimationResult {
    const filteredSignal = prepareBreathingSignal(args.samples, {
        smoothingWindowSec: args.smoothingWindowSec,
        detrendWindowSec: args.detrendWindowSec,
    });

    return estimateBreathsFromPreparedSignal({
        signal: filteredSignal,
        targetSamplingHz: args.targetSamplingHz,
        minPeakGapMs: args.minPeakGapMs,
        minProminence: args.minProminence,
    });
}

/* =========================================================
   Comparison metrics
========================================================= */

export function computePhaseDelta(from?: number, to?: number): number | undefined {
    if (!isFiniteNumber(from) || !isFiniteNumber(to)) return undefined;
    return round(to - from, 2);
}

/**
 * Lower score is better.
 * - d1 = distance from rest after jog
 * - d2 = distance from rest after star jumps
 * - smaller difference between d1 and d2 = more consistent recovery
 * - smaller average gap from rest = better recovery
 */
export function computeRecoveryConsistencyScore(args: {
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

    return round(variability + meanGap * 0.25, 3);
}

export function computeMeasurementMetrics(args: {
    restBpm?: number;
    postJogBpm?: number;
    postStarJumpBpm?: number;
}) {
    return {
        deltaRestToJog: computePhaseDelta(args.restBpm, args.postJogBpm),
        deltaRestToStarJump: computePhaseDelta(args.restBpm, args.postStarJumpBpm),
        deltaJogToStarJump: computePhaseDelta(args.postJogBpm, args.postStarJumpBpm),
        recoveryConsistencyScore: computeRecoveryConsistencyScore(args),
    };
}

/* =========================================================
   Prediction comparison
========================================================= */

export function computePredictionComparison(args: {
    prediction?: A7PredictionInput;
    restBpm?: number;
    postJogBpm?: number;
    postStarJumpBpm?: number;
}): A7PredictionComparison {
    const {prediction, restBpm, postJogBpm, postStarJumpBpm} = args;

    return {
        restAbsError:
            isFiniteNumber(prediction?.predictedRestBpm) && isFiniteNumber(restBpm)
                ? round(Math.abs(restBpm - prediction!.predictedRestBpm!), 2)
                : undefined,

        postJogAbsError:
            isFiniteNumber(prediction?.predictedAfterExerciseBpm) &&
            isFiniteNumber(postJogBpm)
                ? round(Math.abs(postJogBpm - prediction!.predictedAfterExerciseBpm!), 2)
                : undefined,

        postStarJumpAbsError:
            isFiniteNumber(prediction?.predictedAfterExerciseBpm) &&
            isFiniteNumber(postStarJumpBpm)
                ? round(
                    Math.abs(
                        postStarJumpBpm - prediction!.predictedAfterExerciseBpm!
                    ),
                    2
                )
                : undefined,
    };
}

/* =========================================================
   Summary builders
========================================================= */

export function buildParticipantSummary(args: {
    participantId: string;
    restBpm?: number;
    postJogBpm?: number;
    postStarJumpBpm?: number;
    prediction?: A7PredictionInput;
}): A7ParticipantSummary {
    const metrics = computeMeasurementMetrics({
        restBpm: args.restBpm,
        postJogBpm: args.postJogBpm,
        postStarJumpBpm: args.postStarJumpBpm,
    });

    return {
        participantId: args.participantId,
        restBpm: args.restBpm,
        postJogBpm: args.postJogBpm,
        postStarJumpBpm: args.postStarJumpBpm,

        deltaRestToJog: metrics.deltaRestToJog,
        deltaRestToStarJump: metrics.deltaRestToStarJump,
        deltaJogToStarJump: metrics.deltaJogToStarJump,

        recoveryConsistencyScore: metrics.recoveryConsistencyScore,
        prediction: computePredictionComparison({
            prediction: args.prediction,
            restBpm: args.restBpm,
            postJogBpm: args.postJogBpm,
            postStarJumpBpm: args.postStarJumpBpm,
        }),
    };
}

export function buildSessionMetrics(
    participantSummaries: A7ParticipantSummary[]
): A7SessionMetrics {
    const summaries = [...(participantSummaries ?? [])];

    const ranked = summaries
        .filter((s) => isFiniteNumber(s.recoveryConsistencyScore))
        .sort((a, b) => (a.recoveryConsistencyScore ?? Infinity) - (b.recoveryConsistencyScore ?? Infinity));

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
        teamRecoveryConsistencyScore:
            recoveryScores.length > 0 ? round(mean(recoveryScores), 3) : undefined,
        avgRestBpm: rests.length > 0 ? round(mean(rests), 2) : undefined,
        avgPostJogBpm: jogs.length > 0 ? round(mean(jogs), 2) : undefined,
        avgPostStarJumpBpm: stars.length > 0 ? round(mean(stars), 2) : undefined,
    };
}

/**
 * Convenience builder if the caller already has phase values per participant.
 */
export function buildSessionMetricsFromPhaseMaps(args: {
    participants: A7ParticipantPhaseMap[];
    prediction?: A7PredictionInput;
}): A7SessionMetrics {
    const summaries = (args.participants ?? []).map((p) =>
        buildParticipantSummary({
            participantId: p.participantId,
            restBpm: p.restBpm,
            postJogBpm: p.postJogBpm,
            postStarJumpBpm: p.postStarJumpBpm,
            prediction: args.prediction,
        })
    );

    return buildSessionMetrics(summaries);
}

/* =========================================================
   Formatting helpers
========================================================= */

export function getA7PhaseLabel(phase: A7MeasurementPhase): string {
    switch (phase) {
        case "rest":
            return "Rest Measurement";
        case "post_jog_1min":
            return "Post-Exercise Measurement 1";
        case "post_star_jumps_100":
            return "Post-Exercise Measurement 2";
        default:
            return "Measurement";
    }
}

export function roundBpm(value?: number, digits = 1): number | undefined {
    if (!isFiniteNumber(value)) return undefined;
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
}

export function getEstimationQualityMessage(
    result: A7BreathingEstimationResult
): string {
    if (result.quality.status === "good") {
        return "Breathing estimate looks stable.";
    }

    if (result.quality.status === "limited") {
        return (
            result.quality.reason ??
            "Breathing estimate is available but may be less stable."
        );
    }

    return (
        result.quality.reason ??
        "Breathing estimate could not be computed reliably."
    );
}