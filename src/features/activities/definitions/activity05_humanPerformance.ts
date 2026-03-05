import type {ActivityDefinition} from "./types";

export const activity05_humanPerformance: ActivityDefinition = {
    id: "act_human_performance_stretch_v1",
    slug: "human-performance-stretch",
    startRoute: "A5Overview",

    title: "Human Performance Lab – Stretch Speed & Gracefulness",
    shortDescription:
        "Measure movement duration, smoothness, and range during guided stretching (baseline vs feedback).",

    description:
        "Students investigate how the human body moves by measuring speed, smoothness, and coordination " +
        "during controlled stretching activities. The app records accelerometer data while students perform " +
        "three guided movements in Baseline mode (no feedback) and Feedback mode (real-time guidance). " +
        "Students predict expected vibration and the most difficult movement before measuring, compare results, " +
        "and reflect on biomechanics, control, and fatigue.",

    category: "Medical Science + Biomechanics",
    difficulty: "Medium",
    tags: ["biomechanics", "movement", "coordination", "accelerometer", "smoothness", "gps", "evidence"],

    timeSpanMinutes: 20,
    equipment: ["Mobile phone with STEMM Lab app", "Open space to move safely"],

    instructions:
        "1) Hold the phone firmly in one hand. Activate the app motion sensor.\n" +
        "2) Enter your prediction (vibration level + hardest movement) before starting any trials.\n" +
        "3) Perform Movement 1–3 in Baseline mode (no feedback). Record motion continuously during each trial.\n" +
        "4) Repeat Movement 1–3 in Feedback mode (real-time guidance to encourage smoother motion).\n" +
        "5) Review movement duration, smoothness index, and range-of-motion estimate.\n" +
        "6) Record video evidence, write reflection, give a rating, capture GPS, and submit.",

    // Follow A4: only timeMs / notes / evidence here
    requiredInputs: {
        timeMs: false, // duration is measured from trial start/stop; no manual time input needed
        notes: true,   // reflection text will be stored via notes/reflection UI
        // Policy: video evidence required for submission (FR-A5-14)
        evidence: {video: true, maxItems: 1},
    },

    // Follow A4: richer dynamic inputs for ActivityDetail UI
    inputs: [
        {
            key: "sessionLabel",
            label: "Session label",
            type: "text",
            required: true,
            placeholder: "e.g. Week 5 – Human Performance Lab",
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
        {
            key: "samplingHz",
            label: "Sensor sampling rate (Hz)",
            type: "number",
            required: true,
            min: 10,
            max: 100,
            placeholder: "e.g. 50",
            helpText:
                "Controls accelerometer sampling frequency. Higher values capture more detail but may use more battery.",
        },
        {
            key: "movementDurationSec",
            label: "Guided movement duration (seconds)",
            type: "number",
            required: true,
            min: 10,
            max: 60,
            placeholder: "e.g. 20",
            helpText:
                "Duration guidance for each movement. Keep the same duration across baseline and feedback modes.",
        },
        {
            key: "feedbackEnabled",
            label: "Enable Feedback Mode (real-time guidance)",
            type: "boolean",
            required: true,
            helpText:
                "When enabled, the app provides real-time visual guidance (and optional vibration alerts) to encourage smoother motion.",
        },

        // FR-A5-07 prediction gate
        {
            key: "predictedVibrationLevel",
            label: "Predicted phone vibration (absolute)",
            type: "text",
            required: true,
            placeholder: 'e.g. "+/- 1 cm" or "Low / Medium / High"',
            helpText:
                "Before measuring, predict the expected vibration/motion magnitude.",
        },
        {
            key: "predictedMostDifficultMovement",
            label: "Predicted most difficult movement",
            type: "select",
            required: true,
            options: [
                "Movement 1 – Slow arm extension",
                "Movement 2 – Controlled forward stretch",
                "Movement 3 – Coordinated lateral motion",
            ],
            helpText:
                "Which movement do you think will be hardest to keep smooth/stable?",
        },

        // Reflection prompts (align with spec write-up)
        {
            key: "reflectionHardestMovement",
            label: "Which movement was hardest to keep the vibration low?",
            type: "text",
            required: true,
            placeholder: "Explain which movement felt hardest and why.",
            helpText:
                "Relate to control, balance, coordination, fatigue, and posture.",
        },
        {
            key: "reflectionWereYouRight",
            label: "Were you right?",
            type: "text",
            required: true,
            placeholder: "Compare your prediction vs the outcome.",
            helpText: "Mention what the data showed vs your expectation.",
        },
        {
            key: "reflectionSurprises",
            label: "Any surprises?",
            type: "text",
            required: false,
            placeholder: "What unexpected results did you observe?",
            helpText: "Example: feedback improved one movement more than others.",
        },
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
            "Score = highest improvement score in session, where ImprovementScore = BaselineSmoothnessIndex − FeedbackSmoothnessIndex. " +
            "Positive score indicates improved smoothness. Requires accelerometer capture, prediction before measurement, GPS granted, 1 video evidence, reflection, and rating.",
    },

    version: 1,
    isActive: true,
    order: 5,
};

export default activity05_humanPerformance;