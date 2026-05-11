// src/services/backgroundSync/backgroundSyncConfig.ts

export const BACKGROUND_SYNC_TASK_NAME = 'stemm-lab-background-submission-sync';

export const BACKGROUND_SYNC_CONFIG = {
    minForegroundIntervalMs: 60_000,
    minNetworkReconnectIntervalMs: 90_000,
    backgroundMinimumIntervalMinutes: 15,
    enableDebugLogs: __DEV__,
} as const;