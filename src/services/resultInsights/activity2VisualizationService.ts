import type {ChartPoint, ResultInsight} from "../../types/visualization";

export type A2VisualizationTrial = {
    label: string;
    avgDb: number;
};

export type A2VisualizationResult = {
    chartData: ChartPoint[];
    insight: ResultInsight;
    noisiest?: A2VisualizationTrial;
    quietest?: A2VisualizationTrial;
};

const QUIET_COLOR = "#16A34A";
const MODERATE_COLOR = "#F59E0B";
const LOUD_COLOR = "#EF4444";

function getNoiseColor(db: number): string {
    if (db < 60) return QUIET_COLOR;
    if (db < 85) return MODERATE_COLOR;
    return LOUD_COLOR;
}

function getNoiseLevelLabel(db: number): string {
    if (db < 60) return "generally comfortable";
    if (db < 85) return "moderate to loud";
    return "high and potentially risky for long exposure";
}

export function buildA2Visualization(
    trials: A2VisualizationTrial[]
): A2VisualizationResult {
    const valid = trials
        .filter(
            trial =>
                trial.label.trim().length > 0 &&
                Number.isFinite(trial.avgDb)
        )
        .sort((a, b) => b.avgDb - a.avgDb);

    const chartData: ChartPoint[] = valid.map(trial => ({
        label: trial.label,
        value: Number(trial.avgDb.toFixed(1)),
        frontColor: getNoiseColor(trial.avgDb),
    }));

    if (valid.length === 0) {
        return {
            chartData: [],
            insight: {
                title: "Not enough data",
                message: "Collect valid sound measurements to generate a noise-level insight.",
                severity: "neutral",
            },
        };
    }

    const noisiest = valid[0];
    const quietest = valid[valid.length - 1];
    const difference = noisiest.avgDb - quietest.avgDb;

    return {
        chartData,
        noisiest,
        quietest,
        insight: {
            title: `Noisiest action: ${noisiest.label}`,
            message: `${noisiest.label} recorded the highest average sound level (${noisiest.avgDb.toFixed(
                1
            )} dB), which was ${difference.toFixed(
                1
            )} dB higher than the quietest valid action. This level is considered ${getNoiseLevelLabel(
                noisiest.avgDb
            )}.`,
            severity: noisiest.avgDb >= 85 ? "warning" : "neutral",
        },
    };
}