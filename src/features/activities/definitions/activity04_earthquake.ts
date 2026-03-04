import type {ActivityDefinition} from "./types";

export const activity04_earthquake: ActivityDefinition = {
    id: "act_earthquake_resistant_structure_v1",
    slug: "earthquake-resistant-structure",
    startRoute: "A4Overview",

    title: "Earthquake-Resistant Structure",
    shortDescription:
        "Build and compare vibration-dampening structures using a 10-second vibration test.",

    description:
        "Students design structures that reduce phone movement during a simulated earthquake. " +
        "For each design, the app triggers vibration for 10 seconds, records accelerometer readings, " +
        "computes a movement magnitude score, and compares results across at least 3 designs. " +
        "Students predict the best design before measuring, attach video evidence, and submit a reflection.",

    category: "Engineering + Earth Science",
    difficulty: "Medium",
    tags: ["engineering", "earth-science", "vibration", "accelerometer", "structures", "gps", "evidence"],

    timeSpanMinutes: 25,
    equipment: [
        "Cardboard / paper",
        "Scissors",
        "Sticky tape",
        "Plastic/paper cups (pillars/supports)",
        "Mobile phone with STEMM Lab app (accelerometer)",
    ],

    instructions:
        "1) Build an anti-vibration layer by folding paper/cardboard.\n" +
        "2) Place a flat cardboard platform on top.\n" +
        "3) Place the phone in the center.\n" +
        "4) In the app, run a 10-second vibration test and record movement.\n" +
        "5) Modify the structure to reduce movement (more pillars, more folds, more layers).\n" +
        "6) Test at least 3 designs and compare scores.\n" +
        "7) Reflect: Were you right? Any surprises? What would you improve?",

    // Backward-compatible requiredInputs (so your current ActivityDetail works)
    requiredInputs: {
        // Time is controlled by the vibration test window; no manual time input needed.
        timeMs: false,
        notes: true,
        // Policy: 1 session video required for submission (FR-A4-07)
        evidence: {video: true, maxItems: 1},
    },

    // Richer dynamic inputs (for your newer ActivityDetail UI)
    inputs: [
        {
            key: "sessionLabel",
            label: "Session label",
            type: "text",
            required: true,
            placeholder: "e.g. Week 4 - Earthquake Lab",
            helpText: "Give this run a clear label so your team can find it later.",
        },
        {
            key: "gpsEnabled",
            label: "Use GPS location",
            type: "boolean",
            required: true,
            helpText:
                "GPS is required for submission. If denied, you can still run tests, but submission will be blocked until granted.",
        },
        {
            key: "predictedBestDesign",
            label: "Predicted best design",
            type: "text",
            required: true,
            placeholder: 'e.g. "10 folds + 4 pillars"',
            helpText:
                "Before measuring, predict which structure design will make the phone move the least.",
        },

        // Design metadata prompts (supports the research question “how design influences movement”)
        {
            key: "designNotes",
            label: "Design notes to track",
            type: "text",
            required: false,
            placeholder: "e.g. folds, pillars, layers, platform size, symmetry",
            helpText:
                "Tip: Track folds/pillars/layers so you can explain why your best design reduced movement.",
        },

        // Reflection prompts (stored as reflection text in submission payload)
        {
            key: "reflectionWereYouRight",
            label: "Were you right?",
            type: "text",
            required: true,
            placeholder: "Compare your prediction vs measured results.",
            helpText: "Did your predicted best design actually have the lowest movement score?",
        },
        {
            key: "reflectionSurprises",
            label: "Any surprises?",
            type: "text",
            required: false,
            placeholder: "What unexpected result did you see?",
            helpText: "Example: more pillars helped less than more folds, or vice versa.",
        },
        {
            key: "reflectionImproveNext",
            label: "What would you improve next?",
            type: "text",
            required: true,
            placeholder: "How would you make the test fairer or the structure better?",
            helpText:
                "Consider stability, symmetry, phone placement, consistent materials, and repeat trials.",
        },
    ],


    scoring: {
        type: "computed",
        key: "custom",
        notes:
            "Score = movement magnitude (lower is better). Requires accelerometer capture, ≥3 designs, prediction before measurement, GPS granted, and 1 session video evidence.",
    },

    version: 1,
    isActive: true,
    order: 4,
};