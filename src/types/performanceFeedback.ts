// src/types/performanceFeedback.ts

export type FeedbackLevel = "excellent" | "good" | "needs_improvement" | "warning";

export type FeedbackItemType =
    | "performance"
    | "prediction"
    | "comparison"
    | "anomaly"
    | "insight"
    | "suggestion";

export type FeedbackItem = {
    id: string;
    type: FeedbackItemType;
    title: string;
    message: string;
    level: FeedbackLevel;
};

export type FeedbackResult = {
    activityId: string;
    overallLevel: FeedbackLevel;
    summary: string;
    items: FeedbackItem[];
};