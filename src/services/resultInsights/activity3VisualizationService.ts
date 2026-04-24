// src/services/resultInsights/activity3VisualizationService.ts

import type {ChartPoint, ResultInsight} from '../../types/visualization';

export type A3VisualizationTrial = {
    label: string;
    averageBendAngleDeg: number;
};

export type A3VisualizationResult = {
    chartData: ChartPoint[];
    insight: ResultInsight;
};

const CHART_COLORS = ['#2563EB', '#16A34A', '#F59E0B', '#7C3AED'];

export function buildA3Visualization(
    trials: A3VisualizationTrial[],
): A3VisualizationResult {
    const validTrials = trials.filter(
        trial =>
            trial.label.trim().length > 0 &&
            Number.isFinite(trial.averageBendAngleDeg),
    );

    const chartData: ChartPoint[] = validTrials.map((trial, index) => ({
        label: trial.label,
        value: Number(trial.averageBendAngleDeg.toFixed(1)),
        frontColor: CHART_COLORS[index % CHART_COLORS.length],
    }));

    if (validTrials.length === 0) {
        return {
            chartData: [],
            insight: {
                title: 'Not enough data yet',
                message:
                    'Complete the measurement trials to generate a chart and smart result insight.',
                severity: 'neutral',
            },
        };
    }

    const bestTrial = validTrials.reduce((best, current) =>
        current.averageBendAngleDeg > best.averageBendAngleDeg ? current : best,
    );

    const weakestTrial = validTrials.reduce((weakest, current) =>
        current.averageBendAngleDeg < weakest.averageBendAngleDeg ? current : weakest,
    );

    const difference = bestTrial.averageBendAngleDeg - weakestTrial.averageBendAngleDeg;

    return {
        chartData,
        insight: {
            title: `Best performing: ${bestTrial.label}`,
            message: `${bestTrial.label} achieved the highest average bend angle at ${bestTrial.averageBendAngleDeg.toFixed(
                1,
            )}°. This suggests that it produced the strongest air displacement among the tested fan designs. The difference from the weakest design was ${difference.toFixed(
                1,
            )}°.`,
            severity: 'positive',
        },
    };
}