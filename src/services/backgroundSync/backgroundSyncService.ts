// src/services/backgroundSync/backgroundSyncService.ts

import * as BackgroundTask from 'expo-background-task';
import * as Network from 'expo-network';
import * as TaskManager from 'expo-task-manager';

import {submitOfflineToFirebase} from '../offlineSubmissionSyncAdapter';
import {syncQueuedSubmissions} from '../syncService';
import {BACKGROUND_SYNC_CONFIG, BACKGROUND_SYNC_TASK_NAME,} from './backgroundSyncConfig';

import type {BackgroundSyncResult, BackgroundSyncTrigger,} from '../../types/backgroundSync';

import {canRunNonUrgentBackgroundSync, measureAsyncOperation} from '../battery';

let isSyncRunning = false;
let lastSyncAttemptAt = 0;

const nowIso = (): string => new Date().toISOString();

const log = (msg: string): void => {
    if (BACKGROUND_SYNC_CONFIG.enableDebugLogs) {
        console.log(`[BackgroundSync] ${msg}`);
    }
};

const isNetworkAvailable = async (): Promise<boolean> => {
    const state = await Network.getNetworkStateAsync();
    return state.isConnected === true && state.isInternetReachable !== false;
};

const shouldThrottle = (
    trigger: BackgroundSyncTrigger,
    now: number,
): boolean => {
    const minInterval =
        trigger === 'network_reconnect'
            ? BACKGROUND_SYNC_CONFIG.minNetworkReconnectIntervalMs
            : BACKGROUND_SYNC_CONFIG.minForegroundIntervalMs;

    return now - lastSyncAttemptAt < minInterval;
};

export const runBackgroundSyncSafely = async (
    trigger: BackgroundSyncTrigger,
): Promise<BackgroundSyncResult> => {
    const startedAt = nowIso();
    const now = Date.now();

    if (isSyncRunning) {
        return {
            status: 'skipped',
            trigger,
            startedAt,
            finishedAt: nowIso(),
            message: 'Already running',
        };
    }

    if (shouldThrottle(trigger, now)) {
        return {
            status: 'skipped',
            trigger,
            startedAt,
            finishedAt: nowIso(),
            message: 'Throttled',
        };
    }

    const hasNetwork = await isNetworkAvailable();

    if (!hasNetwork) {
        lastSyncAttemptAt = now;

        return {
            status: 'skipped',
            trigger,
            startedAt,
            finishedAt: nowIso(),
            message: 'No network',
        };
    }
    const batteryDecision = await canRunNonUrgentBackgroundSync();

    if (!batteryDecision.canRun) {
        lastSyncAttemptAt = now;

        log(batteryDecision.reason);

        return {
            status: 'skipped',
            trigger,
            startedAt,
            finishedAt: nowIso(),
            message: batteryDecision.reason,
        };
    }

    try {
        isSyncRunning = true;
        lastSyncAttemptAt = now;

        log(`Sync started (${trigger})`);

        await measureAsyncOperation('background-sync', async () => {
            await syncQueuedSubmissions({
                submitToRemote: submitOfflineToFirebase,
            });
        });

        log(`Sync success (${trigger})`);

        return {
            status: 'success',
            trigger,
            startedAt,
            finishedAt: nowIso(),
            message: 'Sync completed',
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';

        log(`Sync failed: ${message}`);

        return {
            status: 'failed',
            trigger,
            startedAt,
            finishedAt: nowIso(),
            message,
        };
    } finally {
        isSyncRunning = false;
    }
};

if (!TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK_NAME)) {
    TaskManager.defineTask(BACKGROUND_SYNC_TASK_NAME, async () => {
        const result = await runBackgroundSyncSafely('background_task');

        if (result.status === 'failed') {
            return BackgroundTask.BackgroundTaskResult.Failed;
        }

        return BackgroundTask.BackgroundTaskResult.Success;
    });
}

export const registerBackgroundSyncTask = async (): Promise<void> => {
    const status = await BackgroundTask.getStatusAsync();

    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
        log('BackgroundTask not available');
        return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(
        BACKGROUND_SYNC_TASK_NAME,
    );

    if (isRegistered) {
        log('Already registered');
        return;
    }

    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK_NAME, {
        minimumInterval:
        BACKGROUND_SYNC_CONFIG.backgroundMinimumIntervalMinutes,
    });

    log('Background task registered');
};