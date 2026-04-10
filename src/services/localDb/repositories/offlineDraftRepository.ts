import {getLocalDb} from "../sqlite";
import {LOCAL_DB_TABLES} from "../schema";
import type {
    OfflineDraftDbRow,
    OfflineDraftRecord,
    OfflineDraftStatus,
} from "../../../types/offlineDraft";

function mapRowToRecord<TPayload>(
    row: OfflineDraftDbRow
): OfflineDraftRecord<TPayload> {
    return {
        runId: row.run_id,
        activityId: row.activity_id,
        userId: row.user_id,
        teamId: row.team_id,
        status: row.status,
        currentStep: row.current_step,
        schemaVersion: row.schema_version,
        payload: JSON.parse(row.payload_json) as TPayload,
        deviceUpdatedAt: row.device_updated_at,
        createdAt: row.created_at,
        lastRecoveredAt: row.last_recovered_at,
        submittedAt: row.submitted_at,
        remoteSubmissionId: row.remote_submission_id,
    };
}

function mapRecordToNamedParams<TPayload>(record: OfflineDraftRecord<TPayload>) {
    return {
        $run_id: record.runId,
        $activity_id: record.activityId,
        $user_id: record.userId ?? null,
        $team_id: record.teamId ?? null,
        $status: record.status,
        $current_step: record.currentStep ?? null,
        $schema_version: record.schemaVersion,
        $payload_json: JSON.stringify(record.payload),
        $device_updated_at: record.deviceUpdatedAt,
        $created_at: record.createdAt,
        $last_recovered_at: record.lastRecoveredAt ?? null,
        $submitted_at: record.submittedAt ?? null,
        $remote_submission_id: record.remoteSubmissionId ?? null,
    };
}

export class OfflineDraftRepository {
    async upsertDraft<TPayload>(
        record: OfflineDraftRecord<TPayload>
    ): Promise<void> {
        const db = await getLocalDb();
        const params = mapRecordToNamedParams(record);

        await db.runAsync(
            `
        INSERT INTO ${LOCAL_DB_TABLES.OFFLINE_DRAFTS} (
          run_id,
          activity_id,
          user_id,
          team_id,
          status,
          current_step,
          schema_version,
          payload_json,
          device_updated_at,
          created_at,
          last_recovered_at,
          submitted_at,
          remote_submission_id
        )
        VALUES (
          $run_id,
          $activity_id,
          $user_id,
          $team_id,
          $status,
          $current_step,
          $schema_version,
          $payload_json,
          $device_updated_at,
          $created_at,
          $last_recovered_at,
          $submitted_at,
          $remote_submission_id
        )
        ON CONFLICT(run_id) DO UPDATE SET
          activity_id = excluded.activity_id,
          user_id = excluded.user_id,
          team_id = excluded.team_id,
          status = excluded.status,
          current_step = excluded.current_step,
          schema_version = excluded.schema_version,
          payload_json = excluded.payload_json,
          device_updated_at = excluded.device_updated_at,
          created_at = excluded.created_at,
          last_recovered_at = excluded.last_recovered_at,
          submitted_at = excluded.submitted_at,
          remote_submission_id = excluded.remote_submission_id
      `,
            params
        );
    }

    async getDraftByRunId<TPayload>(
        runId: string
    ): Promise<OfflineDraftRecord<TPayload> | null> {
        const db = await getLocalDb();

        const row = await db.getFirstAsync<OfflineDraftDbRow>(
            `
        SELECT *
        FROM ${LOCAL_DB_TABLES.OFFLINE_DRAFTS}
        WHERE run_id = ?
        LIMIT 1
      `,
            runId
        );

        return row ? mapRowToRecord<TPayload>(row) : null;
    }

    async getLatestActiveDraftByScope<TPayload>(input: {
        activityId: string;
        userId?: string | null;
        teamId?: string | null;
        statuses?: OfflineDraftStatus[];
    }): Promise<OfflineDraftRecord<TPayload> | null> {
        const db = await getLocalDb();

        const statuses =
            input.statuses ?? ["draft", "ready_for_submission", "submission_failed"];

        const teamClause =
            input.teamId == null ? "team_id IS NULL" : "team_id = $team_id";

        const userClause =
            input.userId == null ? "user_id IS NULL" : "user_id = $user_id";

        const statusPlaceholders = statuses
            .map((_, index) => `$status_${index}`)
            .join(", ");

        const query = `
      SELECT *
      FROM ${LOCAL_DB_TABLES.OFFLINE_DRAFTS}
      WHERE activity_id = $activity_id
        AND ${userClause}
        AND ${teamClause}
        AND status IN (${statusPlaceholders})
      ORDER BY device_updated_at DESC
      LIMIT 1
    `;

        const params: Record<string, string | null> = {
            $activity_id: input.activityId,
            $user_id: input.userId ?? null,
            $team_id: input.teamId ?? null,
        };

        statuses.forEach((status, index) => {
            params[`$status_${index}`] = status;
        });

        const row = await db.getFirstAsync<OfflineDraftDbRow>(query, params);
        return row ? mapRowToRecord<TPayload>(row) : null;
    }

    async markRecovered(runId: string, recoveredAt: string): Promise<void> {
        const db = await getLocalDb();

        await db.runAsync(
            `
        UPDATE ${LOCAL_DB_TABLES.OFFLINE_DRAFTS}
        SET last_recovered_at = ?
        WHERE run_id = ?
      `,
            recoveredAt,
            runId
        );
    }

    async markSubmitted(input: {
        runId: string;
        submittedAt: string;
        remoteSubmissionId?: string | null;
    }): Promise<void> {
        const db = await getLocalDb();

        await db.runAsync(
            `
        UPDATE ${LOCAL_DB_TABLES.OFFLINE_DRAFTS}
        SET
          status = 'submitted',
          submitted_at = ?,
          remote_submission_id = ?
        WHERE run_id = ?
      `,
            input.submittedAt,
            input.remoteSubmissionId ?? null,
            input.runId
        );
    }

    async deleteDraft(runId: string): Promise<void> {
        const db = await getLocalDb();

        await db.runAsync(
            `
        DELETE FROM ${LOCAL_DB_TABLES.OFFLINE_DRAFTS}
        WHERE run_id = ?
      `,
            runId
        );
    }
}

export const offlineDraftRepository = new OfflineDraftRepository();