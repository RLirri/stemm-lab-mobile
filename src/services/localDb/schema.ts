export const LOCAL_DB_NAME = "stemm_lab.db";

export const LOCAL_DB_TABLES = {
    META: "app_meta",
    OFFLINE_DRAFTS: "offline_drafts",
    OFFLINE_SUBMISSIONS: "offline_submissions",
} as const;

export const LOCAL_DB_KEYS = {
    SCHEMA_VERSION: "schema_version",
} as const;

export const LOCAL_DB_SCHEMA_VERSION = 2;