import type {Timestamp} from "firebase/firestore";
import type {AttemptDraft, SessionDraft} from "../store/activityRunDraftStore";

export type SubmissionStatus = "submitted" | "flagged" | "rejected";
export type ActivityScoreBreakdown = Record<string, number>;

export type EvidenceItem = {
    type: "video" | "image";
    storagePath: string;
    downloadURL: string;
    attemptIndex?: number;   // useful for “bestAttempt video”
    contentType?: string;    // e.g. "video/mp4"
};

export type SubmissionDoc = {
    // identity
    activityId: string;
    activityKey: string;      // e.g. "parachute_drop"
    runId: string;

    // ownership
    teamId: string;
    createdBy: string;

    // selection
    bestAttemptIndex: number;

    // reflection
    reflection: string;
    rating: number;           // 1..5

    // scoring
    score: number;
    scoreBreakdown?: ActivityScoreBreakdown;
    algorithmVersion: number; // bump when scoring formula changes
    seasonId: string;         // season support

    // snapshot of run (audit / review)
    session: SessionDraft;
    attempts: Record<number, AttemptDraft>;

    // evidence
    evidence?: EvidenceItem[];

    // moderation
    status?: SubmissionStatus;

    // timestamps
    createdAt: Timestamp;
};

export type Submission = SubmissionDoc & { id: string };