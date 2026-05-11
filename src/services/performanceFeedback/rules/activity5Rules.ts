// src/services/performanceFeedback/rules/activity5Rules.ts

import {max, mean, min, standardDeviation} from "simple-statistics";
import type {FeedbackItem, FeedbackResult,} from "../../../types/performanceFeedback";

type A5Trial = {
    label: string;
    duration: number;       // seconds
    displacement: number;   // movement distance
    smoothness: number;     // lower = smoother
};

type A5Input = {
    trials: A5Trial[];
};

function isA5Input(value: unknown): value is A5Input {
    if (typeof value !== "object" || value === null) return false;

    const v = value as Partial<A5Input>;

    return (
        Array.isArray(v.trials) &&
        v.trials.every(t => {
            const x = t as Partial<A5Trial>;
            return (
                typeof x.label === "string" &&
                typeof x.duration === "number" &&
                typeof x.displacement === "number" &&
                typeof x.smoothness === "number"
            );
        })
    );
}

function classifySmoothness(avgSmoothness: number): FeedbackResult["overallLevel"] {
    if (avgSmoothness <= 5) return "excellent";
    if (avgSmoothness <= 10) return "good";
    if (avgSmoothness <= 18) return "warning";
    return "needs_improvement";
}

export function generateActivity5Feedback(runData: unknown): FeedbackResult {
    if (!isA5Input(runData) || runData.trials.length === 0) {
        return {
            activityId: "activity5",
            overallLevel: "warning",
            summary: "No movement data available.",
            items: [
                {
                    id: "a5-no-data",
                    type: "anomaly",
                    title: "Missing movement data",
                    message: "Complete at least one movement trial to generate feedback.",
                    level: "warning",
                },
            ],
        };
    }

    const durations = runData.trials.map(t => t.duration);
    const displacements = runData.trials.map(t => t.displacement);
    const smoothnessValues = runData.trials.map(t => t.smoothness);

    const avgSmoothness = mean(smoothnessValues);
    const avgDuration = mean(durations);
    const avgDisplacement = mean(displacements);

    const bestSmooth = min(smoothnessValues); // lower = better
    const worstSmooth = max(smoothnessValues);

    const std = runData.trials.length > 1 ? standardDeviation(smoothnessValues) : 0;

    const bestTrial = runData.trials.reduce((b, c) =>
        c.smoothness < b.smoothness ? c : b
    );

    const worstTrial = runData.trials.reduce((w, c) =>
        c.smoothness > w.smoothness ? c : w
    );

    const overallLevel = classifySmoothness(avgSmoothness);

    const items: FeedbackItem[] = [
        {
            id: "a5-performance",
            type: "performance",
            title: "Movement smoothness",
            message:
                overallLevel === "excellent"
                    ? "Your movement is very smooth and controlled."
                    : overallLevel === "good"
                        ? "Your movement is fairly smooth with some room for improvement."
                        : overallLevel === "warning"
                            ? "Your movement shows noticeable inconsistency."
                            : "Your movement is unstable and lacks smooth control.",
            level: overallLevel,
        },
        {
            id: "a5-comparison",
            type: "comparison",
            title: "Best vs worst trial",
            message:
                runData.trials.length === 1
                    ? `${bestTrial.label} smoothness = ${bestTrial.smoothness.toFixed(2)}. Add more trials for comparison.`
                    : `${bestTrial.label} was smoothest (${bestTrial.smoothness.toFixed(
                        2
                    )}), while ${worstTrial.label} was least smooth (${worstTrial.smoothness.toFixed(2)}).`,
            level: std < 5 ? "good" : "warning",
        },
        {
            id: "a5-insight",
            type: "comparison",
            title: "Key insight",
            message: `Average duration ${avgDuration.toFixed(
                2
            )}s and displacement ${avgDisplacement.toFixed(
                2
            )}. Smoothness reflects coordination and control.`,
            level: overallLevel === "needs_improvement" ? "needs_improvement" : "good",
        },
        {
            id: "a5-suggestion",
            type: "suggestion",
            title: "Improvement suggestion",
            message:
                "Try slower, controlled movements and maintain consistent speed to improve smoothness.",
            level: "good",
        },
    ];

    if (runData.trials.length > 1 && std > 8) {
        items.push({
            id: "a5-anomaly",
            type: "anomaly",
            title: "Inconsistent motion",
            message: `High variability detected (std = ${std.toFixed(
                2
            )}). Movement control is inconsistent.`,
            level: "warning",
        });
    }

    return {
        activityId: "activity5",
        overallLevel,
        summary:
            overallLevel === "excellent"
                ? "Excellent movement control and smoothness."
                : overallLevel === "good"
                    ? "Good movement quality with room for refinement."
                    : overallLevel === "warning"
                        ? "Moderate inconsistency in movement detected."
                        : "Movement control needs improvement.",
        items,
    };
}