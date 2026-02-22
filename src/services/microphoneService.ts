import {Audio} from "expo-av";

export type MicReading = {
    durationSec: number;
    // These come from expo metering (usually dBFS, negative values).
    dbfsAvg: number;
    dbfsMax: number;

    // Estimated SPL-like dB (for classroom comparison), using calibration offset.
    dbAvg: number;
    dbMax: number;
};

export type MicMeasureOptions = {
    durationSec?: number; // default 3
    sampleIntervalMs?: number; // default 120
    calibrationOffsetDb?: number; // default 100 (maps dBFS to ~0..100+)
};

/**
 * Expo metering is commonly dBFS (not true SPL).
 * We provide a calibration offset to approximate "classroom dB".
 * You can expose calibration later in Session Setup.
 */
function dbfsToEstimatedDb(dbfs: number, offset: number) {
    // dbfs is typically negative (e.g., -45). Add offset (e.g., 100) => 55.
    const est = dbfs + offset;
    // Keep within plausible range to avoid UI weirdness
    return Math.max(0, Math.min(160, est));
}

async function ensureMicPermission() {
    const perm = await Audio.getPermissionsAsync();
    if (perm.status === "granted") return;

    const req = await Audio.requestPermissionsAsync();
    if (req.status !== "granted") {
        throw new Error("Microphone permission was not granted.");
    }
}

function mean(xs: number[]) {
    if (!xs.length) return -160;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function max(xs: number[]) {
    if (!xs.length) return -160;
    return xs.reduce((m, v) => (v > m ? v : m), xs[0]);
}

export async function measureSoundLevel(options?: MicMeasureOptions): Promise<MicReading> {
    const durationSec = options?.durationSec ?? 3;
    const sampleIntervalMs = options?.sampleIntervalMs ?? 120;
    const calibrationOffsetDb = options?.calibrationOffsetDb ?? 100;

    if (durationSec < 1 || durationSec > 10) {
        throw new Error("durationSec must be between 1 and 10 seconds.");
    }

    await ensureMicPermission();

    // Required on iOS to allow recording (and avoids silent failures on some devices)
    await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    const samples: number[] = [];

    try {
        // enableMetering is critical
        await recording.prepareToRecordAsync({
            ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
            android: {
                ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
            },
            ios: {
                ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
            },
            isMeteringEnabled: true as any, // expo-av typing varies by version
        } as any);

        await recording.startAsync();

        const start = Date.now();
        const end = start + durationSec * 1000;

        while (Date.now() < end) {
            const status = (await recording.getStatusAsync()) as any;

            // status.metering exists when metering enabled. Often ranges about [-160..0]
            const metering = typeof status.metering === "number" ? status.metering : -160;

            // Filter out impossible values
            if (Number.isFinite(metering)) samples.push(metering);

            await new Promise((r) => setTimeout(r, sampleIntervalMs));
        }

        await recording.stopAndUnloadAsync();

        const dbfsAvg = mean(samples);
        const dbfsMax = max(samples);

        const dbAvg = dbfsToEstimatedDb(dbfsAvg, calibrationOffsetDb);
        const dbMax = dbfsToEstimatedDb(dbfsMax, calibrationOffsetDb);

        return {
            durationSec,
            dbfsAvg,
            dbfsMax,
            dbAvg: Math.round(dbAvg * 10) / 10,
            dbMax: Math.round(dbMax * 10) / 10,
        };
    } catch (e: any) {
        // Attempt to stop/unload safely
        try {
            const st = await recording.getStatusAsync();
            if ((st as any)?.isRecording) await recording.stopAndUnloadAsync();
        } catch {
            // ignore
        }
        throw new Error(e?.message ?? "Failed to measure sound.");
    } finally {
        // Optional: reset audio mode
        await Audio.setAudioModeAsync({allowsRecordingIOS: false});
    }
}