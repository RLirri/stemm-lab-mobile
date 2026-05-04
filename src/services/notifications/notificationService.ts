import {
    configureForegroundNotificationHandler,
    getNotificationsModule,
    isExpoGoAndroid,
} from './notificationRuntime';

import type {
    StemNotificationCooldown,
    StemNotificationPayload,
    StemNotificationResult,
} from '../../types/notification';
import {
    configureNotificationChannel,
    getNotificationPermissionStatus,
} from './notificationPermission';


const lastNotificationTimeByKey = new Map<string, number>();

function isCoolingDown(cooldown?: StemNotificationCooldown): boolean {
    if (!cooldown) {
        return false;
    }

    const lastTime = lastNotificationTimeByKey.get(cooldown.key);

    if (!lastTime) {
        return false;
    }

    return Date.now() - lastTime < cooldown.cooldownMs;
}

function markCooldown(cooldown?: StemNotificationCooldown): void {
    if (!cooldown) {
        return;
    }

    lastNotificationTimeByKey.set(cooldown.key, Date.now());
}

export async function triggerLocalNotification(
    payload: StemNotificationPayload,
    cooldown?: StemNotificationCooldown
): Promise<StemNotificationResult> {
    try {
        if (isExpoGoAndroid()) {
            return {
                success: false,
                reason: 'Notifications are skipped in Expo Go on Android. Use a development build for notification testing.',
            };
        }

        const Notifications = await getNotificationsModule();

        if (!Notifications) {
            return {
                success: false,
                reason: 'Notifications module is not available.',
            };
        }

        await configureForegroundNotificationHandler();
        await configureNotificationChannel();

        const permissionStatus = await getNotificationPermissionStatus();

        if (permissionStatus !== 'granted') {
            return {
                success: false,
                reason: 'Notification permission is not granted.',
            };
        }

        if (isCoolingDown(cooldown)) {
            return {
                success: false,
                reason: 'Notification skipped due to cooldown.',
            };
        }

        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: payload.title,
                body: payload.body,
                data: {
                    type: payload.type,
                    ...(payload.data ?? {}),
                },
                sound: false,
            },
            trigger: null,
        });

        markCooldown(cooldown);

        return {
            success: true,
            notificationId,
        };
    } catch (error) {
        return {
            success: false,
            reason:
                error instanceof Error
                    ? error.message
                    : 'Unknown notification error.',
        };
    }
}

export async function notifyActivityCompleted(
    activityTitle: string
): Promise<StemNotificationResult> {
    return triggerLocalNotification(
        {
            type: 'ACTIVITY_COMPLETED',
            title: 'Great job!',
            body: `You completed ${activityTitle}. Your progress has been saved.`,
            data: {
                activityTitle,
            },
        },
        {
            key: `activity-completed-${activityTitle}`,
            cooldownMs: 60 * 1000,
        }
    );
}

export async function notifySyncSuccess(
    syncedCount: number
): Promise<StemNotificationResult> {
    if (syncedCount <= 0) {
        return {
            success: false,
            reason: 'No synced submissions.',
        };
    }

    return triggerLocalNotification(
        {
            type: 'SYNC_SUCCESS',
            title: 'STEMM Lab synced',
            body:
                syncedCount === 1
                    ? 'Your saved activity has been uploaded successfully.'
                    : `${syncedCount} saved activities have been uploaded successfully.`,
            data: {
                syncedCount,
            },
        },
        {
            key: 'sync-success',
            cooldownMs: 5 * 60 * 1000,
        }
    );
}

export async function notifySyncFailed(): Promise<StemNotificationResult> {
    return triggerLocalNotification(
        {
            type: 'SYNC_FAILED',
            title: 'Sync will retry later',
            body: 'Some saved activities could not be uploaded yet. STEMM Lab will try again later.',
        },
        {
            key: 'sync-failed',
            cooldownMs: 30 * 60 * 1000,
        }
    );
}