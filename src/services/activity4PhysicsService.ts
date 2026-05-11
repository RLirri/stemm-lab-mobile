import {Platform, Vibration} from "react-native";
import {Accelerometer} from "expo-sensors";

/**
 * Raw accelerometer sample (g units) + time since start.
 * Kept local to physics service (best separation of concerns).
 */
export type A4AccelSample = {
    tMs: number;
    x: number;
    y: number;
    z: number;
};

/* =========================================================
   Constants
========================================================= */

export const A4_DEFAULT_DURATION_MS = 10_000; // FR-A4-01: 10 seconds
export const A4_DEFAULT_SAMPLE_INTERVAL_MS = 50; // 20 Hz

export type A4MeasurementResult = {
    durationMs: number;
    samples: A4AccelSample[];
    movementScore: number; // lower is better
    stats: {
        sampleCount: number;
        meanMag: number;
        rmsMag: number;
        peakMag: number;
        meanDeltaMag: number;
        rmsDeltaMag: number;
    };
};

export type StartEarthquakeMeasurementArgs = {
    durationMs?: number;
    sampleIntervalMs?: number;
    vibrate?: boolean;
};

function nowMs(): number {
    return Date.now();
}

function mag(x: number, y: number, z: number): number {
    return Math.sqrt(x * x + y * y + z * z);
}

function round3(x: number) {
    return Math.round(x * 1000) / 1000;
}

function computeMovementScore(samples: A4AccelSample[]): {
    movementScore: number;
    stats: A4MeasurementResult["stats"];
} {
    if (samples.length < 5) {
        return {
            movementScore: Number.POSITIVE_INFINITY,
            stats: {
                sampleCount: samples.length,
                meanMag: 0,
                rmsMag: 0,
                peakMag: 0,
                meanDeltaMag: 0,
                rmsDeltaMag: 0,
            },
        };
    }

    const mags = samples.map((s) => mag(s.x, s.y, s.z));

    const windowN = Math.min(10, mags.length);
    const baselineWindow = mags.slice(0, windowN).slice().sort((a, b) => a - b);
    const baseline =
        baselineWindow.length % 2 === 1
            ? baselineWindow[Math.floor(baselineWindow.length / 2)]
            : (baselineWindow[baselineWindow.length / 2 - 1] +
                baselineWindow[baselineWindow.length / 2]) /
            2;

    const dev = mags.map((m) => Math.abs(m - baseline));

    const rmsDev = Math.sqrt(dev.reduce((s, v) => s + v * v, 0) / dev.length);

    const meanMag = mags.reduce((s, v) => s + v, 0) / mags.length;
    const rmsMag = Math.sqrt(mags.reduce((s, v) => s + v * v, 0) / mags.length);
    const peakMag = mags.reduce((m, v) => Math.max(m, v), -Infinity);

    const deltas: number[] = [];
    for (let i = 1; i < mags.length; i++) deltas.push(Math.abs(mags[i] - mags[i - 1]));
    const meanDeltaMag = deltas.reduce((s, v) => s + v, 0) / deltas.length;
    const rmsDeltaMag = Math.sqrt(deltas.reduce((s, v) => s + v * v, 0) / deltas.length);

    // readable leaderboard numbers
    const movementScore = Math.round(rmsDev * 1000 * 10) / 10;

    return {
        movementScore,
        stats: {
            sampleCount: samples.length,
            meanMag: round3(meanMag),
            rmsMag: round3(rmsMag),
            peakMag: round3(peakMag),
            meanDeltaMag: round3(meanDeltaMag),
            rmsDeltaMag: round3(rmsDeltaMag),
        },
    };
}

function vibrateFor(durationMs: number) {
    if (durationMs <= 0) return;

    if (Platform.OS === "android") {
        Vibration.vibrate(durationMs);
        return;
    }

    const pulse = 300;
    const gap = 200;
    const pattern: number[] = [];
    let elapsed = 0;

    while (elapsed < durationMs) {
        pattern.push(gap, pulse);
        elapsed += gap + pulse;
    }

    Vibration.vibrate(pattern, false);
}

export async function startEarthquakeMeasurement(
    args: StartEarthquakeMeasurementArgs = {}
): Promise<A4MeasurementResult> {
    const durationMs = args.durationMs ?? A4_DEFAULT_DURATION_MS;
    const sampleIntervalMs = args.sampleIntervalMs ?? A4_DEFAULT_SAMPLE_INTERVAL_MS;
    const doVibrate = args.vibrate ?? true;

    if (durationMs < 1000) throw new Error("Duration too short (min 1s).");
    if (sampleIntervalMs < 10) throw new Error("Sample interval too fast (min 10ms).");

    Accelerometer.setUpdateInterval(sampleIntervalMs);

    const samples: A4AccelSample[] = [];
    const t0 = nowMs();

    const sub = Accelerometer.addListener((data) => {
        const t = nowMs() - t0;
        samples.push({
            tMs: t,
            x: safeFinite(data.x),
            y: safeFinite(data.y),
            z: safeFinite(data.z),
        });
    });

    try {
        if (doVibrate) vibrateFor(durationMs);

        await sleep(durationMs);

        Vibration.cancel();
        sub.remove();

        const {movementScore, stats} = computeMovementScore(samples);
        if (!Number.isFinite(movementScore)) {
            throw new Error("Failed to compute movement score (not enough samples).");
        }

        return {durationMs, samples, movementScore, stats};
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

export function computeEarthquakeMovementScore(samples: A4AccelSample[]) {
    return computeMovementScore(samples);
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function safeFinite(x: unknown): number {
    return typeof x === "number" && Number.isFinite(x) ? x : 0;
}