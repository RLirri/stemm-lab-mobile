// src/services/performanceFeedback/rules/activity2Rules.ts

import {max, mean, min, standardDeviation} from "simple-statistics";
import type {FeedbackItem, FeedbackResult,} from "../../../types/performanceFeedback";

type A2FeedbackTrial = {
    label: string;
    avgDb: number;
    maxDb?: number;
    riskLabel?: string;
};

export type A2FeedbackInput = {
    trials: A2FeedbackTrial[];
    predictedLoudestAction?: string;
    loudestActionLabel?: string;
    wasPredictionCorrect?: boolean;
    averageDb?: number;
    maxDb?: number;
};

function isA2FeedbackInput(value: unknown): value is A2FeedbackInput {
    if (typeof value !== "object" || value === null) return false;

    const candidate = value as Partial<A2FeedbackInput>;

    return (
        Array.isArray(candidate.trials) &&
        candidate.trials.every(trial => {
            const item = trial as Partial<A2FeedbackTrial>;
            return (
                typeof item.label === "string" &&
                typeof item.avgDb === "number" &&
                Number.isFinite(item.avgDb)
            );
        })
    );
}

function classifyNoiseLevel(avgDb: number): FeedbackResult["overallLevel"] {
    if (avgDb < 60) return "excellent";
    if (avgDb < 85) return "good";
    if (avgDb < 100) return "warning";
    return "needs_improvement";
}

function normalizeLabel(label?: string): string {
    return label?.trim().toLowerCase() ?? "";
}

export function generateActivity2Feedback(runData: unknown): FeedbackResult {
    if (!isA2FeedbackInput(runData) || runData.trials.length === 0) {
        return {
            activityId: "activity2",
            overallLevel: "warning",
            summary: "Not enough sound measurement data is available for feedback.",
            items: [
                {
                    id: "a2-missing-data",
                    type: "anomaly",
                    title: "Incomplete sound data",
                    message:
                        "Record valid sound measurements before generating performance feedback.",
                    level: "warning",
                },
            ],
        };
    }

    const valid = runData.trials.filter(
        trial =>
            trial.label.trim().length > 0 &&
            Number.isFinite(trial.avgDb),
    );

    const avgValues = valid.map(trial => trial.avgDb);
    const averageDb =
        typeof runData.averageDb === "number" && Number.isFinite(runData.averageDb)
            ? runData.averageDb
            : mean(avgValues);

    const loudest = valid.reduce((currentMax, trial) =>
        trial.avgDb > currentMax.avgDb ? trial : currentMax,
    );

    const quietest = valid.reduce((currentMin, trial) =>
        trial.avgDb < currentMin.avgDb ? trial : currentMin,
    );

    const highestDb = max(avgValues);
    const lowestDb = min(avgValues);
    const spread = highestDb - lowestDb;
    const consistency = valid.length > 1 ? standardDeviation(avgValues) : 0;

    const overallLevel = classifyNoiseLevel(averageDb);

    const predictionText =
        runData.predictedLoudestAction &&
        runData.loudestActionLabel &&
        normalizeLabel(runData.predictedLoudestAction) ===
        normalizeLabel(runData.loudestActionLabel)
            ? `Your prediction was correct. You predicted ${runData.predictedLoudestAction}, and it was the loudest measured action.`
            : runData.predictedLoudestAction && runData.loudestActionLabel
                ? `Your prediction did not match the result. You predicted ${runData.predictedLoudestAction}, but ${runData.loudestActionLabel} was measured as the loudest action.`
                : "Prediction comparison is limited because either the prediction or measured loudest action is missing.";

    const items: FeedbackItem[] = [
        {
            id: "a2-performance",
            type: "performance",
            title: "Noise exposure classification",
            message:
                overallLevel === "excellent"
                    ? "The average sound level was generally comfortable and low risk for short exposure."
                    : overallLevel === "good"
                        ? "The average sound level was moderate. It is acceptable for short exposure, but long exposure may cause fatigue."
                        : overallLevel === "warning"
                            ? "The average sound level entered a risky range for longer exposure."
                            : "The average sound level was very high and should be reduced or avoided where possible.",
            level: overallLevel,
        },
        {
            id: "a2-prediction",
            type: "prediction",
            title: "Prediction vs outcome",
            message: predictionText,
            level:
                runData.wasPredictionCorrect === true
                    ? "good"
                    : runData.wasPredictionCorrect === false
                        ? "needs_improvement"
                        : "warning",
        },
        {
            id: "a2-comparison",
            type: "comparison",
            title: "Loudest vs quietest action",
            message: `${loudest.label} was the loudest at ${loudest.avgDb.toFixed(
                1,
            )} dB, while ${quietest.label} was the quietest at ${quietest.avgDb.toFixed(
                1,
            )} dB. The difference was ${spread.toFixed(1)} dB.`,
            level: spread >= 20 ? "warning" : "good",
        },
        {
            id: "a2-suggestion",
            type: "suggestion",
            title: "Improvement suggestion",
            message:
                "Keep the phone distance, microphone direction, and measurement duration consistent so sound levels can be compared fairly.",
            level: "good",
        },
    ];

    if (valid.length > 1 && consistency >= 10) {
        items.push({
            id: "a2-anomaly",
            type: "anomaly",
            title: "Large variation detected",
            message: `The standard deviation was ${consistency.toFixed(
                1,
            )} dB, suggesting the actions varied strongly in loudness or were measured under inconsistent conditions.`,
            level: "warning",
        });
    }

    if (highestDb >= 85) {
        items.push({
            id: "a2-hearing-risk",
            type: "anomaly",
            title: "Hearing-risk warning",
            message:
                "At least one measured action reached 85 dB or above, which can become risky during longer exposure.",
            level: "warning",
        });
    }

    return {
        activityId: "activity2",
        overallLevel,
        summary:
            overallLevel === "excellent"
                ? "The sound environment was generally comfortable and low risk."
                : overallLevel === "good"
                    ? "The sound level was acceptable for short exposure, with some monitoring recommended."
                    : overallLevel === "warning"
                        ? "Some sound levels may become risky with longer exposure."
                        : "The measured sound level was very high and should be reduced or avoided.",
        items,
    };
}