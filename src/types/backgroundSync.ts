// src/types/backgroundSync.ts

export type BackgroundSyncTrigger =
    | 'app_start'
    | 'foreground_resume'
    | 'network_reconnect'
    | 'background_task'
    | 'manual';

export type BackgroundSyncStatus =
    | 'idle'
    | 'skipped'
    | 'running'
    | 'success'
    | 'failed';

export interface BackgroundSyncResult {
    status: BackgroundSyncStatus;
    trigger: BackgroundSyncTrigger;
    startedAt: string;
    finishedAt: string;
    message: string;
}