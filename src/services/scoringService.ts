export type SoundRiskCategory =
    | "NO_RISK"
    | "SAFE"
    | "FATIGUE"
    | "POSSIBLE_DAMAGE"
    | "LIKELY_DAMAGE"
    | "SERIOUS_MINUTES"
    | "PAINFUL_IMMEDIATE"
    | "SEVERE_IMMEDIATE"
    | "INSTANT_PERMANENT";

export type SoundRiskBand = {
    minDb: number; // inclusive
    maxDb: number | null; // inclusive when number, null means infinity
    examples: string;
    rangeLabel: string;
    category: SoundRiskCategory;
    label: string;
    riskText: string;
    guidance: string;
};

// Matches your spec table (with a small interpretive label/guidance for UI)
export const SOUND_RISK_BANDS: SoundRiskBand[] = [
    {
        minDb: 0,
        maxDb: 30,
        rangeLabel: "0–30 dB",
        examples: "Whisper, quiet library",
        category: "NO_RISK",
        label: "No risk",
        riskText: "No risk",
        guidance: "No hearing risk.",
    },
    {
        minDb: 30,
        maxDb: 60,
        rangeLabel: "30–60 dB",
        examples: "Normal conversation, classroom noise",
        category: "SAFE",
        label: "Safe",
        riskText: "Safe",
        guidance: "Safe for long periods.",
    },
    {
        minDb: 60,
        maxDb: 85,
        rangeLabel: "60–85 dB",
        examples: "Busy traffic, vacuum cleaner",
        category: "FATIGUE",
        label: "Generally safe (fatigue possible)",
        riskText: "Generally safe (fatigue possible)",
        guidance: "Long exposure may cause fatigue or stress.",
    },
    {
        minDb: 85,
        maxDb: 90,
        rangeLabel: "85–90 dB",
        examples: "Lawn mower, loud classroom, heavy traffic",
        category: "POSSIBLE_DAMAGE",
        label: "Caution (possible damage)",
        riskText: "Caution (possible damage)",
        guidance: "Damage possible after long exposure. Limit time.",
    },
    {
        minDb: 90,
        maxDb: 100,
        rangeLabel: "90–100 dB",
        examples: "Motorbike, power tools, loud music",
        category: "LIKELY_DAMAGE",
        label: "Danger (likely damage)",
        riskText: "Danger (likely damage)",
        guidance: "Damage likely after short exposure. Consider protection.",
    },
    {
        minDb: 100,
        maxDb: 110,
        rangeLabel: "100–110 dB",
        examples: "Nightclub, rock concert, chainsaw",
        category: "SERIOUS_MINUTES",
        label: "Serious (minutes)",
        riskText: "Serious (minutes)",
        guidance: "Serious damage in minutes. Protection recommended.",
    },
    {
        minDb: 110,
        maxDb: 120,
        rangeLabel: "110–120 dB",
        examples: "Siren close by, car horn at 1 m",
        category: "PAINFUL_IMMEDIATE",
        label: "Painful (immediate damage possible)",
        riskText: "Painful (immediate damage possible)",
        guidance: "Painful; immediate damage possible. Avoid exposure.",
    },
    {
        minDb: 120,
        maxDb: 130,
        rangeLabel: "120–130 dB",
        examples: "Jet engine at close range",
        category: "SEVERE_IMMEDIATE",
        label: "Severe (immediate)",
        riskText: "Severe (immediate)",
        guidance: "Immediate and severe hearing damage.",
    },
    {
        minDb: 140,
        maxDb: null,
        rangeLabel: "140–++ dB",
        examples: "Explosion, gunshot",
        category: "INSTANT_PERMANENT",
        label: "Instant permanent damage",
        riskText: "Instant permanent damage",
        guidance: "Instant, permanent hearing damage.",
    },
];

export function classifySoundRisk(db: number) {
    const x = Math.max(0, db);

    // Find band by inclusive range; handle the 130–140 “gap” by mapping into nearest severe band.
    const band =
        SOUND_RISK_BANDS.find((b) => x >= b.minDb && (b.maxDb == null ? true : x <= b.maxDb)) ??
        (x > 130 && x < 140
            ? SOUND_RISK_BANDS.find((b) => b.minDb === 120 && b.maxDb === 130)!
            : SOUND_RISK_BANDS[SOUND_RISK_BANDS.length - 1]);

    return {
        category: band.category,
        label: band.label,
        examples: band.examples,
        guidance: band.guidance,
        band,
    };
}

/**
 * Valid reading rule for Activity 2:
 * - db must be finite
 * - duration must be >= 1 sec
 * - db in a plausible classroom range [0..160]
 */
export function isValidDbReading(db: unknown, durationSec: unknown): boolean {
    if (typeof db !== "number" || !Number.isFinite(db)) return false;
    if (typeof durationSec !== "number" || !Number.isFinite(durationSec)) return false;

    if (durationSec < 1) return false;
    if (db < 0 || db > 160) return false;

    return true;
}

/**
 * Activity 2 score = average(valid dbAvg)
 * Returns score and metadata for UI/validation.
 */
export function scoreActivity2AverageDb(
    measurements: Array<{ dbAvg?: number; durationSec?: number; isValid?: boolean }>
) {
    const valid = measurements.filter(
        (m) =>
            m.isValid === true &&
            typeof m.dbAvg === "number" &&
            typeof m.durationSec === "number" &&
            isValidDbReading(m.dbAvg, m.durationSec)
    );

    const validCount = valid.length;

    const avg =
        validCount === 0
            ? 0
            : valid.reduce((sum, m) => sum + (m.dbAvg as number), 0) / validCount;

    const score = Math.round(avg * 10) / 10; // 0.1 dB precision

    return {score, avgDb: score, validCount};
}