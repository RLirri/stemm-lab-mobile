export const OFFLINE_DRAFT_SCHEMA_VERSION = 1 as const;

export type OfflineDraftStatus =
    | "draft"
    | "ready_for_submission"
    | "submitted"
    | "submission_failed";

export interface OfflineDraftRecord<TPayload = unknown> {
    runId: string;
    activityId: string;
    userId?: string | null;
    teamId?: string | null;
    status: OfflineDraftStatus;
    currentStep?: string | null;
    schemaVersion: number;
    payload: TPayload;
    deviceUpdatedAt: string;
    createdAt: string;
    lastRecoveredAt?: string | null;
    submittedAt?: string | null;
    remoteSubmissionId?: string | null;
}

export interface OfflineDraftDbRow {
    id: number;
    run_id: string;
    activity_id: string;
    user_id: string | null;
    team_id: string | null;
    status: OfflineDraftStatus;
    current_step: string | null;
    schema_version: number;
    payload_json: string;
    device_updated_at: string;
    created_at: string;
    last_recovered_at: string | null;
    submitted_at: string | null;
    remote_submission_id: string | null;
}

export interface DbMetaRow {
    key: string;
    value: string;
}