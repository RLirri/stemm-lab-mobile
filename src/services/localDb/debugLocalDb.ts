import {getLocalDb} from "./sqlite";

type TableInfoRow = {
    name: string;
};

type DraftRow = {
    id: number;
    run_id: string;
    activity_id: string;
    user_id: string | null;
    team_id: string | null;
    status: string;
    current_step: string | null;
    schema_version: number;
    payload_json: string;
    device_updated_at: string;
    created_at: string;
    last_recovered_at: string | null;
    submitted_at: string | null;
    remote_submission_id: string | null;
};

export async function debugPrintLocalDbOverview(): Promise<void> {
    const db = await getLocalDb();

    const tables = await db.getAllAsync<TableInfoRow>(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
    ORDER BY name;
  `);

    console.log("[LocalDB] Tables:", tables);

    const drafts = await db.getAllAsync<DraftRow>(`
    SELECT *
    FROM offline_drafts
    ORDER BY device_updated_at DESC;
  `);

    console.log("[LocalDB] offline_drafts row count:", drafts.length);
    console.log("[LocalDB] offline_drafts rows:", drafts);
}