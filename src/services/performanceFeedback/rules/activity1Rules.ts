// src/services/performanceFeedback/rules/activity1Rules.ts

import {mean, standardDeviation, min, max} from "simple-statistics";
import type {FeedbackResult, FeedbackItem} from "../../../types/performanceFeedback";
import type {A1PredictionPoint} from "../../resultInsights/activity1VisualizationService";

export function generateActivity1Feedback(points: A1PredictionPoint[]): FeedbackResult {
    const valid = points.filter(
        point =>
            Number.isFinite(point.predictedTimeSec) &&
            Number.isFinite(point.actualTimeSec) &&
            Number.isFinite(point.errorPercent),
    );

    if (valid.length === 0) {
        return {
            activityId: "activity1",
            overallLevel: "warning",
            summary: "Not enough data is available to generate performance feedback.",
            items: [
                {
                    id: "a1-missing-data",
                    type: "anomaly",
                    title: "Incomplete result data",
                    message:
                        "Complete at least one measured drop attempt to receive statistical performance feedback.",
                    level: "warning",
                },
            ],
        };
    }

    const errorPercents = valid.map(point => point.errorPercent);
    const actualTimes = valid.map(point => point.actualTimeSec);

    const averageError = mean(errorPercents);
    const consistency = valid.length > 1 ? standardDeviation(actualTimes) : 0;

    const bestPoint = valid.reduce((best, current) =>
        current.errorPercent < best.errorPercent ? current : best,
    );

    const worstPoint = valid.reduce((worst, current) =>
        current.errorPercent > worst.errorPercent ? current : worst,
    );

    const shortestTime = min(actualTimes);
    const longestTime = max(actualTimes);
    const spread = longestTime - shortestTime;

    const overallLevel =
        averageError <= 15
            ? "excellent"
            : averageError <= 35
                ? "good"
                : "needs_improvement";

    const items: FeedbackItem[] = [
        {
            id: "a1-performance",
            type: "performance",
            title: "Performance classification",
            message:
                overallLevel === "excellent"
                    ? "Your drop result closely matched the theoretical free-fall model."
                    : overallLevel === "good"
                        ? "Your result showed a reasonable match with the theoretical model, but accuracy can still improve."
                        : "Your result differed noticeably from the theoretical model, which suggests the design or measurement process should be reviewed.",
            level: overallLevel,
        },
        {
            id: "a1-prediction",
            type: "prediction",
            title: "Prediction vs actual",
            message: `The average difference between theoretical and actual drop time was ${averageError.toFixed(
                1,
            )}%.`,
            level: averageError <= 35 ? "good" : "needs_improvement",
        },
        {
            id: "a1-best-worst",
            type: "comparison",
            title: "Best vs weakest attempt",
            message: `${bestPoint.label} was closest to the physics model at ${bestPoint.errorPercent.toFixed(
                1,
            )}% error, while ${worstPoint.label} had the largest difference at ${worstPoint.errorPercent.toFixed(
                1,
            )}% error.`,
            level: "good",
        },
        {
            id: "a1-suggestion",
            type: "suggestion",
            title: "Improvement suggestion",
            message:
                "Try keeping the release height, parachute folding method, payload mass, and timing process consistent across attempts.",
            level: "good",
        },
    ];

    if (valid.length > 1 && consistency > 0.4) {
        items.push({
            id: "a1-anomaly",
            type: "anomaly",
            title: "Possible inconsistency detected",
            message: `The standard deviation of actual flight time was ${consistency.toFixed(
                2,
            )}s, with a spread of ${spread.toFixed(
                2,
            )}s. This may indicate inconsistent release technique or parachute behaviour.`,
            level: "warning",
        });
    }

    return {
        activityId: "activity1",
        overallLevel,
        summary:
            overallLevel === "excellent"
                ? "Strong prediction accuracy and reliable parachute performance."
                : overallLevel === "good"
                    ? "Good result overall, with useful opportunities to improve consistency."
                    : "The experiment needs improvement, especially in prediction accuracy and trial consistency.",
        items,
    };
}