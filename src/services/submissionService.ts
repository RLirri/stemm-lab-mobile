import {addDoc, collection, serverTimestamp} from "firebase/firestore";
import {db} from "./firebase";
import type {Activity} from "../types/activity";
import type {EvidenceItem, SubmissionMetrics} from "../types/submission";
import {computeScoreV1} from "./scoringService";

export async function createSubmissionV1(params: {
    activity: Activity;
    teamId: string;
    uid: string;
    metrics: SubmissionMetrics;
    answers?: Record<string, any> | null;
    phaseAnswers?: Record<string, Record<string, any>> | null;
    evidence?: EvidenceItem[];
}): Promise<string> {
    const {activity, teamId, uid, metrics} = params;

    const awarded = computeScoreV1(activity as any, metrics as any);

    const payload: any = {
        activityId: activity.id,
        activityVersion: activity.version,
        teamId,
        createdBy: uid,
        createdAt: serverTimestamp(),

        metrics,
        answers: params.answers ?? null,
        phaseAnswers: params.phaseAnswers ?? null,

        evidence: params.evidence ?? [],

        score: {awarded, algorithmVersion: activity.version},
        status: "submitted",
    };

    const ref = await addDoc(collection(db, "submissions"), payload);
    return ref.id;
}