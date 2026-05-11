import type {ResultInsight} from "../../types/visualization";

export type A1PredictionPoint = {
    label: string;
    predictedTimeSec: number;
    actualTimeSec: number;
    errorPercent: number;
};

export type A1VisualizationResult = {
    points: A1PredictionPoint[];
    insight: ResultInsight;
    best?: A1PredictionPoint;
    averageErrorPercent?: number;
};

const G = 9.8;

export function theoreticalDropTimeSec(heightM: number): number | undefined {
    if (!Number.isFinite(heightM) || heightM <= 0) return undefined;
    return Math.sqrt((2 * heightM) / G);
}

export function buildA1Visualization(points: A1PredictionPoint[]): A1VisualizationResult {
    const valid = points
        .filter(
            p =>
                p.label.trim().length > 0 &&
                Number.isFinite(p.predictedTimeSec) &&
                Number.isFinite(p.actualTimeSec) &&
                Number.isFinite(p.errorPercent),
        )
        .sort((a, b) => a.errorPercent - b.errorPercent);

    if (valid.length === 0) {
        return {
            points: [],
            insight: {
                title: "Not enough data",
                message:
                    "Complete at least one drop attempt to compare theoretical and actual flight time.",
                severity: "neutral",
            },
        };
    }

    const best = valid[0];
    const averageErrorPercent =
        valid.reduce((sum, p) => sum + p.errorPercent, 0) / valid.length;

    return {
        points: valid,
        best,
        averageErrorPercent,
        insight: {
            title: `Closest result: ${best.label}`,
            message: `${best.label} had the closest match between theoretical and actual flight time, with an error of ${best.errorPercent.toFixed(
                1,
            )}%. The average prediction error across completed attempts was ${averageErrorPercent.toFixed(
                1,
            )}%.`,
            severity: "positive",
        },
    };
}