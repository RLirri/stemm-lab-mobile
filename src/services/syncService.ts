import {
    listPendingOfflineSubmissions,
    markOfflineSubmissionFailed,
    markOfflineSubmissionSynced,
    markOfflineSubmissionSyncing,
} from "./localDb/repositories/offlineSubmissionRepository";
import type {OfflineSubmissionRecord, OfflineSubmissionSyncResult,} from "../types/offlineSubmission";
import {notifySyncFailed, notifySyncSuccess,} from "./notifications/notificationService";

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
    notifyUser?: boolean;
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

async function safelyNotifySyncResult(input: {
    syncedCount: number;
    failedCount: number;
    notifyUser: boolean;
}): Promise<void> {
    if (!input.notifyUser) {
        return;
    }

    try {
        if (input.syncedCount > 0) {
            const result = await notifySyncSuccess(input.syncedCount);
            console.log("[Notifications] Sync success notification:", result);
            return;
        }

        if (input.failedCount > 0) {
            const result = await notifySyncFailed();
            console.log("[Notifications] Sync failure notification:", result);
        }
    } catch (error) {
        console.log("[Notifications] Sync notification skipped:", error);
    }
}

export async function syncQueuedSubmissions<TPayload = unknown>(
    options: SyncQueuedSubmissionsOptions<TPayload>
): Promise<OfflineSubmissionSyncResult[]> {
    const limit = options.limit ?? 20;
    const notifyUser = options.notifyUser ?? true;

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

            await markOfflineSubmissionFailed(submission.runId, errorMessage);

            results.push({
                id: submission.runId,
                runId: submission.runId,
                status: "failed",
                error: errorMessage,
            });
        }
    }

    const syncedCount = results.filter(result => result.status === "synced").length;
    const failedCount = results.filter(result => result.status === "failed").length;

    await safelyNotifySyncResult({
        syncedCount,
        failedCount,
        notifyUser,
    });

    return results;
}