import * as SQLite from "expo-sqlite";
import type {SQLiteDatabase} from "expo-sqlite";
import {runMigrations} from "./migrations";
import {LOCAL_DB_NAME} from "./schema";

let dbInstance: SQLiteDatabase | null = null;
let initPromise: Promise<SQLiteDatabase> | null = null;

async function configureDatabase(db: SQLiteDatabase): Promise<void> {
    await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);
}

export async function getLocalDb(): Promise<SQLiteDatabase> {
    if (dbInstance) return dbInstance;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        const db = await SQLite.openDatabaseAsync(LOCAL_DB_NAME);
        await configureDatabase(db);
        await runMigrations(db);
        dbInstance = db;
        return db;
    })();

    try {
        return await initPromise;
    } finally {
        initPromise = null;
    }
}

export async function initializeLocalDb(): Promise<void> {
    await getLocalDb();
}