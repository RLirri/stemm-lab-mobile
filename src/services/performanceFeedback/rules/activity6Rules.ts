// src/services/performanceFeedback/rules/activity6Rules.ts

import {mean, standardDeviation, min, max} from "simple-statistics";
import type {FeedbackItem, FeedbackResult} from "../../../types/performanceFeedback";

type A6Trial = {
    label: string;
    reactionTime: number; // ms
    hand: "dominant" | "non-dominant";
};

type A6Input = {
    trials: A6Trial[];
};

function isA6Input(value: unknown): value is A6Input {
    if (typeof value !== "object" || value === null) return false;

    const v = value as Partial<A6Input>;

    return (
        Array.isArray(v.trials) &&
        v.trials.every(t => {
            const x = t as Partial<A6Trial>;
            return (
                typeof x.label === "string" &&
                typeof x.reactionTime === "number" &&
                (x.hand === "dominant" || x.hand === "non-dominant")
            );
        })
    );
}

function classify(avg: number): FeedbackResult["overallLevel"] {
    if (avg <= 250) return "excellent";
    if (avg <= 350) return "good";
    if (avg <= 500) return "warning";
    return "needs_improvement";
}

export function generateActivity6Feedback(runData: unknown): FeedbackResult {
    if (!isA6Input(runData) || runData.trials.length === 0) {
        return {
            activityId: "activity6",
            overallLevel: "warning",
            summary: "No reaction data available.",
            items: [
                {
                    id: "a6-no-data",
                    type: "anomaly",
                    title: "Missing data",
                    message: "Complete at least one reaction trial.",
                    level: "warning",
                },
            ],
        };
    }

    const values = runData.trials.map(t => t.reactionTime);
    const avg = mean(values);
    const best = min(values);
    const worst = max(values);
    const std = runData.trials.length > 1 ? standardDeviation(values) : 0;

    const dominant = runData.trials.filter(t => t.hand === "dominant");
    const nondominant = runData.trials.filter(t => t.hand === "non-dominant");

    const dominantAvg = dominant.length ? mean(dominant.map(t => t.reactionTime)) : undefined;
    const nondominantAvg = nondominant.length ? mean(nondominant.map(t => t.reactionTime)) : undefined;

    const overallLevel = classify(avg);

    const items: FeedbackItem[] = [
        {
            id: "a6-performance",
            type: "performance",
            title: "Reaction speed",
            message:
                overallLevel === "excellent"
                    ? "Excellent reaction speed."
                    : overallLevel === "good"
                        ? "Good reaction speed."
                        : overallLevel === "warning"
                            ? "Moderate reaction speed."
                            : "Slow reaction speed detected.",
            level: overallLevel,
        },
        {
            id: "a6-comparison",
            type: "comparison",
            title: "Best vs worst",
            message: `Fastest: ${best.toFixed(0)} ms, Slowest: ${worst.toFixed(0)} ms.`,
            level: std < 80 ? "good" : "warning",
        },
    ];

    if (dominantAvg && nondominantAvg) {
        items.push({
            id: "a6-hand",
            type: "insight",
            title: "Hand comparison",
            message:
                dominantAvg < nondominantAvg
                    ? "Dominant hand is faster than non-dominant."
                    : "Non-dominant hand performed similarly or better.",
            level: "good",
        });
    }

    items.push({
        id: "a6-suggestion",
        type: "suggestion",
        title: "Improvement",
        message: "Practice reaction drills and maintain focus to improve speed.",
        level: "good",
    });

    if (std > 120) {
        items.push({
            id: "a6-anomaly",
            type: "anomaly",
            title: "Inconsistent reaction",
            message: `High variability detected (std = ${std.toFixed(1)} ms).`,
            level: "warning",
        });
    }

    return {
        activityId: "activity6",
        overallLevel,
        summary: `Average reaction time: ${avg.toFixed(0)} ms.`,
        items,
    };
}