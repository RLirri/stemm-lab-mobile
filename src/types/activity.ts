import type {Timestamp} from "firebase/firestore";

export type ActivityCategory =
    "Science"
    | "Tech"
    | "Engineering"
    | "Math"
    | "Medicine"
    | "Environmental Science"
    | "Engineering + Earth Science"
    | "Medical Science + Biomechanics"
    | "Air Movement";
export type ActivityDifficulty = "Easy" | "Medium" | "Hard";

export type ActivityInputType =
    | "number"
    | "text"
    | "duration_ms"
    | "select"
    | "boolean";

export type ActivityInput = {
    key: string;        // e.g. "restBpm", "runTimeMs"
    label: string;      // UI label
    type: ActivityInputType;
    unit?: string;      // "bpm", "m", "ms"
    required: boolean;
    min?: number;
    max?: number;
    options?: string[]; // for select
    placeholder?: string;
    helpText?: string;
};

export type ActivityPhase = {
    key: string;         // "rest", "after_exercise"
    title: string;       // "Resting"
    instruction?: string;
    inputs: ActivityInput[];
    requireEvidence?: boolean;
};

export type ActivityScoring =
    | { type: "fixed"; basePoints: number; notes?: string }
    | {
    type: "formula";
    formula: {
        kind: "distance-higher-better" | "time-lower-better";
        factor?: number;
    };
    notes?: string;
}
    | {
    type: "computed";
    key:
        | "avg_valid_db" // Activity 2
        | "custom"; // future-proof
    notes?: string;
};

export type ActivityDoc = {
    // identity
    title: string;
    slug: string;           // used for local flow routing (stable key)
    startRoute?: string;    // optional override (e.g., "A1SessionSetup")
    category: ActivityCategory;
    difficulty: ActivityDifficulty;
    tags?: string[];

    // richer content
    shortDescription?: string;
    description?: string;      // long description
    timeSpanMinutes?: number;  // estimated duration for completing the activity
    equipment?: string[];
    instructions: string;      // keep as string for now (works with your UI)
    instructionsSteps?: string[]; // optional, future UI enhancement

    // input config (simple and advanced)
    requiredInputs: {
        timeMs?: boolean;
        distanceM?: boolean;
        count?: boolean;
        notes?: boolean;
        evidence?: { image?: boolean; video?: boolean; maxItems?: number };
        gps?: boolean;
        rating?: boolean;
    };

    // advanced dynamic forms
    phases?: ActivityPhase[];    // optional; if present, use dynamic phase UI later
    inputs?: ActivityInput[];    // optional; single-phase dynamic UI

    scoring: ActivityScoring;
    version: number;

    // catalog
    isActive: boolean;
    order?: number;            // recommended stable sorting
    createdAt: Timestamp;
    updatedAt: Timestamp;


};

export type Activity = ActivityDoc & { id: string };