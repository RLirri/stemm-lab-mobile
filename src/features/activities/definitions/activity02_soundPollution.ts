import type {ActivityDefinition} from "./types";

export const activity02_soundPollution: ActivityDefinition = {
    id: "act_sound_pollution_hunter_v1",
    slug: "sound-pollution-hunter",
    startRoute: "A2Overview",

    title: "Sound Pollution Hunter",
    shortDescription:
        "Measure and compare classroom sound levels (dB) and map loud vs quiet zones.",
    description:
        "Teams measure noise from different actions (drop objects, talking, walking, stamping), " +
        "record sound levels and location, then map loud/quiet zones. Students predict the loudest action, " +
        "compare outcomes, reflect on surprises, and evaluate hearing risk.",

    category: "Environmental Science",
    difficulty: "Easy",
    tags: ["sound", "decibels", "health", "gps", "map", "environment"],

    timeSpanMinutes: 20,
    equipment: [
        "Mobile phone with STEMM Lab app",
        "Classroom space",
        "Everyday objects (pens/books)",
    ],

    instructions:
        "1) Predict which action will be the loudest.\n" +
        "2) Measure sound levels from different actions (dropping objects, talking, walking, stamping).\n" +
        "3) Record sound levels and locations for each measurement.\n" +
        "4) Map loud and quiet zones using the map view.\n" +
        "5) Reflect: Were you right? Any surprises? Should we wear ear muffs?",

    // Backward-compatible requiredInputs (so your current ActivityDetail works)
    requiredInputs: {
        // This activity is audio-based; keep timeMs false.
        timeMs: false,
        notes: true,
        evidence: {video: true, maxItems: 1}, // policy A: 1 session video required
    },

    // Richer dynamic inputs (for your newer ActivityDetail UI)
    // These are "session-level" and "write-up-level" prompts.
    inputs: [
        {
            key: "sessionLabel",
            label: "Session label",
            type: "text",
            required: true,
            placeholder: "e.g. Week 2 - Classroom A",
            helpText: "Give this run a clear label so your team can find it later.",
        },
        {
            key: "gpsEnabled",
            label: "Use GPS location",
            type: "boolean",
            required: true,
            helpText:
                "Turn on if you want pins on the map. If off, measurements will be saved without location.",
        },
        {
            key: "predictedLoudestAction",
            label: "Predicted loudest action",
            type: "text",
            required: true,
            placeholder: 'e.g. "Dropping a book"',
            helpText:
                "Before measuring, predict which action will produce the highest dB level.",
        },

        // Reflection prompts (stored as notes / reflection text in submission payload)
        {
            key: "reflectionWereYouRight",
            label: "Were you right?",
            type: "text",
            required: true,
            placeholder: "Explain if your prediction matched the results.",
            helpText: "Compare your prediction vs the actual loudest measured action.",
        },
        {
            key: "reflectionSurprises",
            label: "Any surprises?",
            type: "text",
            required: false,
            placeholder: "What unexpected result did you see?",
            helpText: "Example: a quiet action became loud due to surface/material.",
        },
        {
            key: "reflectionEarmuffs",
            label: "Should we wear ear muffs in your classroom?",
            type: "text",
            required: true,
            placeholder: "Give a recommendation based on risk categories.",
            helpText:
                "Use the risk table (Safe/Caution/Dangerous) to justify your recommendation.",
        },
    ],

    // Scoring note:
    // Real scoring is average(valid dbAvg). We keep definition scoring simple + descriptive.
    // The actual calculation lives in scoringService.ts (pure) + submission service wrapper.
    scoring: {
        type: "computed",
        key: "avg_valid_db",
        notes:
            "Score = average(valid dB). Requires ≥3 valid measurements and 1 session video evidence.",
    },

    version: 1,
    isActive: true,
    order: 2,
};