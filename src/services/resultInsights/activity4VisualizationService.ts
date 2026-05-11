// src/services/resultInsights/activity4VisualizationService.ts

import type {ChartPoint, ResultInsight} from "../../types/visualization";

export type A4VisualizationTrial = {
    label: string;
    movementScore: number; // lower is better
};

export type A4VisualizationResult = {
    chartData: ChartPoint[];
    insight: ResultInsight;
};

const BEST_COLOR = "#16A34A";
const MIDDLE_COLOR = "#F59E0B";
const WORST_COLOR = "#EF4444";

function getPerformanceColor(index: number, total: number): string {
    if (total === 1) return BEST_COLOR;
    if (index === 0) return BEST_COLOR;
    if (index === total - 1) return WORST_COLOR;
    return MIDDLE_COLOR;
}

export function buildA4Visualization(
    trials: A4VisualizationTrial[]
): A4VisualizationResult {
    const valid = trials
        .filter(t => t.label.trim().length > 0 && Number.isFinite(t.movementScore))
        .sort((a, b) => a.movementScore - b.movementScore); // lower = better

    const chartData: ChartPoint[] = valid.map((trial, index) => ({
        label: trial.label,
        value: Number(trial.movementScore.toFixed(2)),
        frontColor: getPerformanceColor(index, valid.length),
    }));

    if (valid.length === 0) {
        return {
            chartData: [],
            insight: {
                title: "Not enough data",
                message: "Complete trials to see structural performance analysis.",
                severity: "neutral",
            },
        };
    }

    const best = valid[0];
    const worst = valid[valid.length - 1];
    const difference = worst.movementScore - best.movementScore;

    return {
        chartData,
        insight: {
            title: `Most stable: ${best.label}`,
            message: `${best.label} recorded the lowest movement score (${best.movementScore.toFixed(
                2
            )}), indicating the highest structural stability under vibration. The performance gap between the strongest and weakest design was ${difference.toFixed(
                2
            )}, showing a clear variation in structural performance.`,
            severity: "positive",
        },
    };
}