import {getNotificationsModule, isExpoGoAndroid} from './notificationRuntime';
import type {
    StemNotificationResult,
    UnfinishedActivityReminderOptions,
} from '../../types/notification';
import {
    configureNotificationChannel,
    getNotificationPermissionStatus,
} from './notificationPermission';

const UNFINISHED_ACTIVITY_REMINDER_KEY =
    'stemm-lab-unfinished-activity-reminder';

async function cancelReminderByKey(reminderKey: string): Promise<void> {
    if (isExpoGoAndroid()) {
        return;
    }

    const Notifications = await getNotificationsModule();

    if (!Notifications) {
        return;
    }

    const scheduledNotifications =
        await Notifications.getAllScheduledNotificationsAsync();

    const existingReminder = scheduledNotifications.find(
        notification => notification.content.data?.reminderKey === reminderKey
    );

    if (!existingReminder) {
        return;
    }

    await Notifications.cancelScheduledNotificationAsync(
        existingReminder.identifier
    );
}

export async function cancelUnfinishedActivityReminder(): Promise<void> {
    await cancelReminderByKey(UNFINISHED_ACTIVITY_REMINDER_KEY);
}

export async function scheduleUnfinishedActivityReminder(
    options: UnfinishedActivityReminderOptions
): Promise<StemNotificationResult> {
    try {
        if (isExpoGoAndroid()) {
            return {
                success: false,
                reason:
                    'Reminder notifications are skipped in Expo Go on Android. Use a development build for full notification testing.',
            };
        }

        const Notifications = await getNotificationsModule();

        if (!Notifications) {
            return {
                success: false,
                reason: 'Notifications module is not available.',
            };
        }

        await configureNotificationChannel();

        const permissionStatus = await getNotificationPermissionStatus();

        if (permissionStatus !== 'granted') {
            return {
                success: false,
                reason: 'Notification permission is not granted.',
            };
        }

        if (options.draftCount <= 0) {
            await cancelUnfinishedActivityReminder();

            return {
                success: false,
                reason: 'No unfinished activity drafts found.',
            };
        }

        await cancelUnfinishedActivityReminder();

        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: 'Continue your STEMM activity',
                body:
                    options.draftCount === 1
                        ? 'You have one unfinished experiment waiting for you.'
                        : `You have ${options.draftCount} unfinished experiments waiting for you.`,
                data: {
                    type: 'UNFINISHED_ACTIVITY_REMINDER',
                    reminderKey: UNFINISHED_ACTIVITY_REMINDER_KEY,
                    draftCount: options.draftCount,
                },
                sound: false,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: options.delaySeconds ?? 6 * 60 * 60,
            },
        });

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
                    : 'Unknown reminder scheduling error.',
        };
    }
}

export async function scheduleQuickTestReminder(): Promise<StemNotificationResult> {
    return scheduleUnfinishedActivityReminder({
        draftCount: 1,
        delaySeconds: 10,
    });
}