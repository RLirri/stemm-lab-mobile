// src/services/performanceFeedback/rules/activity3Rules.ts

import {max, mean, min, standardDeviation} from "simple-statistics";
import type {
    FeedbackItem,
    FeedbackResult,
} from "../../../types/performanceFeedback";

type A3FeedbackTrial = {
    label: string;
    value: number;
};

type A3FeedbackInput = {
    trials: A3FeedbackTrial[];
    bestValue?: number;
    worstValue?: number;
};

function isA3FeedbackInput(value: unknown): value is A3FeedbackInput {
    if (typeof value !== "object" || value === null) return false;

    const candidate = value as Partial<A3FeedbackInput>;

    return (
        Array.isArray(candidate.trials) &&
        candidate.trials.every(trial => {
            const item = trial as Partial<A3FeedbackTrial>;
            return (
                typeof item.label === "string" &&
                typeof item.value === "number" &&
                Number.isFinite(item.value)
            );
        })
    );
}

function classifyPerformance(
    averageValue: number,
): FeedbackResult["overallLevel"] {
    if (averageValue >= 30) return "excellent";
    if (averageValue >= 18) return "good";
    if (averageValue >= 8) return "warning";
    return "needs_improvement";
}

export function generateActivity3Feedback(runData: unknown): FeedbackResult {
    if (!isA3FeedbackInput(runData) || runData.trials.length === 0) {
        return {
            activityId: "activity3",
            overallLevel: "warning",
            summary: "Not enough hand fan measurement data is available for feedback.",
            items: [
                {
                    id: "a3-missing-data",
                    type: "anomaly",
                    title: "Incomplete fan data",
                    message:
                        "Record at least one valid hand fan attempt before generating performance feedback.",
                    level: "warning",
                },
            ],
        };
    }

    const valid = runData.trials.filter(
        trial =>
            trial.label.trim().length > 0 &&
            Number.isFinite(trial.value),
    );

    const values = valid.map(trial => trial.value);
    const averageValue = mean(values);
    const bestValue =
        typeof runData.bestValue === "number" && Number.isFinite(runData.bestValue)
            ? runData.bestValue
            : max(values);
    const worstValue =
        typeof runData.worstValue === "number" && Number.isFinite(runData.worstValue)
            ? runData.worstValue
            : min(values);

    const bestTrial = valid.reduce((best, trial) =>
        trial.value > best.value ? trial : best,
    );

    const worstTrial = valid.reduce((worst, trial) =>
        trial.value < worst.value ? trial : worst,
    );

    const spread = bestValue - worstValue;
    const consistency = valid.length > 1 ? standardDeviation(values) : 0;
    const overallLevel = classifyPerformance(averageValue);

    const items: FeedbackItem[] = [
        {
            id: "a3-performance",
            type: "performance",
            title: "Fan performance classification",
            message:
                overallLevel === "excellent"
                    ? "Your fan produced a strong response, suggesting effective air movement."
                    : overallLevel === "good"
                        ? "Your fan produced a useful air movement result with room for refinement."
                        : overallLevel === "warning"
                            ? "Your fan created some movement, but the performance could be improved."
                            : "Your fan produced a low response, suggesting the design or technique should be improved.",
            level: overallLevel,
        },
        {
            id: "a3-comparison",
            type: "comparison",
            title: "Best vs weakest attempt",
            message:
                valid.length === 1
                    ? `${bestTrial.label} recorded ${bestTrial.value.toFixed(
                        2,
                    )}. Add more trials to compare design consistency.`
                    : `${bestTrial.label} had the strongest result at ${bestTrial.value.toFixed(
                        2,
                    )}, while ${worstTrial.label} had the weakest result at ${worstTrial.value.toFixed(
                        2,
                    )}.`,
            level: spread <= 8 ? "good" : "warning",
        },
        {
            id: "a3-insight",
            type: "comparison",
            title: "Key insight",
            message: `The average result was ${averageValue.toFixed(
                2,
            )}. Stronger results usually indicate better fan shape, surface area, stiffness, or technique.`,
            level: overallLevel === "needs_improvement" ? "needs_improvement" : "good",
        },
        {
            id: "a3-suggestion",
            type: "suggestion",
            title: "Improvement suggestion",
            message:
                "Try increasing the fan surface area, improving stiffness, and keeping the waving distance and speed consistent between trials.",
            level: "good",
        },
    ];

    if (valid.length > 1 && consistency > 6) {
        items.push({
            id: "a3-anomaly",
            type: "anomaly",
            title: "Inconsistent trial results",
            message: `The standard deviation was ${consistency.toFixed(
                2,
            )}, suggesting that fan technique or measurement setup may not have been consistent.`,
            level: "warning",
        });
    }

    return {
        activityId: "activity3",
        overallLevel,
        summary:
            overallLevel === "excellent"
                ? "Strong fan performance with effective air movement."
                : overallLevel === "good"
                    ? "Good fan performance with clear opportunities for design refinement."
                    : overallLevel === "warning"
                        ? "Moderate fan performance; consistency and design can be improved."
                        : "Fan performance needs improvement, especially in design effectiveness and trial consistency.",
        items,
    };
}