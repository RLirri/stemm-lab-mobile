import type {ActivityDefinition} from "./types";

export const activity03_handFan: ActivityDefinition = {
    id: "act_hand_fan_challenge_v1",
    slug: "hand-fan-challenge",
    startRoute: "A3Overview",

    title: "Hand Fan Challenge",
    shortDescription:
        "Compare fan designs by measuring bend angle (degrees) at different distances.",
    description:
        "Students test how air movement affects flexible materials. " +
        "Create multiple fan designs, measure bend angle (θ in degrees) for paper and cardboard " +
        "at 15cm, 30cm, and 45cm distances. Predict the best design, analyze results, " +
        "and reflect on material stiffness and distance effects.",

    category: "Air Movement",
    difficulty: "Easy",
    tags: ["physics", "air", "force", "materials", "measurement"],

    timeSpanMinutes: 20,
    equipment: [
        "Paper",
        "Cardboard",
        "Scissors",
        "Sticky tape",
        "Mobile phone with STEMM Lab app",
    ],

    instructions:
        "1) Predict which fan design will create the largest bend angle.\n" +
        "2) Stand paper or cardboard upright.\n" +
        "3) Fan from 15cm, 30cm, and 45cm distances.\n" +
        "4) Record the bend angle (degrees) for each test.\n" +
        "5) Compare materials and distances.\n" +
        "6) Reflect: Were you right? How did stiffness and distance affect bending?",

    requiredInputs: {
        timeMs: false,
        notes: true,
        evidence: {video: true, maxItems: 10}, // allow multiple measurement clips
    },

    inputs: [
        {
            key: "designCount",
            label: "Number of fan designs",
            type: "number",
            required: true,
            min: 2,
            max: 5,
            placeholder: "e.g. 3",
            helpText: "How many different fan designs will you test?",
        },
        {
            key: "advancedMode",
            label: "Enable advanced mode (stiffness coefficient k)",
            type: "boolean",
            required: true,
            helpText:
                "Turn on to estimate stiffness coefficient k and compare force index F ≈ k·θ.",
        },
        {
            key: "predictedBestDesign",
            label: "Predicted best design",
            type: "text",
            required: true,
            placeholder: "e.g. Accordion folds",
            helpText:
                "Before testing, predict which fan design will produce the largest bend angle.",
        },
        {
            key: "reflectionSurprises",
            label: "Any surprises?",
            type: "text",
            required: false,
            placeholder: "What unexpected results did you observe?",
            helpText:
                "Example: cardboard bent less than expected at 15cm.",
        },
        {
            key: "reflectionMaterialEffect",
            label: "How did material stiffness affect bending?",
            type: "text",
            required: true,
            placeholder: "Explain the difference between paper and cardboard.",
            helpText:
                "Relate stiffness to bend angle differences.",
        },
        {
            key: "reflectionDistanceEffect",
            label: "How did distance affect bending?",
            type: "text",
            required: true,
            placeholder: "Explain what happened at 15cm vs 45cm.",
            helpText:
                "Shorter distance usually increases airflow force.",
        },
    ],

    scoring: {
        type: "computed",
        key: "custom",
        notes:
            "Score = average(valid bend angle in degrees). Requires ≥3 valid measurements and at least 1 video evidence.",
    },

    version: 1,
    isActive: true,
    order: 3,
};

export default activity03_handFan;