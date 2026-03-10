// src/features/activities/definitions/activity06_reactionBoard.ts
import type {ActivityDefinition} from "./types";

export const activity06_reactionBoard: ActivityDefinition = {
    id: "act_reaction_board_v1",
    slug: "reaction-board-challenge",
    startRoute: "A6Overview",

    title: "Reaction Board Challenge – Speed, Coordination & Consistency",
    shortDescription:
        "Measure reaction time (dominant vs non-dominant) and tracing accuracy, then compare consistency using mean and standard deviation.",

    description:
        "Students explore how quickly the brain processes visual stimuli and controls movement. " +
        "In the Tap Reaction phase, the app shows hidden targets that appear after a randomized delay and at randomized screen locations. " +
        "Students tap as soon as the target appears, and the app measures reaction time in milliseconds. " +
        "Students repeat trials using both dominant and non-dominant hands, then compare performance and consistency using mean and standard deviation. " +
        "In the Tracing Challenge phase, students trace a moving or predefined path; the app records touch coordinates, computes deviation from the reference path, " +
        "and produces an accuracy score. Results are summarized per participant and used for leaderboard eligibility when the accuracy threshold is met.",

    category: "Neuroscience + Mathematics",
    difficulty: "Medium",
    tags: [
        "reaction-time",
        "motor-control",
        "hand-dominance",
        "statistics",
        "mean",
        "standard-deviation",
        "tracing",
        "accuracy",
        "gps",
        "evidence",
    ],

    timeSpanMinutes: 20,
    equipment: ["Mobile phone with STEMM Lab app", "Clear working space"],

    instructions:
        "Phase 0 – Prediction (required)\n" +
        "1) Predict your reaction time before starting trials.\n\n" +
        "Phase 1 – Tap Reaction (dominant hand)\n" +
        "2) Tap the screen as soon as the hidden target appears.\n" +
        "3) Record reaction time for each trial and rotate through each team member.\n\n" +
        "Phase 2 – Swap Hands (non-dominant)\n" +
        "4) Repeat the same trials using the non-dominant hand.\n" +
        "5) Compare dominant vs non-dominant results.\n\n" +
        "Phase 3 – Tracing Challenge\n" +
        "6) Trace the displayed path as accurately as possible.\n" +
        "7) Review accuracy (deviation) and tracing duration.\n\n" +
        "Submission\n" +
        "8) (Optional) Record video evidence.\n" +
        "9) Write reflection, provide rating, capture GPS, and submit.",

    // Follow A4/A5 policy: submission-gated requirements live here
    requiredInputs: {
        timeMs: false, // computed from timestamps; no manual time input
        notes: true, // reflection text is required (FR-A6-07)
        // Policy: video evidence OPTIONAL for A6 (FR-A6-07)
        evidence: {video: false, maxItems: 1},
    },

    // Rich dynamic inputs for ActivityDetail UI
    inputs: [
        // Session basics
        {
            key: "sessionLabel",
            label: "Session label",
            type: "text",
            required: true,
            placeholder: "e.g. Week 6 – Reaction Board Challenge",
            helpText: "Give this run a clear label so your team can find it later.",
        },
        {
            key: "gpsEnabled",
            label: "Use GPS location",
            type: "boolean",
            required: true,
            helpText:
                "GPS is required for submission. If denied, you can still run trials, but submission will be blocked until granted.",
        },
        {
            key: "participantCount",
            label: "Number of participants",
            type: "number",
            required: true,
            min: 1,
            max: 6,
            placeholder: "e.g. 3",
            helpText: "How many participants will perform trials in this team session?",
        },

        // Trial configuration (FR-A6-01 / FR-A6-03 / FR-A6-07)
        {
            key: "trialsPerHand",
            label: "Trials per hand",
            type: "number",
            required: true,
            min: 1,
            max: 10,
            placeholder: "e.g. 3",
            helpText:
                "Each participant must complete at least one dominant-hand and one non-dominant-hand trial.",
        },
        {
            key: "targetDelayMinSec",
            label: "Random delay minimum (seconds)",
            type: "number",
            required: true,
            min: 0.5,
            max: 10,
            placeholder: "e.g. 1.0",
            helpText:
                "The target appears only after a randomized delay. Example: 1.0–3.0 seconds.",
        },
        {
            key: "targetDelayMaxSec",
            label: "Random delay maximum (seconds)",
            type: "number",
            required: true,
            min: 0.5,
            max: 10,
            placeholder: "e.g. 3.0",
            helpText:
                "Must be greater than the minimum delay. The system randomizes the delay within this range.",
        },
        {
            key: "targetSizePx",
            label: "Tap target size (px)",
            type: "number",
            required: true,
            min: 24,
            max: 120,
            placeholder: "e.g. 56",
            helpText:
                "Controls target accessibility. Larger targets are easier but reduce precision challenge.",
        },

        // Prediction gate (FR-A6-06)
        {
            key: "predictedReactionTimeMs",
            label: "Predicted reaction time (ms)",
            type: "number",
            required: true,
            min: 100,
            max: 2000,
            placeholder: "e.g. 350",
            helpText:
                "Enter your predicted reaction time before the reaction trials begin.",
        },
        {
            key: "predictedHandFaster",
            label: "Which hand do you think will be faster?",
            type: "select",
            required: true,
            options: ["Dominant", "Non-dominant", "Same"],
            helpText:
                "Predict whether hand dominance will affect reaction time performance.",
        },

        // Tracing challenge (FR-A6-04)
        {
            key: "tracingPathType",
            label: "Tracing path type",
            type: "select",
            required: true,
            options: ["Circle", "Wave", "Zigzag", "Figure-8"],
            helpText:
                "Choose a predefined path. The app records touch coordinates and computes deviation from the reference path.",
        },
        {
            key: "maxAllowedDeviationPx",
            label: "Maximum allowed deviation (px)",
            type: "number",
            required: true,
            min: 10,
            max: 200,
            placeholder: "e.g. 40",
            helpText:
                "Used to normalize tracing accuracy. AccuracyScore = 1 − (AvgDeviation / MaxAllowedDeviation).",
        },

        // Leaderboard eligibility threshold (FR-A6-06)
        {
            key: "accuracyThresholdPct",
            label: "Accuracy threshold for leaderboard (%)",
            type: "number",
            required: true,
            min: 0,
            max: 100,
            placeholder: "e.g. 70",
            helpText:
                "Leaderboard eligibility requires tracing accuracy ≥ threshold (example: 70%).",
        },

        // Reflection prompts (align with your write-up table)
        {
            key: "reflectionWereYouRight",
            label: "Were you right?",
            type: "text",
            required: true,
            placeholder:
                "Compare your prediction vs the measured results (dominant vs non-dominant).",
            helpText:
                "Mention what surprised you in the reaction times and whether hand dominance mattered.",
        },
        {
            key: "reflectionSurprises",
            label: "Any surprises?",
            type: "text",
            required: false,
            placeholder:
                "Describe anything unexpected about your reaction time, consistency, or tracing accuracy.",
            helpText:
                "Example: non-dominant hand improved faster, or tracing accuracy dropped when rushing.",
        },

        // Rating (FR-A6-07)
        {
            key: "ratingValue",
            label: "Rating (1–5)",
            type: "number",
            required: true,
            min: 1,
            max: 5,
            placeholder: "e.g. 5",
            helpText:
                "Rate the activity experience. Rating is required for submission.",
        },
    ],

    scoring: {
        type: "computed",
        key: "custom",
        notes:
            "Leaderboard uses a computed Score (converted later from metrics for consistency with prior activities). " +
            "Eligibility requires TracingAccuracyScore ≥ accuracyThresholdPct. " +
            "Core metrics: MeanReactionTime (ms), ReactionTimeStdDev (ms), TracingAccuracyScore (%). " +
            "Recommended score approach (implementation-level): Score = f(meanReactionTime, stdDev, accuracy) where lower mean/stdDev and higher accuracy produce higher score. " +
            "Submission requires: reaction dataset, tracing results, reflection, rating, GPS; video evidence optional (max 1).",
    },

    version: 1,
    isActive: true,
    order: 6,
};

export default activity06_reactionBoard;