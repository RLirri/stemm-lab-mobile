// src/services/performanceFeedback/rules/activity4Rules.ts

import {max, mean, min, standardDeviation} from "simple-statistics";
import type {FeedbackItem, FeedbackResult,} from "../../../types/performanceFeedback";

type A4Trial = {
    label: string;
    movementScore: number; // lower is better
};

type A4Input = {
    trials: A4Trial[];
    predictedBestDesign?: string;
};

function isA4Input(value: unknown): value is A4Input {
    if (typeof value !== "object" || value === null) return false;

    const v = value as Partial<A4Input>;

    return (
        Array.isArray(v.trials) &&
        v.trials.every(t => {
            const x = t as Partial<A4Trial>;
            return (
                typeof x.label === "string" &&
                typeof x.movementScore === "number" &&
                Number.isFinite(x.movementScore)
            );
        })
    );
}

function classify(level: number): FeedbackResult["overallLevel"] {
    if (level <= 15) return "excellent";
    if (level <= 30) return "good";
    if (level <= 50) return "warning";
    return "needs_improvement";
}

export function generateActivity4Feedback(runData: unknown): FeedbackResult {
    if (!isA4Input(runData) || runData.trials.length === 0) {
        return {
            activityId: "activity4",
            overallLevel: "warning",
            summary: "No vibration data available.",
            items: [
                {
                    id: "a4-no-data",
                    type: "anomaly",
                    title: "Missing data",
                    message: "Record at least one structure test to generate feedback.",
                    level: "warning",
                },
            ],
        };
    }

    const values = runData.trials.map(t => t.movementScore);

    const avg = mean(values);
    const best = min(values); // lower = better
    const worst = max(values);
    const std = runData.trials.length > 1 ? standardDeviation(values) : 0;

    const bestTrial = runData.trials.reduce((b, c) =>
        c.movementScore < b.movementScore ? c : b
    );

    const worstTrial = runData.trials.reduce((w, c) =>
        c.movementScore > w.movementScore ? c : w
    );

    const overallLevel = classify(avg);

    const items: FeedbackItem[] = [
        {
            id: "a4-performance",
            type: "performance",
            title: "Structural stability",
            message:
                overallLevel === "excellent"
                    ? "Your structure showed very low movement, indicating strong stability."
                    : overallLevel === "good"
                        ? "Your structure is relatively stable, but can still be improved."
                        : overallLevel === "warning"
                            ? "Moderate movement detected; structural improvements are needed."
                            : "High movement detected; the structure is unstable.",
            level: overallLevel,
        },
        {
            id: "a4-comparison",
            type: "comparison",
            title: "Best vs worst design",
            message:
                runData.trials.length === 1
                    ? `${bestTrial.label} recorded ${bestTrial.movementScore.toFixed(2)}. Add more designs to compare stability.`
                    : `${bestTrial.label} was most stable (${bestTrial.movementScore.toFixed(
                        2
                    )}), while ${worstTrial.label} moved the most (${worstTrial.movementScore.toFixed(2)}).`,
            level: std < 10 ? "good" : "warning",
        },
        {
            id: "a4-insight",
            type: "comparison",
            title: "Key insight",
            message: `Average movement score: ${avg.toFixed(
                2
            )}. Lower values indicate better earthquake resistance.`,
            level: overallLevel === "needs_improvement" ? "needs_improvement" : "good",
        },
        {
            id: "a4-suggestion",
            type: "suggestion",
            title: "Improvement suggestion",
            message:
                "Try lowering the center of mass, widening the base, and improving joint rigidity.",
            level: "good",
        },
    ];

    if (runData.trials.length > 1 && std > 15) {
        items.push({
            id: "a4-anomaly",
            type: "anomaly",
            title: "Inconsistent vibration results",
            message: `High variability detected (std = ${std.toFixed(
                2
            )}). Ensure consistent shaking conditions.`,
            level: "warning",
        });
    }

    return {
        activityId: "activity4",
        overallLevel,
        summary:
            overallLevel === "excellent"
                ? "Excellent structural stability under vibration."
                : overallLevel === "good"
                    ? "Good stability with room for improvement."
                    : overallLevel === "warning"
                        ? "Moderate instability detected."
                        : "Structure is unstable and requires redesign.",
        items,
    };
}