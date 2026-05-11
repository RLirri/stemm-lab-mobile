import type {ActivityDefinition} from "./types";

export const activity07_breathingPaceTrainer: ActivityDefinition = {
    id: "act_breathing_pace_trainer_v1",
    slug: "breathing-pace-trainer",
    startRoute: "A7Overview",

    title: "Breathing Pace Trainer – Chest Motion, Breathing Rate & Recovery",
    shortDescription:
        "Record chest movement with the accelerometer, estimate breathing rate across rest and exercise phases, and compare recovery consistency.",

    description:
        "Students analyse breathing patterns at rest and after exercise using the mobile phone accelerometer. " +
        "The phone is placed gently on the participant's chest so that chest motion can be captured as sensor readings across time. " +
        "The system estimates breaths per minute from periodic motion cycles and compares breathing rate across three required phases: rest, post-exercise after 1 minute of jogging on the spot, and post-exercise after 100 star jumps. " +
        "Results are summarized per participant and compared across the team session, with breathing-rate changes and recovery consistency used to support analysis and leaderboard ranking.",

    category: "Medical Science",
    difficulty: "Medium",
    tags: [
        "breathing",
        "accelerometer",
        "chest-motion",
        "medical-science",
        "sensor-data",
        "breaths-per-minute",
        "exercise-recovery",
        "comparison",
        "leaderboard",
        "gps",
        "evidence",
    ],

    timeSpanMinutes: 15,
    equipment: ["Mobile phone with STEMM Lab app", "Flat surface or mat"],

    instructions:
        "Phase 0 – Prediction (required)\n" +
        "1) Predict the breathing rate before the first measurement begins.\n" +
        "2) Enter your predicted breaths per minute at rest and after exercise.\n\n" +
        "Phase 1 – Rest Measurement\n" +
        "3) Place the phone gently on the participant's chest.\n" +
        "4) Record breathing at rest for the configured measurement duration.\n\n" +
        "Phase 2 – Post-Exercise Measurement 1\n" +
        "5) Jog on the spot for one minute.\n" +
        "6) Place the phone gently on the chest again and record breathing.\n\n" +
        "Phase 3 – Post-Exercise Measurement 2\n" +
        "7) Complete 100 star jumps.\n" +
        "8) Place the phone gently on the chest again and record breathing.\n\n" +
        "Participant Rotation\n" +
        "9) Repeat all required phases for each participant in the team session.\n\n" +
        "Submission\n" +
        "10) Review the measured breathing rates, changes between phases, and recovery consistency.\n" +
        "11) Write reflection, provide rating, capture GPS, and submit. Video evidence is optional.",

    // Submission-gated activity policy
    requiredInputs: {
        timeMs: false, // duration is captured/computed from timestamps and recording window
        notes: true, // reflection text required before submission
        evidence: {video: false, maxItems: 1}, // optional video evidence
    },

    // Rich dynamic inputs for ActivityDetail UI / setup flows
    inputs: [
        // Session basics
        {
            key: "sessionLabel",
            label: "Session label",
            type: "text",
            required: true,
            placeholder: "e.g. Week 7 – Breathing Pace Trainer",
            helpText:
                "Give this run a clear session label so your team can identify it later.",
        },
        {
            key: "gpsEnabled",
            label: "Use GPS location",
            type: "boolean",
            required: true,
            helpText:
                "GPS is required for submission. If denied, the session may still run, but submission will be blocked until GPS permission and coordinates are available.",
        },
        {
            key: "participantCount",
            label: "Number of participants",
            type: "number",
            required: true,
            min: 1,
            max: 6,
            placeholder: "e.g. 3",
            helpText:
                "How many participants will complete all required breathing measurement phases in this team session?",
        },

        // Sensor recording configuration
        {
            key: "measurementDurationSec",
            label: "Measurement duration (seconds)",
            type: "number",
            required: true,
            min: 10,
            max: 120,
            placeholder: "e.g. 30",
            helpText:
                "How long each breathing measurement should run. The same duration is used for rest and post-exercise phases.",
        },
        {
            key: "targetSamplingHz",
            label: "Target sampling rate (Hz)",
            type: "number",
            required: false,
            min: 5,
            max: 200,
            placeholder: "e.g. 25",
            helpText:
                "Optional metadata for the expected accelerometer sampling rate used during recording.",
        },
        {
            key: "smoothingWindowSec",
            label: "Signal smoothing window (seconds)",
            type: "number",
            required: false,
            min: 0.1,
            max: 5,
            placeholder: "e.g. 0.6",
            helpText:
                "Optional configuration for smoothing chest-motion data before breathing-cycle detection.",
        },
        {
            key: "minPeakGapMs",
            label: "Minimum gap between breathing peaks (ms)",
            type: "number",
            required: false,
            min: 500,
            max: 10000,
            placeholder: "e.g. 1500",
            helpText:
                "Used to prevent double-counting motion peaks that are too close together to represent separate breaths.",
        },

        // Prediction gate
        {
            key: "predictedRestBpm",
            label: "Predicted breathing rate at rest (breaths/min)",
            type: "number",
            required: true,
            min: 1,
            max: 80,
            placeholder: "e.g. 12",
            helpText:
                "Enter the predicted breathing rate before any measurements begin.",
        },
        {
            key: "predictedAfterExerciseBpm",
            label: "Predicted breathing rate after exercise (breaths/min)",
            type: "number",
            required: true,
            min: 1,
            max: 120,
            placeholder: "e.g. 24",
            helpText:
                "This prediction will be compared against the measured post-exercise phases.",
        },

        // Phase expectations / learning prompts
        {
            key: "expectedHighestPhase",
            label: "Which phase do you think will have the highest breathing rate?",
            type: "select",
            required: false,
            options: [
                "Rest Measurement",
                "Post-Exercise Measurement 1",
                "Post-Exercise Measurement 2",
            ],
            helpText:
                "Optional pre-analysis prompt to help participants think about how exercise affects breathing.",
        },

        // Reflection prompts aligned to the A7 write-up / SRS
        {
            key: "reflectionWereYouRight",
            label: "Were you right?",
            type: "text",
            required: true,
            placeholder:
                "Compare your prediction with the measured breathing rates across the three phases.",
            helpText:
                "Explain whether your prediction matched the measured results and why.",
        },
        {
            key: "reflectionHighestBreathingRate",
            label: "Which stage had the highest breathing rate?",
            type: "text",
            required: false,
            placeholder:
                "State which phase had the highest rate and what that suggests about exercise intensity.",
            helpText:
                "You may refer to rest, post-jog, and post-star-jumps results in your explanation.",
        },
        {
            key: "reflectionSurprises",
            label: "Any surprises?",
            type: "text",
            required: false,
            placeholder:
                "Describe anything unexpected in the measurements, phase differences, or recovery consistency.",
            helpText:
                "Example: star jumps produced less change than expected, or recovery was more stable than predicted.",
        },
        {
            key: "reflectionExerciseEffect",
            label: "How did exercise affect breathing?",
            type: "text",
            required: false,
            placeholder:
                "Summarise how breathing changed from rest to the exercise phases and during recovery comparison.",
            helpText:
                "Connect the sensor results to the science explanation of oxygen demand and breathing rate change.",
        },

        // Rating
        {
            key: "ratingValue",
            label: "Rating (1–5)",
            type: "number",
            required: true,
            min: 1,
            max: 5,
            placeholder: "e.g. 5",
            helpText:
                "Rate the activity experience. Rating is required before submission.",
        },
    ],

    scoring: {
        type: "computed",
        key: "custom",
        notes:
            "Leaderboard uses a computed recovery consistency score derived from the three required breathing phases. " +
            "Core measurement outputs include estimated breaths per minute, measurement duration, breathing-rate change values, and recovery consistency. " +
            "Recommended implementation approach: lower recovery variability and more stable return relative to resting breathing rate should produce a better score. " +
            "Submission requires all required phase measurements for each participant, reflection, rating, and GPS coordinates; video evidence remains optional (max 1).",
    },

    version: 1,
    isActive: true,
    order: 7,
};

export default activity07_breathingPaceTrainer;