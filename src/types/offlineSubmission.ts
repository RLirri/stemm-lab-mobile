export const OFFLINE_SUBMISSION_SCHEMA_VERSION = 1 as const;

export type OfflineSubmissionStatus =
    | "queued"
    | "syncing"
    | "synced"
    | "failed";

export interface OfflineSubmissionRecord<TPayload = unknown> {
    runId: string;
    activityId: string;
    userId?: string | null;
    teamId?: string | null;
    status: OfflineSubmissionStatus;
    payload: TPayload;
    retryCount: number;
    lastAttemptAt?: string | null;
    lastError?: string | null;
    remoteSubmissionId?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface OfflineSubmissionDbRow {
    id: number;
    run_id: string;
    activity_id: string;
    user_id: string | null;
    team_id: string | null;
    status: OfflineSubmissionStatus;
    payload_json: string;
    retry_count: number;
    last_attempt_at: string | null;
    last_error: string | null;
    remote_submission_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface OfflineSubmissionSyncResult {
    id: string;
    runId: string;
    status: OfflineSubmissionStatus;
    remoteSubmissionId?: string | null;
    error?: string;
}