import {
    listPendingOfflineSubmissions,
    markOfflineSubmissionFailed,
    markOfflineSubmissionSynced,
    markOfflineSubmissionSyncing,
} from "./localDb/repositories/offlineSubmissionRepository";
import type {
    OfflineSubmissionRecord,
    OfflineSubmissionSyncResult,
} from "../types/offlineSubmission";

export interface SyncQueuedSubmissionHandler<TPayload = unknown> {
    (
        submission: OfflineSubmissionRecord<TPayload>
    ): Promise<{
        remoteSubmissionId: string | null;
    }>;
}

export interface SyncQueuedSubmissionsOptions<TPayload = unknown> {
    limit?: number;
    submitToRemote: SyncQueuedSubmissionHandler<TPayload>;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === "string") {
        return error;
    }

    return "Unknown sync error";
}

export async function syncQueuedSubmissions<TPayload = unknown>(
    options: SyncQueuedSubmissionsOptions<TPayload>
): Promise<OfflineSubmissionSyncResult[]> {
    const limit = options.limit ?? 20;
    const pendingSubmissions =
        await listPendingOfflineSubmissions<TPayload>(limit);

    const results: OfflineSubmissionSyncResult[] = [];

    for (const submission of pendingSubmissions) {
        try {
            await markOfflineSubmissionSyncing(submission.runId);

            const remoteResult = await options.submitToRemote(submission);

            await markOfflineSubmissionSynced(
                submission.runId,
                remoteResult.remoteSubmissionId
            );

            results.push({
                id: submission.runId,
                runId: submission.runId,
                status: "synced",
                remoteSubmissionId: remoteResult.remoteSubmissionId,
            });
        } catch (error: unknown) {
            const errorMessage = getErrorMessage(error);

            await markOfflineSubmissionFailed(
                submission.runId,
                errorMessage
            );

            results.push({
                id: submission.runId,
                runId: submission.runId,
                status: "failed",
                error: errorMessage,
            });
        }
    }

    return results;
}