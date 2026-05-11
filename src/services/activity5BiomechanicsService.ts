import {Platform, Vibration} from "react-native";
import {Accelerometer} from "expo-sensors";

/**
 * Raw accelerometer sample (same pattern as A4 service)
 * Notes:
 * - Expo Accelerometer values are typically in G units on many devices.
 * - We treat them consistently within-session for baseline vs feedback comparison.
 */
export type A5AccelSample = {
    tMs: number;
    x: number;
    y: number;
    z: number;
};

/* =========================================================
   Constants
========================================================= */

export const A5_DEFAULT_DURATION_MS = 20_000; // guidance default (can be overridden per movement)
export const A5_DEFAULT_SAMPLING_HZ = 50; // good default balance
export const A5_MIN_DURATION_MS = 1_000;
export const A5_MIN_INTERVAL_MS = 10; // safety: don't go too fast

export type A5SmoothnessModel = "rms_variance"; // aligns with FR-A5-06 example

export type A5TrialStats = {
    sampleCount: number;
    meanMag: number;
    rmsMag: number;
    peakMag: number;
    meanDeltaMag: number;
    rmsDeltaMag: number;
    smoothnessIndex: number; // lower = smoother
    displacementMagnitudeCm: number; // approx
};

export type A5TrialMetrics = {
    durationSec: number;
    displacementMagnitudeCm: number;
    smoothnessIndex: number;
};

export type A5MovementTrialResult = {
    durationMs: number;
    samples: A5AccelSample[];
    metrics: A5TrialMetrics;
    stats: A5TrialStats;
};

export type A5FeedbackPolicy = {
    enabled: boolean;
    /**
     * If smoothness gets "worse than" this threshold (higher = more unstable),
     * we trigger a gentle vibration cue (best-effort).
     *
     * You will tune this later after seeing real device values.
     */
    smoothnessAlertThreshold?: number;

    /**
     * Minimum ms between vibration cues to avoid annoying the user.
     */
    minCueIntervalMs?: number;

    /**
     * Cue vibration duration (Android supports direct duration; iOS uses pattern).
     */
    cueVibrationMs?: number;

    /**
     * Window size for live smoothness estimation in ms.
     */
    liveWindowMs?: number;
};

export type StartMovementTrialArgs = {
    durationMs?: number;
    samplingHz?: number;
    feedbackPolicy?: A5FeedbackPolicy;
};

/* =========================================================
   Helpers
========================================================= */

function nowMs(): number {
    return Date.now();
}

function safeFinite(x: unknown): number {
    return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function mag(x: number, y: number, z: number): number {
    return Math.sqrt(x * x + y * y + z * z);
}

function round3(x: number) {
    return Math.round(x * 1000) / 1000;
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function samplingHzToIntervalMs(hz: number) {
    const h = clampInt(hz, 10, 100);
    return Math.max(A5_MIN_INTERVAL_MS, Math.round(1000 / h));
}

/* =========================================================
   Smoothness (FR-A5-06)
   Example: SmoothnessIndex = RMS(AccelerationVariance)
========================================================= */

function variance(arr: number[]): number {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const v =
        arr.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (arr.length - 1);
    return v;
}

function rms(arr: number[]): number {
    if (arr.length === 0) return 0;
    const m2 = arr.reduce((s, v) => s + v * v, 0) / arr.length;
    return Math.sqrt(m2);
}

/**
 * Compute SmoothnessIndex using "RMS of local-window variance of magnitude".
 * Lower = smoother.
 */
export function computeSmoothnessIndex(
    samples: A5AccelSample[],
    samplingHz: number,
    opts?: { windowMs?: number; hopRatio?: number }
): number {
    if (samples.length < 8) return Number.POSITIVE_INFINITY;

    const hz = clampInt(samplingHz, 10, 100);
    const windowMs = clampInt(opts?.windowMs ?? 250, 100, 2000);
    const win = Math.max(5, Math.round((hz * windowMs) / 1000));

    // hop = half window by default
    const hop = Math.max(1, Math.round(win * (opts?.hopRatio ?? 0.5)));

    const mags = samples.map((s) => mag(s.x, s.y, s.z));
    const vars: number[] = [];

    for (let i = 0; i + win <= mags.length; i += hop) {
        const chunk = mags.slice(i, i + win);
        vars.push(variance(chunk));
    }

    const smoothness = rms(vars);
    return Number.isFinite(smoothness) ? smoothness : Number.POSITIVE_INFINITY;
}

/* =========================================================
   Displacement magnitude (FR-A5-05) — approximate
========================================================= */

/**
 * Approximate displacement magnitude by integrating centered acceleration magnitude twice.
 * This drifts, but is consistent enough for within-session comparison.
 *
 * Returns displacement in centimeters.
 */
export function computeDisplacementMagnitudeCm(
    samples: A5AccelSample[],
    samplingHz: number
): number {
    if (samples.length < 8) return 0;

    const hz = clampInt(samplingHz, 10, 100);
    const dt = 1 / hz;

    const mags = samples.map((s) => mag(s.x, s.y, s.z));
    const meanMag = mags.reduce((a, b) => a + b, 0) / mags.length;
    const centered = mags.map((m) => m - meanMag);

    let v = 0; // velocity (unit depends on accel input)
    let d = 0; // displacement

    for (const a of centered) {
        v += a * dt;
        d += v * dt;
    }

    const cm = Math.abs(d) * 100;
    return Number.isFinite(cm) ? cm : 0;
}

/* =========================================================
   Feedback cue (best-effort)
========================================================= */

function vibrateCue(durationMs: number) {
    if (durationMs <= 0) return;

    if (Platform.OS === "android") {
        Vibration.vibrate(durationMs);
        return;
    }

    // iOS pattern: short pulse
    const pulse = Math.max(50, Math.min(500, durationMs));
    Vibration.vibrate([0, pulse], false);
}

/* =========================================================
   Core trial runner: startMovementTrial
========================================================= */

export async function startMovementTrial(
    args: StartMovementTrialArgs = {}
): Promise<A5MovementTrialResult> {
    const durationMs = args.durationMs ?? A5_DEFAULT_DURATION_MS;

    const samplingHz = clampInt(args.samplingHz ?? A5_DEFAULT_SAMPLING_HZ, 10, 100);
    const sampleIntervalMs = samplingHzToIntervalMs(samplingHz);

    if (durationMs < A5_MIN_DURATION_MS) throw new Error("Duration too short (min 1s).");
    if (sampleIntervalMs < A5_MIN_INTERVAL_MS) throw new Error("Sample interval too fast (min 10ms).");

    const feedback: A5FeedbackPolicy = {
        enabled: args.feedbackPolicy?.enabled ?? false,
        smoothnessAlertThreshold: args.feedbackPolicy?.smoothnessAlertThreshold ?? 0.08,
        minCueIntervalMs: args.feedbackPolicy?.minCueIntervalMs ?? 800,
        cueVibrationMs: args.feedbackPolicy?.cueVibrationMs ?? 120,
        liveWindowMs: args.feedbackPolicy?.liveWindowMs ?? 500,
    };

    Accelerometer.setUpdateInterval(sampleIntervalMs);

    const samples: A5AccelSample[] = [];
    const t0 = nowMs();

    let lastCueAt = 0;

    const sub = Accelerometer.addListener((data) => {
        const t = nowMs() - t0;
        samples.push({
            tMs: t,
            x: safeFinite(data.x),
            y: safeFinite(data.y),
            z: safeFinite(data.z),
        });

        // Live feedback (best-effort): estimate smoothness on the last window
        if (!feedback.enabled) return;

        const now = nowMs();
        if (now - lastCueAt < (feedback.minCueIntervalMs ?? 800)) return;

        const windowMs = feedback.liveWindowMs ?? 500;
        const cutoff = t - windowMs;
        if (cutoff < 0) return;

        // extract last-window samples
        const win = samples.filter((s) => s.tMs >= cutoff);
        if (win.length < 8) return;

        const sIdx = computeSmoothnessIndex(win, samplingHz, {windowMs: Math.max(150, windowMs)});

        if (
            Number.isFinite(sIdx) &&
            sIdx > (feedback.smoothnessAlertThreshold ?? 0.08)
        ) {
            vibrateCue(feedback.cueVibrationMs ?? 120);
            lastCueAt = now;
        }
    });

    try {
        await sleep(durationMs);

        Vibration.cancel();
        sub.remove();

        // Compute metrics + stats
        const mags = samples.map((s) => mag(s.x, s.y, s.z));

        const meanMag = mags.length ? mags.reduce((s, v) => s + v, 0) / mags.length : 0;
        const rmsMag = mags.length ? Math.sqrt(mags.reduce((s, v) => s + v * v, 0) / mags.length) : 0;
        const peakMag = mags.length ? mags.reduce((m, v) => Math.max(m, v), -Infinity) : 0;

        const deltas: number[] = [];
        for (let i = 1; i < mags.length; i++) deltas.push(Math.abs(mags[i] - mags[i - 1]));
        const meanDeltaMag = deltas.length ? deltas.reduce((s, v) => s + v, 0) / deltas.length : 0;
        const rmsDeltaMag = deltas.length ? Math.sqrt(deltas.reduce((s, v) => s + v * v, 0) / deltas.length) : 0;

        const smoothnessIndex = computeSmoothnessIndex(samples, samplingHz, {windowMs: 250});
        if (!Number.isFinite(smoothnessIndex) || smoothnessIndex === Number.POSITIVE_INFINITY) {
            throw new Error("Failed to compute smoothness index (not enough samples).");
        }

        const displacementMagnitudeCm = computeDisplacementMagnitudeCm(samples, samplingHz);

        const metrics: A5TrialMetrics = {
            durationSec: durationMs / 1000,
            displacementMagnitudeCm,
            smoothnessIndex,
        };

        const stats: A5TrialStats = {
            sampleCount: samples.length,
            meanMag: round3(meanMag),
            rmsMag: round3(rmsMag),
            peakMag: round3(peakMag),
            meanDeltaMag: round3(meanDeltaMag),
            rmsDeltaMag: round3(rmsDeltaMag),
            smoothnessIndex: round3(metrics.smoothnessIndex),
            displacementMagnitudeCm: round3(metrics.displacementMagnitudeCm),
        };

        return {
            durationMs,
            samples,
            metrics,
            stats,
        };
    } catch (e) {
        try {
            Vibration.cancel();
        } catch {
        }
        try {
            sub.remove();
        } catch {
        }
        throw e;
    }
}