import type {SQLiteDatabase} from "expo-sqlite";
import {
    LOCAL_DB_KEYS,
    LOCAL_DB_SCHEMA_VERSION,
    LOCAL_DB_TABLES,
} from "./schema";

async function createMetaTable(db: SQLiteDatabase): Promise<void> {
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${LOCAL_DB_TABLES.META} (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
}

async function getCurrentSchemaVersion(db: SQLiteDatabase): Promise<number> {
    await createMetaTable(db);

    const row = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM ${LOCAL_DB_TABLES.META} WHERE key = ?`,
        LOCAL_DB_KEYS.SCHEMA_VERSION
    );

    if (!row?.value) return 0;

    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : 0;
}

async function setCurrentSchemaVersion(
    db: SQLiteDatabase,
    version: number
): Promise<void> {
    await db.runAsync(
        `
      INSERT INTO ${LOCAL_DB_TABLES.META} (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
        LOCAL_DB_KEYS.SCHEMA_VERSION,
        String(version)
    );
}

async function migrationV1(db: SQLiteDatabase): Promise<void> {
    await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${LOCAL_DB_TABLES.OFFLINE_DRAFTS} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL UNIQUE,
      activity_id TEXT NOT NULL,
      user_id TEXT,
      team_id TEXT,
      status TEXT NOT NULL,
      current_step TEXT,
      schema_version INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      device_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_recovered_at TEXT,
      submitted_at TEXT,
      remote_submission_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_offline_drafts_activity_id
      ON ${LOCAL_DB_TABLES.OFFLINE_DRAFTS}(activity_id);

    CREATE INDEX IF NOT EXISTS idx_offline_drafts_user_id
      ON ${LOCAL_DB_TABLES.OFFLINE_DRAFTS}(user_id);

    CREATE INDEX IF NOT EXISTS idx_offline_drafts_team_id
      ON ${LOCAL_DB_TABLES.OFFLINE_DRAFTS}(team_id);

    CREATE INDEX IF NOT EXISTS idx_offline_drafts_status
      ON ${LOCAL_DB_TABLES.OFFLINE_DRAFTS}(status);

    CREATE INDEX IF NOT EXISTS idx_offline_drafts_updated_at
      ON ${LOCAL_DB_TABLES.OFFLINE_DRAFTS}(device_updated_at);
  `);
}

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
    const currentVersion = await getCurrentSchemaVersion(db);

    if (currentVersion >= LOCAL_DB_SCHEMA_VERSION) {
        return;
    }

    await db.execAsync("BEGIN");
    try {
        if (currentVersion < 1) {
            await migrationV1(db);
            await setCurrentSchemaVersion(db, 1);
        }

        await db.execAsync("COMMIT");
    } catch (error) {
        await db.execAsync("ROLLBACK");
        throw error;
    }
}