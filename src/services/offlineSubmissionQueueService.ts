import {
    getOfflineSubmissionByRunId,
    upsertOfflineSubmission,
} from "./localDb/repositories/offlineSubmissionRepository";
import type {
    OfflineSubmissionRecord,
    OfflineSubmissionStatus,
} from "../types/offlineSubmission";

export interface QueueFinalSubmissionInput<TPayload = unknown> {
    runId: string;
    activityId: string;
    userId?: string | null;
    teamId?: string | null;
    payload: TPayload;
}

export interface QueueFinalSubmissionResult<TPayload = unknown> {
    queued: boolean;
    alreadySynced: boolean;
    submission: OfflineSubmissionRecord<TPayload>;
}

export async function queueFinalSubmission<TPayload = unknown>(
    input: QueueFinalSubmissionInput<TPayload>
): Promise<QueueFinalSubmissionResult<TPayload>> {
    if (!input.runId.trim()) {
        throw new Error("Cannot queue offline submission without runId.");
    }

    if (!input.activityId.trim()) {
        throw new Error("Cannot queue offline submission without activityId.");
    }

    const existing = await getOfflineSubmissionByRunId<TPayload>(input.runId);

    if (existing?.status === "synced") {
        return {
            queued: false,
            alreadySynced: true,
            submission: existing,
        };
    }

    const submission = await upsertOfflineSubmission<TPayload>({
        runId: input.runId,
        activityId: input.activityId,
        userId: input.userId ?? null,
        teamId: input.teamId ?? null,
        payload: input.payload,
    });

    return {
        queued: true,
        alreadySynced: false,
        submission,
    };
}

export async function getQueuedSubmissionStatus(
    runId: string
): Promise<OfflineSubmissionStatus | null> {
    const submission = await getOfflineSubmissionByRunId(runId);
    return submission?.status ?? null;
}