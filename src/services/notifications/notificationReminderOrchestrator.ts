import type {StemNotificationResult} from '../../types/notification';
import {offlineDraftService} from '../offlineDraftService';
import {scheduleUnfinishedActivityReminder} from './notificationScheduler';

export async function scheduleSmartUnfinishedDraftReminder(): Promise<StemNotificationResult> {
    try {
        const activeDraftCount = await offlineDraftService.countActiveDrafts();

        console.log(
            '[Notifications] Active draft count for reminder:',
            activeDraftCount
        );

        return scheduleUnfinishedActivityReminder({
            draftCount: activeDraftCount,
            delaySeconds: 6 * 60 * 60,
        });
    } catch (error) {
        return {
            success: false,
            reason:
                error instanceof Error
                    ? error.message
                    : 'Unknown smart reminder scheduling error.',
        };
    }
}