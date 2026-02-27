import type {
    Activity3RunDraft,
    A3DistanceCm,
    A3Material,
    A3MeasurementDraft,
    A3FanDesignDraft,
} from "../store/activity3RunDraftStore";

/* =========================================================
   Constants
========================================================= */

export const A3_DISTANCES: A3DistanceCm[] = [15, 30, 45];
export const A3_MATERIALS: A3Material[] = ["paper", "cardboard"];

export const A3_MIN_MEASUREMENTS_FOR_SUBMISSION = 3;

// Angle sanity:
export const A3_ANGLE_MIN_DEG = 0;
export const A3_ANGLE_TYPICAL_MAX_DEG = 90;
// Allow > 90 but warn; still valid if numeric and non-negative.
export const A3_ANGLE_HARD_MAX_DEG = 180;

export const A3_K_MIN = 0.001;
export const A3_K_MAX = 10; // generous upper bound for school context

/* =========================================================
   Small utilities
========================================================= */

export function clamp(n: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, n));
}

export function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

export function roundTo(n: number, dp: number): number {
    const f = Math.pow(10, dp);
    return Math.round(n * f) / f;
}

export function degToRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

export function safeAvg(nums: number[]): number {
    if (!nums.length) return 0;
    const s = nums.reduce((a, b) => a + b, 0);
    return s / nums.length;
}

/* =========================================================
   Measurement validation + derivations
========================================================= */

export type A3ValidationResult = {
    isValid: boolean;
    warnings: string[];
    derived?: {
        thetaRad?: number;
        forceIndex?: number;
    };
};

/**
 * Validate and derive fields for a measurement draft.
 * - requires designId/material/distance
 * - requires bendAngleDeg numeric
 * - allows >90 with warning
 * - allows up to hard max 180 (beyond => invalid)
 * - advanced mode: if k exists => compute forceIndex
 */
export function validateAndDeriveMeasurement(args: {
    m: A3MeasurementDraft;
    advancedMode: boolean;
}): A3ValidationResult {
    const {m, advancedMode} = args;

    const warnings: string[] = [];

    // Basic required fields
    if (!m.designId) return {isValid: false, warnings: ["Missing design."]};
    if (!m.material) return {isValid: false, warnings: ["Missing material."]};
    if (!m.distanceCm) return {isValid: false, warnings: ["Missing distance."]};

    // Angle
    if (!isFiniteNumber(m.bendAngleDeg)) {
        return {isValid: false, warnings: ["Bend angle (degrees) is required."]};
    }
    if (m.bendAngleDeg < A3_ANGLE_MIN_DEG) {
        return {isValid: false, warnings: ["Bend angle cannot be negative."]};
    }
    if (m.bendAngleDeg > A3_ANGLE_HARD_MAX_DEG) {
        return {
            isValid: false,
            warnings: [`Bend angle is too large (> ${A3_ANGLE_HARD_MAX_DEG}°). Re-check your value.`],
        };
    }
    if (m.bendAngleDeg > A3_ANGLE_TYPICAL_MAX_DEG) {
        warnings.push("Angle > 90° is unusual — double-check your estimate.");
    }

    // Derived
    const thetaRad = degToRad(m.bendAngleDeg);

    let forceIndex: number | undefined = undefined;
    if (advancedMode) {
        if (m.kNPerRad != null) {
            if (!isFiniteNumber(m.kNPerRad)) {
                warnings.push("Stiffness coefficient k is not a valid number.");
            } else if (m.kNPerRad < A3_K_MIN || m.kNPerRad > A3_K_MAX) {
                warnings.push(`k looks unusual (expected ~${A3_K_MIN}–${A3_K_MAX} N/rad).`);
            } else {
                forceIndex = m.kNPerRad * thetaRad;
            }
        }
    }

    return {
        isValid: true,
        warnings,
        derived: {
            thetaRad: roundTo(thetaRad, 4),
            forceIndex: forceIndex != null ? roundTo(forceIndex, 4) : undefined,
        },
    };
}

/**
 * Convenience: validate all measurements and return a patched copy.
 * (Store update happens elsewhere.)
 */
export function validateAllMeasurements(draft: Activity3RunDraft): Activity3RunDraft {
    const advancedMode = !!draft.session.advancedMode;

    const measurements = draft.measurements.map((m) => {
        const r = validateAndDeriveMeasurement({m, advancedMode});
        return {
            ...m,
            isValid: r.isValid,
            warnings: r.warnings,
            derived: r.derived,
        };
    });

    return {
        ...draft,
        measurements,
    };
}

/* =========================================================
   Evidence policy
========================================================= */

export function countVideoEvidence(draft: Activity3RunDraft): number {
    const sessionHas = draft.session.sessionVideo?.type === "video" ? 1 : 0;
    const perMeasurement = draft.measurements.reduce((acc, m) => {
        return acc + (m.evidenceVideo?.type === "video" ? 1 : 0);
    }, 0);
    return sessionHas + perMeasurement;
}

/* =========================================================
   Summary statistics (for Results + Leaderboard)
========================================================= */

export type A3Summary = {
    validCount: number;
    avgAngleDeg: number;

    bestDesignId?: string;
    bestDesignAvgDeg?: number;

    byDistance: Partial<Record<A3DistanceCm, number>>;
    byMaterial: Partial<Record<A3Material, number>>;

    predictedBestDesignId?: string;
    wasPredictionCorrect?: boolean;
};

function validAngles(draft: Activity3RunDraft): Array<{ m: A3MeasurementDraft; angle: number }> {
    return draft.measurements
        .filter((m) => m.isValid && isFiniteNumber(m.bendAngleDeg))
        .map((m) => ({m, angle: m.bendAngleDeg as number}));
}

export function computeSummary(draft: Activity3RunDraft): A3Summary {
    const rows = validAngles(draft);
    const angles = rows.map((r) => r.angle);

    const avgAngleDeg = roundTo(safeAvg(angles), 2);
    const validCount = angles.length;

    // byDistance
    const byDistance: Partial<Record<A3DistanceCm, number>> = {};
    for (const d of A3_DISTANCES) {
        const xs = rows.filter((r) => r.m.distanceCm === d).map((r) => r.angle);
        if (xs.length) byDistance[d] = roundTo(safeAvg(xs), 2);
    }

    // byMaterial
    const byMaterial: Partial<Record<A3Material, number>> = {};
    for (const mat of A3_MATERIALS) {
        const xs = rows.filter((r) => r.m.material === mat).map((r) => r.angle);
        if (xs.length) byMaterial[mat] = roundTo(safeAvg(xs), 2);
    }

    // best design (highest average angle)
    let bestDesignId: string | undefined;
    let bestDesignAvgDeg: number | undefined;

    const byDesignMap = new Map<string, number[]>();
    for (const r of rows) {
        const list = byDesignMap.get(r.m.designId) ?? [];
        list.push(r.angle);
        byDesignMap.set(r.m.designId, list);
    }

    for (const [designId, xs] of byDesignMap.entries()) {
        const a = safeAvg(xs);
        if (bestDesignAvgDeg == null || a > bestDesignAvgDeg) {
            bestDesignAvgDeg = a;
            bestDesignId = designId;
        }
    }

    if (bestDesignAvgDeg != null) bestDesignAvgDeg = roundTo(bestDesignAvgDeg, 2);

    // prediction check
    const predictedBestDesignId = draft.session.prediction.predictedBestDesignId;
    const wasPredictionCorrect =
        !!predictedBestDesignId && !!bestDesignId && predictedBestDesignId === bestDesignId;

    return {
        validCount,
        avgAngleDeg,
        bestDesignId,
        bestDesignAvgDeg,
        byDistance,
        byMaterial,
        predictedBestDesignId,
        wasPredictionCorrect: predictedBestDesignId ? wasPredictionCorrect : undefined,
    };
}

export function resolveDesignLabel(designs: A3FanDesignDraft[], designId?: string): string | undefined {
    if (!designId) return undefined;
    const d = designs.find((x) => x.id === designId);
    if (!d) return undefined;
    // Prefer explicit name
    return d.name;
}

/* =========================================================
   Submission gating (data-only)
========================================================= */

export type A3SubmissionGate = {
    ok: boolean;
    reasons: string[];
    // helpful counts
    validCount: number;
    evidenceVideoCount: number;
    hasPrediction: boolean;
};

/**
 * Data-only gate:
 * - requires prediction (best design chosen)
 * - requires ≥3 valid measurements
 * - requires ≥1 video evidence (session or measurement)
 *
 * GPS is NOT checked here (permissions are a UI/service concern).
 */
export function getSubmissionGate(draft: Activity3RunDraft): A3SubmissionGate {
    const reasons: string[] = [];

    const hasPrediction = !!draft.session.prediction.predictedBestDesignId;

    const validated = validateAllMeasurements(draft);
    const validCount = validated.measurements.filter((m) => m.isValid).length;

    const evidenceVideoCount = countVideoEvidence(draft);

    if (!hasPrediction) reasons.push("Prediction is required before submission.");
    if (validCount < A3_MIN_MEASUREMENTS_FOR_SUBMISSION) {
        reasons.push(`At least ${A3_MIN_MEASUREMENTS_FOR_SUBMISSION} valid measurements are required.`);
    }
    if (evidenceVideoCount < 1) reasons.push("At least 1 video evidence is required.");

    return {
        ok: reasons.length === 0,
        reasons,
        validCount,
        evidenceVideoCount,
        hasPrediction,
    };
}

/* =========================================================
   Next suggested condition (simple, deterministic)
========================================================= */

/**
 * Suggest the next measurement condition to guide students:
 * order: paper@30 across designs -> paper@15 -> paper@45 -> cardboard@30 -> cardboard@15 -> cardboard@45
 *
 * Returns the first missing combo for the given design set, based on whether
 * any valid measurement exists for that combo.
 */
export function suggestNextCondition(draft: Activity3RunDraft): {
    material: A3Material;
    distanceCm: A3DistanceCm;
    designId?: string;
} | null {
    const designs = draft.designs;
    if (!designs.length) return null;

    const order: Array<{ material: A3Material; distanceCm: A3DistanceCm }> = [
        {material: "paper", distanceCm: 30},
        {material: "paper", distanceCm: 15},
        {material: "paper", distanceCm: 45},
        {material: "cardboard", distanceCm: 30},
        {material: "cardboard", distanceCm: 15},
        {material: "cardboard", distanceCm: 45},
    ];

    const hasValidFor = (designId: string, material: A3Material, distanceCm: A3DistanceCm) => {
        return draft.measurements.some(
            (m) =>
                m.designId === designId &&
                m.material === material &&
                m.distanceCm === distanceCm &&
                m.isValid
        );
    };

    for (const cond of order) {
        for (const d of designs) {
            if (!hasValidFor(d.id, cond.material, cond.distanceCm)) {
                return {material: cond.material, distanceCm: cond.distanceCm, designId: d.id};
            }
        }
    }

    return null; // complete
}