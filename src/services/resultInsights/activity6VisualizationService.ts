import type {ChartPoint, ResultInsight} from "../../types/visualization";

export type A6VisualizationParticipant = {
    label: string;
    reactionTimeMs?: number; // lower = better
    tracingAccuracyPct?: number; // higher = better
};

export type A6VisualizationResult = {
    reactionChartData: ChartPoint[];
    accuracyChartData: ChartPoint[];
    insight: ResultInsight;
    fastest?: A6VisualizationParticipant;
    mostAccurate?: A6VisualizationParticipant;
};

const BEST_COLOR = "#16A34A";
const MIDDLE_COLOR = "#F59E0B";
const WORST_COLOR = "#EF4444";

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function getRankColor(index: number, total: number): string {
    if (total === 1) return BEST_COLOR;
    if (index === 0) return BEST_COLOR;
    if (index === total - 1) return WORST_COLOR;
    return MIDDLE_COLOR;
}

export function buildA6Visualization(
    participants: A6VisualizationParticipant[]
): A6VisualizationResult {
    const validReaction = participants
        .filter(
            item =>
                item.label.trim().length > 0 &&
                isFiniteNumber(item.reactionTimeMs)
        )
        .sort((a, b) => (a.reactionTimeMs ?? 0) - (b.reactionTimeMs ?? 0));

    const validAccuracy = participants
        .filter(
            item =>
                item.label.trim().length > 0 &&
                isFiniteNumber(item.tracingAccuracyPct)
        )
        .sort(
            (a, b) =>
                (b.tracingAccuracyPct ?? 0) - (a.tracingAccuracyPct ?? 0)
        );

    const reactionChartData: ChartPoint[] = validReaction.map(
        (item, index) => ({
            label: item.label,
            value: Number((item.reactionTimeMs ?? 0).toFixed(0)),
            frontColor: getRankColor(index, validReaction.length),
        })
    );

    const accuracyChartData: ChartPoint[] = validAccuracy.map(
        (item, index) => ({
            label: item.label,
            value: Number((item.tracingAccuracyPct ?? 0).toFixed(0)),
            frontColor: getRankColor(index, validAccuracy.length),
        })
    );

    const fastest = validReaction[0];
    const mostAccurate = validAccuracy[0];

    if (!fastest && !mostAccurate) {
        return {
            reactionChartData,
            accuracyChartData,
            insight: {
                title: "Not enough data",
                message:
                    "Complete reaction trials and tracing challenges to generate performance insights.",
                severity: "neutral",
            },
        };
    }

    return {
        reactionChartData,
        accuracyChartData,
        fastest,
        mostAccurate,
        insight: {
            title: fastest
                ? `Fastest reaction: ${fastest.label}`
                : `Most accurate tracing: ${mostAccurate?.label ?? "—"}`,
            message: [
                fastest
                    ? `${fastest.label} recorded the lowest overall mean reaction time (${Math.round(
                        fastest.reactionTimeMs ?? 0
                    )} ms), indicating the fastest response speed.`
                    : undefined,
                mostAccurate
                    ? `${mostAccurate.label} achieved the highest tracing accuracy (${Math.round(
                        mostAccurate.tracingAccuracyPct ?? 0
                    )}%), showing the strongest control performance.`
                    : undefined,
            ]
                .filter(Boolean)
                .join(" "),
            severity: "positive",
        },
    };
}