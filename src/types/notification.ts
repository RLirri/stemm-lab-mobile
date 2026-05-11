export type StemNotificationType =
    | 'SYNC_SUCCESS'
    | 'SYNC_FAILED'
    | 'ACTIVITY_COMPLETED'
    | 'UNFINISHED_ACTIVITY_REMINDER'
    | 'DAILY_REMINDER';

export type StemNotificationPermissionStatus =
    | 'granted'
    | 'denied'
    | 'undetermined';

export interface StemNotificationPayload {
    type: StemNotificationType;
    title: string;
    body: string;
    data?: Record<string, string | number | boolean | null>;
}

export interface StemNotificationResult {
    success: boolean;
    notificationId?: string;
    reason?: string;
}

export interface StemNotificationCooldown {
    key: string;
    cooldownMs: number;
}

export interface UnfinishedActivityReminderOptions {
    draftCount: number;
    delaySeconds?: number;
}