// src/services/activity3PhysicsService.ts
import type {A3MeasurementDraft, Activity3RunDraft, FanDistanceCm, FanMaterial,} from "../store/activity3RunDraftStore";

/* =========================================================
   Constants
========================================================= */

export const A3_DISTANCES: FanDistanceCm[] = [15, 30, 45];
export const A3_MATERIALS: FanMaterial[] = ["paper", "cardboard"];

export const A3_MIN_MEASUREMENTS_FOR_SUBMISSION = 3;

// Angle sanity:
export const A3_ANGLE_MIN_DEG = 0;
export const A3_ANGLE_TYPICAL_MAX_DEG = 90;
export const A3_ANGLE_HARD_MAX_DEG = 180;

// Optional stiffness sanity (school-safe bounds)
export const A3_K_MIN = 0.001;
export const A3_K_MAX = 10;

/* =========================================================
   Small utilities
========================================================= */

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
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/* =========================================================
   Measurement validation + derivations (NO draft mutation)
========================================================= */

export type A3ValidationResult = {
    isValid: boolean;
    warnings: string[];
    derived?: {
        thetaRad: number;
        // If Advanced Mode & k exists, estimate force proxy: F ≈ k · θ(rad)
        approxForce?: number;
        // Always provide a monotonic index (unitless) so UI can still show something in basic mode.
        forceIndex: number;
    };
};

/**
 * Validate a measurement record and compute derived values.
 * Uses:
 * - m.designIndex
 * - m.distanceCm
 * - m.material
 * - m.bendAngleDeg
 * - draft.session.advancedMode + draft.session.stiffnessK
 */
export function validateAndDeriveMeasurement(args: {
    draft: Activity3RunDraft;
    m: A3MeasurementDraft;
}): A3ValidationResult {
    const {draft, m} = args;
    const warnings: string[] = [];

    // Basic required fields
    if (
        !Number.isInteger(m.designIndex) ||
        m.designIndex < 0 ||
        m.designIndex >= draft.session.fanDesignCount
    ) {
        return {isValid: false, warnings: ["Missing/invalid design index."]};
    }
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
            warnings: [
                `Bend angle is too large (> ${A3_ANGLE_HARD_MAX_DEG}°). Re-check your value.`,
            ],
        };
    }
    if (m.bendAngleDeg > A3_ANGLE_TYPICAL_MAX_DEG) {
        warnings.push("Angle > 90° is unusual — double-check your estimate.");
    }

    const thetaRad = degToRad(m.bendAngleDeg);
    const forceIndex = thetaRad * 100; // unitless proxy for “more bend => more effect”

    let approxForce: number | undefined;
    if (draft.session.advancedMode && isFiniteNumber(draft.session.stiffnessK)) {
        const k = draft.session.stiffnessK!;
        if (k < A3_K_MIN || k > A3_K_MAX) {
            warnings.push(`k looks unusual (expected ~${A3_K_MIN}–${A3_K_MAX}).`);
        } else {
            approxForce = k * thetaRad;
        }
    }

    return {
        isValid: true,
        warnings,
        derived: {
            thetaRad: roundTo(thetaRad, 4),
            forceIndex: roundTo(forceIndex, 2),
            approxForce: approxForce != null ? roundTo(approxForce, 4) : undefined,
        },
    };
}

/* =========================================================
   Batch validation helper (NO store mutation)
========================================================= */

export type A3ValidatedMeasurement = A3MeasurementDraft & {
    isValid: boolean;
    warnings: string[];
    derived?: A3ValidationResult["derived"];
};

export type A3ValidatedDraft = Activity3RunDraft & {
    measurements: A3ValidatedMeasurement[];
};

export function validateAllMeasurements(draft: Activity3RunDraft): A3ValidatedDraft {
    const measurements: A3ValidatedMeasurement[] = draft.measurements.map((m) => {
        const r = validateAndDeriveMeasurement({draft, m});
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
   Evidence policy (matches YOUR draft)
========================================================= */

export function hasSessionVideoEvidence(draft: Activity3RunDraft): boolean {
    return Boolean(draft.evidence?.sessionVideo?.uri);
}

/* =========================================================
   Summary statistics (Results + Compare + Leaderboard)
========================================================= */

export type A3Summary = {
    validCount: number;
    avgAngleDeg: number;

    bestDesignIndex?: number;
    bestDesignAvgDeg?: number;

    byDistance: Partial<Record<FanDistanceCm, number>>;
    byMaterial: Partial<Record<FanMaterial, number>>;

    // prediction check (based on your prediction shape)
    predictedBestDesignIndex?: number;
    predictedBestDistanceCm?: FanDistanceCm;
    wasPredictionCorrect?: boolean;
};

function validAngles(draft: Activity3RunDraft): Array<{ m: A3MeasurementDraft; angle: number }> {
    const rows: Array<{ m: A3MeasurementDraft; angle: number }> = [];

    for (const m of draft.measurements) {
        const r = validateAndDeriveMeasurement({draft, m});
        if (r.isValid && isFiniteNumber(m.bendAngleDeg)) {
            rows.push({m, angle: m.bendAngleDeg});
        }
    }
    return rows;
}

/**
 * Best design rule (FR-A3-06): highest average bend angle.
 * Tie-breaker: higher count, then lower designIndex (deterministic).
 */
function pickBestDesign(rows: Array<{ m: A3MeasurementDraft; angle: number }>): {
    bestDesignIndex?: number;
    bestDesignAvgDeg?: number;
} {
    const byDesign = new Map<number, number[]>();
    for (const r of rows) {
        const list = byDesign.get(r.m.designIndex) ?? [];
        list.push(r.angle);
        byDesign.set(r.m.designIndex, list);
    }

    let bestIndex: number | undefined;
    let bestAvg: number | undefined;
    let bestCount = -1;

    for (const [idx, xs] of byDesign.entries()) {
        const avg = safeAvg(xs);
        const count = xs.length;

        const wins =
            bestAvg == null ||
            avg > bestAvg ||
            (avg === bestAvg && count > bestCount) ||
            (avg === bestAvg && count === bestCount && idx < (bestIndex ?? Infinity));

        if (wins) {
            bestIndex = idx;
            bestAvg = avg;
            bestCount = count;
        }
    }

    return {
        bestDesignIndex: bestIndex,
        bestDesignAvgDeg: bestAvg != null ? roundTo(bestAvg, 2) : undefined,
    };
}

export function computeSummary(draft: Activity3RunDraft): A3Summary {
    const rows = validAngles(draft);
    const angles = rows.map((r) => r.angle);

    const avgAngleDeg = roundTo(safeAvg(angles), 2);
    const validCount = angles.length;

    // byDistance
    const byDistance: Partial<Record<FanDistanceCm, number>> = {};
    for (const d of A3_DISTANCES) {
        const xs = rows.filter((r) => r.m.distanceCm === d).map((r) => r.angle);
        if (xs.length) byDistance[d] = roundTo(safeAvg(xs), 2);
    }

    // byMaterial
    const byMaterial: Partial<Record<FanMaterial, number>> = {};
    for (const mat of A3_MATERIALS) {
        const xs = rows.filter((r) => r.m.material === mat).map((r) => r.angle);
        if (xs.length) byMaterial[mat] = roundTo(safeAvg(xs), 2);
    }

    const best = pickBestDesign(rows);

    // Prediction check (your draft.prediction is optional)
    const predictedBestDesignIndex = draft.prediction?.predictedBestDesignIndex;
    const predictedBestDistanceCm = draft.prediction?.predictedBestDistanceCm;

    const wasPredictionCorrect =
        typeof predictedBestDesignIndex === "number" &&
        typeof best.bestDesignIndex === "number" &&
        predictedBestDesignIndex === best.bestDesignIndex;

    return {
        validCount,
        avgAngleDeg,
        ...best,
        byDistance,
        byMaterial,
        predictedBestDesignIndex,
        predictedBestDistanceCm,
        wasPredictionCorrect:
            typeof predictedBestDesignIndex === "number" ? wasPredictionCorrect : undefined,
    };
}

/* =========================================================
   Submission gating (UI-level, matches your policy)
========================================================= */

export type A3SubmissionGate = {
    ok: boolean;
    reasons: string[];
    validCount: number;
    hasPrediction: boolean;
    hasVideo: boolean;
    // HD integrity counts
    missingDesigns: number[]; // indices that have 0 valid measurements
};

export function getSubmissionGate(draft: Activity3RunDraft): A3SubmissionGate {
    const reasons: string[] = [];

    const hasPrediction =
        typeof draft.prediction?.predictedBestDesignIndex === "number" &&
        typeof draft.prediction?.predictedBestDistanceCm === "number";

    const rows = validAngles(draft);
    const validCount = rows.length;

    const hasVideo = hasSessionVideoEvidence(draft);

    // HD scientific integrity: at least 1 valid measurement per design
    const perDesignValid = new Array(draft.session.fanDesignCount).fill(0);
    for (const r of rows) perDesignValid[r.m.designIndex]++;

    const missingDesigns = perDesignValid
        .map((c, i) => ({c, i}))
        .filter((x) => x.c < 1)
        .map((x) => x.i);

    if (!hasPrediction) reasons.push("Prediction is required before submission.");
    if (validCount < A3_MIN_MEASUREMENTS_FOR_SUBMISSION) {
        reasons.push(`At least ${A3_MIN_MEASUREMENTS_FOR_SUBMISSION} valid measurements are required.`);
    }
    if (missingDesigns.length) {
        reasons.push(
            `Each design needs at least 1 valid measurement (missing: ${missingDesigns
                .map((i) => `Design ${i + 1}`)
                .join(", ")}).`
        );
    }
    if (!hasVideo) reasons.push("A session video is required for submission.");

    return {
        ok: reasons.length === 0,
        reasons,
        validCount,
        hasPrediction,
        hasVideo,
        missingDesigns,
    };
}

/* =========================================================
   Next suggested condition (simple deterministic guidance)
   - helps students cover combos systematically
========================================================= */

export type A3NextCondition = {
    material: FanMaterial;
    distanceCm: FanDistanceCm;
    designIndex: number;
} | null;

/**
 * Suggest the next measurement condition to guide students:
 * order: paper@30 -> paper@15 -> paper@45 -> cardboard@30 -> cardboard@15 -> cardboard@45
 * iterating across designs.
 *
 * "complete" means: every (designIndex x material x distance) has at least 1 VALID measurement.
 */
export function suggestNextCondition(draft: Activity3RunDraft): A3NextCondition {
    const designCount = draft.session.fanDesignCount;
    if (designCount < 1) return null;

    const order: Array<{ material: FanMaterial; distanceCm: FanDistanceCm }> = [
        {material: "paper", distanceCm: 30},
        {material: "paper", distanceCm: 15},
        {material: "paper", distanceCm: 45},
        {material: "cardboard", distanceCm: 30},
        {material: "cardboard", distanceCm: 15},
        {material: "cardboard", distanceCm: 45},
    ];

    const hasValidFor = (designIndex: number, material: FanMaterial, distanceCm: FanDistanceCm) => {
        return draft.measurements.some((m) => {
            if (m.designIndex !== designIndex) return false;
            if (m.material !== material) return false;
            if (m.distanceCm !== distanceCm) return false;
            const r = validateAndDeriveMeasurement({draft, m});
            return r.isValid;
        });
    };

    for (const cond of order) {
        for (let designIndex = 0; designIndex < designCount; designIndex++) {
            if (!hasValidFor(designIndex, cond.material, cond.distanceCm)) {
                return {material: cond.material, distanceCm: cond.distanceCm, designIndex};
            }
        }
    }

    return null;
}