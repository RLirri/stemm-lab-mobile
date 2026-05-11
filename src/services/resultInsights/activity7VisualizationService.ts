import type {ChartPoint, ResultInsight} from "../../types/visualization";

export type A7PhaseAverageInput = {
    restBpm?: number;
    postJogBpm?: number;
    postStarJumpBpm?: number;
};

export type A7RecoveryParticipant = {
    label: string;
    recoveryConsistencyScore?: number; // lower = better
};

export type A7VisualizationResult = {
    phaseChartData: ChartPoint[];
    recoveryChartData: ChartPoint[];
    insight: ResultInsight;
    bestRecovery?: A7RecoveryParticipant;
};

const REST_COLOR = "#2563EB";
const JOG_COLOR = "#F59E0B";
const STAR_JUMP_COLOR = "#EF4444";

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

export function buildA7Visualization(params: {
    phaseAverages: A7PhaseAverageInput;
    participants: A7RecoveryParticipant[];
}): A7VisualizationResult {
    const {phaseAverages, participants} = params;

    const phaseChartData: ChartPoint[] = [
        {
            label: "Rest",
            value: isFiniteNumber(phaseAverages.restBpm)
                ? Number(phaseAverages.restBpm.toFixed(1))
                : 0,
            frontColor: REST_COLOR,
        },
        {
            label: "Post-Jog",
            value: isFiniteNumber(phaseAverages.postJogBpm)
                ? Number(phaseAverages.postJogBpm.toFixed(1))
                : 0,
            frontColor: JOG_COLOR,
        },
        {
            label: "Star Jumps",
            value: isFiniteNumber(phaseAverages.postStarJumpBpm)
                ? Number(phaseAverages.postStarJumpBpm.toFixed(1))
                : 0,
            frontColor: STAR_JUMP_COLOR,
        },
    ].filter(item => item.value > 0);

    const validRecovery = participants
        .filter(
            item =>
                item.label.trim().length > 0 &&
                isFiniteNumber(item.recoveryConsistencyScore)
        )
        .sort(
            (a, b) =>
                (a.recoveryConsistencyScore ?? 0) -
                (b.recoveryConsistencyScore ?? 0)
        );

    const recoveryChartData: ChartPoint[] = validRecovery.map((item, index) => ({
        label: item.label,
        value: Number((item.recoveryConsistencyScore ?? 0).toFixed(3)),
        frontColor: getRankColor(index, validRecovery.length),
    }));

    const bestRecovery = validRecovery[0];

    if (phaseChartData.length === 0 && !bestRecovery) {
        return {
            phaseChartData: [],
            recoveryChartData: [],
            insight: {
                title: "Not enough data",
                message:
                    "Complete breathing measurements to generate recovery insights.",
                severity: "neutral",
            },
        };
    }

    const rest = phaseAverages.restBpm;
    const jog = phaseAverages.postJogBpm;
    const star = phaseAverages.postStarJumpBpm;

    const postValues = [jog, star].filter(isFiniteNumber);
    const highestPost =
        postValues.length > 0 ? Math.max(...postValues) : undefined;

    const increase =
        isFiniteNumber(rest) && isFiniteNumber(highestPost)
            ? highestPost - rest
            : undefined;

    return {
        phaseChartData,
        recoveryChartData,
        bestRecovery,
        insight: {
            title: bestRecovery
                ? `Best recovery consistency: ${bestRecovery.label}`
                : "Breathing phase pattern",
            message: [
                bestRecovery
                    ? `${bestRecovery.label} achieved the lowest recovery consistency score (${bestRecovery.recoveryConsistencyScore?.toFixed(
                        3
                    )}), indicating the most stable breathing recovery pattern.`
                    : undefined,
                isFiniteNumber(increase)
                    ? `The highest post-exercise breathing rate was ${highestPost?.toFixed(
                        1
                    )} BPM, about ${increase.toFixed(
                        1
                    )} BPM above the resting average.`
                    : undefined,
            ]
                .filter(Boolean)
                .join(" "),
            severity: "positive",
        },
    };
}