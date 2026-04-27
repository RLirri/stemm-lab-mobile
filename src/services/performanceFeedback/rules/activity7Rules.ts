// src/services/performanceFeedback/rules/activity7Rules.ts

import {mean, standardDeviation} from "simple-statistics";
import type {FeedbackItem, FeedbackResult} from "../../../types/performanceFeedback";

type A7Trial = {
    label: string;
    restingBpm: number;
    postExerciseBpm: number;
};

type A7Input = {
    trials: A7Trial[];
};

function isA7Input(value: unknown): value is A7Input {
    if (typeof value !== "object" || value === null) return false;

    const v = value as Partial<A7Input>;

    return (
        Array.isArray(v.trials) &&
        v.trials.every(t => {
            const x = t as Partial<A7Trial>;
            return (
                typeof x.label === "string" &&
                typeof x.restingBpm === "number" &&
                typeof x.postExerciseBpm === "number"
            );
        })
    );
}

function classifyRecovery(delta: number): FeedbackResult["overallLevel"] {
    if (delta <= 4) return "excellent";
    if (delta <= 8) return "good";
    if (delta <= 15) return "warning";
    return "needs_improvement";
}

export function generateActivity7Feedback(runData: unknown): FeedbackResult {
    if (!isA7Input(runData) || runData.trials.length === 0) {
        return {
            activityId: "activity7",
            overallLevel: "warning",
            summary: "No breathing data available.",
            items: [
                {
                    id: "a7-no-data",
                    type: "anomaly",
                    title: "Missing breathing data",
                    message: "Complete at least one breathing session.",
                    level: "warning",
                },
            ],
        };
    }

    const deltas = runData.trials.map(
        t => t.postExerciseBpm - t.restingBpm
    );

    const avgDelta = mean(deltas);
    const std = runData.trials.length > 1 ? standardDeviation(deltas) : 0;

    const overallLevel = classifyRecovery(avgDelta);

    const items: FeedbackItem[] = [
        {
            id: "a7-performance",
            type: "performance",
            title: "Recovery performance",
            message:
                overallLevel === "excellent"
                    ? "Your breathing recovered very quickly after exercise."
                    : overallLevel === "good"
                        ? "Your breathing recovery is good."
                        : overallLevel === "warning"
                            ? "Your breathing remained elevated longer than expected."
                            : "Your breathing recovery is slow and needs improvement.",
            level: overallLevel,
        },
        {
            id: "a7-insight",
            type: "insight",
            title: "Recovery insight",
            message: `Average increase of ${avgDelta.toFixed(
                1
            )} BPM after exercise.`,
            level: overallLevel === "needs_improvement" ? "needs_improvement" : "good",
        },
        {
            id: "a7-suggestion",
            type: "suggestion",
            title: "Improvement",
            message:
                "Practice controlled breathing and relaxation techniques to improve recovery rate.",
            level: "good",
        },
    ];

    if (std > 5) {
        items.push({
            id: "a7-anomaly",
            type: "anomaly",
            title: "Inconsistent recovery",
            message: `Recovery variability detected (std = ${std.toFixed(1)} BPM).`,
            level: "warning",
        });
    }

    return {
        activityId: "activity7",
        overallLevel,
        summary: `Average recovery difference: ${avgDelta.toFixed(1)} BPM.`,
        items,
    };
}