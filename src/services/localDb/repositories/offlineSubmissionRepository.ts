import {getLocalDb} from "../sqlite";
import {LOCAL_DB_TABLES} from "../schema";
import type {
    OfflineSubmissionDbRow,
    OfflineSubmissionRecord,
    OfflineSubmissionStatus,
} from "../../../types/offlineSubmission";

const nowIso = (): string => new Date().toISOString();

function parsePayload<TPayload>(payloadJson: string): TPayload {
    return JSON.parse(payloadJson) as TPayload;
}

function mapRowToRecord<TPayload = unknown>(
    row: OfflineSubmissionDbRow
): OfflineSubmissionRecord<TPayload> {
    return {
        runId: row.run_id,
        activityId: row.activity_id,
        userId: row.user_id,
        teamId: row.team_id,
        status: row.status,
        payload: parsePayload<TPayload>(row.payload_json),
        retryCount: row.retry_count,
        lastAttemptAt: row.last_attempt_at,
        lastError: row.last_error,
        remoteSubmissionId: row.remote_submission_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function upsertOfflineSubmission<TPayload>(
    input: {
        runId: string;
        activityId: string;
        userId?: string | null;
        teamId?: string | null;
        payload: TPayload;
    }
): Promise<OfflineSubmissionRecord<TPayload>> {
    const db = await getLocalDb();
    const timestamp = nowIso();

    await db.runAsync(
        `
        INSERT INTO ${LOCAL_DB_TABLES.OFFLINE_SUBMISSIONS} (
            run_id,
            activity_id,
            user_id,
            team_id,
            status,
            payload_json,
            retry_count,
            last_attempt_at,
            last_error,
            remote_submission_id,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
            activity_id = excluded.activity_id,
            user_id = excluded.user_id,
            team_id = excluded.team_id,
            payload_json = excluded.payload_json,
            status = CASE
                WHEN ${LOCAL_DB_TABLES.OFFLINE_SUBMISSIONS}.status = 'synced'
                THEN ${LOCAL_DB_TABLES.OFFLINE_SUBMISSIONS}.status
                ELSE 'queued'
            END,
            last_error = NULL,
            updated_at = excluded.updated_at
        `,
        input.runId,
        input.activityId,
        input.userId ?? null,
        input.teamId ?? null,
        "queued",
        JSON.stringify(input.payload),
        0,
        null,
        null,
        null,
        timestamp,
        timestamp
    );

    const saved = await getOfflineSubmissionByRunId<TPayload>(input.runId);

    if (!saved) {
        throw new Error("Failed to save offline submission.");
    }

    return saved;
}

export async function getOfflineSubmissionByRunId<TPayload = unknown>(
    runId: string
): Promise<OfflineSubmissionRecord<TPayload> | null> {
    const db = await getLocalDb();

    const row = await db.getFirstAsync<OfflineSubmissionDbRow>(
        `
        SELECT *
        FROM ${LOCAL_DB_TABLES.OFFLINE_SUBMISSIONS}
        WHERE run_id = ?
        LIMIT 1
        `,
        runId
    );

    return row ? mapRowToRecord<TPayload>(row) : null;
}

export async function listPendingOfflineSubmissions<TPayload = unknown>(
    limit = 20
): Promise<Array<OfflineSubmissionRecord<TPayload>>> {
    const db = await getLocalDb();

    const rows = await db.getAllAsync<OfflineSubmissionDbRow>(
        `
        SELECT *
        FROM ${LOCAL_DB_TABLES.OFFLINE_SUBMISSIONS}
        WHERE status IN ('queued', 'failed')
        ORDER BY created_at ASC
        LIMIT ?
        `,
        limit
    );

    return rows.map((row: OfflineSubmissionDbRow) =>
        mapRowToRecord<TPayload>(row)
    );
}

export async function markOfflineSubmissionSyncing(
    runId: string
): Promise<void> {
    const db = await getLocalDb();
    const timestamp = nowIso();

    await db.runAsync(
        `
        UPDATE ${LOCAL_DB_TABLES.OFFLINE_SUBMISSIONS}
        SET
            status = 'syncing',
            retry_count = retry_count + 1,
            last_attempt_at = ?,
            updated_at = ?
        WHERE run_id = ?
        `,
        timestamp,
        timestamp,
        runId
    );
}

export async function markOfflineSubmissionSynced(
    runId: string,
    remoteSubmissionId: string | null
): Promise<void> {
    const db = await getLocalDb();

    await db.runAsync(
        `
        UPDATE ${LOCAL_DB_TABLES.OFFLINE_SUBMISSIONS}
        SET
            status = 'synced',
            remote_submission_id = ?,
            last_error = NULL,
            updated_at = ?
        WHERE run_id = ?
        `,
        remoteSubmissionId,
        nowIso(),
        runId
    );
}

export async function markOfflineSubmissionFailed(
    runId: string,
    errorMessage: string
): Promise<void> {
    const db = await getLocalDb();

    await db.runAsync(
        `
        UPDATE ${LOCAL_DB_TABLES.OFFLINE_SUBMISSIONS}
        SET
            status = 'failed',
            last_error = ?,
            updated_at = ?
        WHERE run_id = ?
        `,
        errorMessage,
        nowIso(),
        runId
    );
}

export async function updateOfflineSubmissionStatus(
    runId: string,
    status: OfflineSubmissionStatus
): Promise<void> {
    const db = await getLocalDb();

    await db.runAsync(
        `
        UPDATE ${LOCAL_DB_TABLES.OFFLINE_SUBMISSIONS}
        SET
            status = ?,
            updated_at = ?
        WHERE run_id = ?
        `,
        status,
        nowIso(),
        runId
    );
}

