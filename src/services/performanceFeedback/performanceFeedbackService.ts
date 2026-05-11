// src/services/performanceFeedback/performanceFeedbackService.ts

import type {FeedbackResult} from "../../types/performanceFeedback";
import type {A1PredictionPoint} from "../resultInsights/activity1VisualizationService";
import {generateActivity1Feedback} from "./rules/activity1Rules";
import {generateActivity2Feedback} from "./rules/activity2Rules";
import {generateActivity3Feedback} from "./rules/activity3Rules";
import {generateActivity4Feedback} from "./rules/activity4Rules";
import {generateActivity5Feedback} from "./rules/activity5Rules";
import {generateActivity6Feedback} from "./rules/activity6Rules";
import {generateActivity7Feedback} from "./rules/activity7Rules";

export type SupportedFeedbackActivityId =
    | "activity1"
    | "activity2"
    | "activity3"
    | "activity4"
    | "activity5"
    | "activity6"
    | "activity7";

export function generatePerformanceFeedback(
    activityId: SupportedFeedbackActivityId,
    runData: unknown,
): FeedbackResult {
    switch (activityId) {
        case "activity1":
            return generateActivity1Feedback(runData as A1PredictionPoint[]);

        case "activity2":
            return generateActivity2Feedback(runData);

        case "activity3":
            return generateActivity3Feedback(runData);

        case "activity4":
            return generateActivity4Feedback(runData);

        case "activity5":
            return generateActivity5Feedback(runData);

        case "activity6":
            return generateActivity6Feedback(runData);

        case "activity7":
            return generateActivity7Feedback(runData);

        default:
            return {
                activityId,
                overallLevel: "good",
                summary: "Smart feedback is ready for this activity once rules are configured.",
                items: [
                    {
                        id: `${activityId}-placeholder`,
                        type: "suggestion",
                        title: "Feedback engine available",
                        message:
                            "This activity can use the same offline statistical feedback engine after activity-specific rules are added.",
                        level: "good",
                    },
                ],
            };
    }
}