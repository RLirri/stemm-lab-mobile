import {computeBatteryPolicy, getBatteryStatus} from './index';

export type BatteryBackgroundSyncDecision = {
    canRun: boolean;
    reason: string;
};

export const canRunNonUrgentBackgroundSync =
    async (): Promise<BatteryBackgroundSyncDecision> => {
        const status = await getBatteryStatus();
        const policy = computeBatteryPolicy(status);

        if (policy.shouldDelayNonUrgentBackgroundWork) {
            return {
                canRun: false,
                reason: `Background sync delayed due to battery mode: ${policy.mode}`,
            };
        }

        return {
            canRun: true,
            reason: `Background sync allowed under battery mode: ${policy.mode}`,
        };
    };