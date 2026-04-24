// src/services/resultInsights/activity5VisualizationService.ts

import type {ChartPoint, ResultInsight} from "../../types/visualization";

export type A5VisualizationTrial = {
    label: string;
    improvementScore: number; // higher is better
};

export type A5VisualizationResult = {
    chartData: ChartPoint[];
    insight: ResultInsight;
};

const BEST_COLOR = "#16A34A";
const MIDDLE_COLOR = "#F59E0B";
const LOW_COLOR = "#EF4444";

function getPerformanceColor(index: number, total: number): string {
    if (total === 1) return BEST_COLOR;
    if (index === 0) return BEST_COLOR;
    if (index === total - 1) return LOW_COLOR;
    return MIDDLE_COLOR;
}

export function buildA5Visualization(
    trials: A5VisualizationTrial[]
): A5VisualizationResult {
    const valid = trials
        .filter(
            t =>
                t.label.trim().length > 0 &&
                Number.isFinite(t.improvementScore)
        )
        .sort((a, b) => b.improvementScore - a.improvementScore); // higher = better

    const chartData: ChartPoint[] = valid.map((trial, index) => ({
        label: trial.label,
        value: Number(trial.improvementScore.toFixed(1)),
        frontColor: getPerformanceColor(index, valid.length),
    }));

    if (valid.length === 0) {
        return {
            chartData: [],
            insight: {
                title: "Not enough data",
                message:
                    "Complete baseline and feedback trials to generate improvement insights.",
                severity: "neutral",
            },
        };
    }

    const best = valid[0];
    const weakest = valid[valid.length - 1];
    const gap = best.improvementScore - weakest.improvementScore;

    return {
        chartData,
        insight: {
            title: `Best improvement: ${best.label}`,
            message: `${best.label} achieved the highest improvement score (${best.improvementScore.toFixed(
                1
            )}). This suggests the feedback trial produced smoother movement compared with the baseline. The performance gap compared with the lowest improvement result was ${gap.toFixed(
                1
            )}.`,
            severity: "positive",
        },
    };
}