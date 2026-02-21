import type {ActivityDefinition} from "./types";

export const activity01_parachuteDrop: ActivityDefinition = {
    id: "act_parachute_drop_v1",
    slug: "parachute-drop",
    startRoute: "A1SessionSetup",
    
    title: "Parachute Drop Challenge",
    shortDescription: "Design a parachute to slow a falling object using everyday materials.",
    description:
        "Teams prototype and iterate a parachute design, record results, and reflect on improvements.",

    category: "Engineering",
    difficulty: "Medium",
    tags: ["physics", "drag", "iteration", "prototype"],

    timeSpanMinutes: 20,
    equipment: ["Plastic bag / paper", "Tape", "String", "Small weight/object", "Timer"],

    // keep as string for now; later you can migrate to steps array without breaking UI
    instructions:
        "Build a parachute using available materials.\n" +
        "Drop from a safe height and measure the fall time.\n" +
        "Observe stability and landing behavior.\n" +
        "Iterate your design and record what changed and why.",

    // backward-compatible requiredInputs (your current ActivityDetail supports this)
    requiredInputs: {
        timeMs: true,
        notes: true,
        evidence: {video: true, maxItems: 1},
    },

    // richer dynamic inputs (supported by the new ActivityDetail I gave you)
    inputs: [
        {
            key: "dropHeightM",
            label: "Drop height",
            type: "number",
            unit: "m",
            required: true,
            min: 0.5,
            max: 30,
            placeholder: "e.g. 2",
            helpText: "Measure the approximate drop height used for your test.",
        },
        {
            key: "stabilityRating",
            label: "Stability rating (1–5)",
            type: "number",
            required: true,
            min: 1,
            max: 5,
            placeholder: "1–5",
            helpText: "Rate how stable the descent was (no spinning, straight fall).",
        },
    ],

    // v1 scoring (simple placeholder; can evolve)
    scoring: {type: "fixed", basePoints: 100},
    version: 1,

    isActive: true,
    order: 1,
};