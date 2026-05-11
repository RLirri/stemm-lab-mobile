import {OFFLINE_DRAFT_SCHEMA_VERSION, type OfflineDraftRecord, type OfflineDraftStatus,} from "../types/offlineDraft";
import {offlineDraftRepository} from "./localDb/repositories/offlineDraftRepository";

export interface SaveOfflineDraftInput<TPayload> {
    runId: string;
    activityId: string;
    payload: TPayload;
    currentStep?: string | null;
    userId?: string | null;
    teamId?: string | null;
    status?: OfflineDraftStatus;
    createdAt?: string;
}

export class OfflineDraftService {
    async saveDraft<TPayload>(
        input: SaveOfflineDraftInput<TPayload>
    ): Promise<OfflineDraftRecord<TPayload>> {
        const now = new Date().toISOString();

        const existing = await offlineDraftRepository.getDraftByRunId<TPayload>(
            input.runId
        );

        const record: OfflineDraftRecord<TPayload> = {
            runId: input.runId,
            activityId: input.activityId,
            userId: input.userId ?? existing?.userId ?? null,
            teamId: input.teamId ?? existing?.teamId ?? null,
            status: input.status ?? existing?.status ?? "draft",
            currentStep: input.currentStep ?? null,
            schemaVersion: OFFLINE_DRAFT_SCHEMA_VERSION,
            payload: input.payload,
            deviceUpdatedAt: now,
            createdAt: input.createdAt ?? existing?.createdAt ?? now,
            lastRecoveredAt: existing?.lastRecoveredAt ?? null,
            submittedAt: existing?.submittedAt ?? null,
            remoteSubmissionId: existing?.remoteSubmissionId ?? null,
        };

        await offlineDraftRepository.upsertDraft(record);
        return record;
    }

    async getDraftByRunId<TPayload>(
        runId: string
    ): Promise<OfflineDraftRecord<TPayload> | null> {
        return offlineDraftRepository.getDraftByRunId<TPayload>(runId);
    }

    async getLatestRecoverableDraft<TPayload>(input: {
        activityId: string;
        userId?: string | null;
        teamId?: string | null;
    }): Promise<OfflineDraftRecord<TPayload> | null> {
        return offlineDraftRepository.getLatestActiveDraftByScope<TPayload>({
            activityId: input.activityId,
            userId: input.userId,
            teamId: input.teamId,
            statuses: ["draft", "ready_for_submission", "submission_failed"],
        });
    }

    async countActiveDrafts(): Promise<number> {
        return offlineDraftRepository.countActiveDrafts();
    }

    async markRecovered(runId: string): Promise<void> {
        await offlineDraftRepository.markRecovered(
            runId,
            new Date().toISOString()
        );
    }

    async markSubmitted(input: {
        runId: string;
        remoteSubmissionId?: string | null;
    }): Promise<void> {
        await offlineDraftRepository.markSubmitted({
            runId: input.runId,
            submittedAt: new Date().toISOString(),
            remoteSubmissionId: input.remoteSubmissionId ?? null,
        });
    }

    async discardDraft(runId: string): Promise<void> {
        await offlineDraftRepository.deleteDraft(runId);
    }
}

export const offlineDraftService = new OfflineDraftService();