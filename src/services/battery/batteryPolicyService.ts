import type {BatteryPolicy, BatteryStatus} from '../../types/battery';

// Testing purpose
// const LOW_BATTERY_PERCENTAGE = 95;
// const CRITICAL_BATTERY_PERCENTAGE = 90;

const LOW_BATTERY_PERCENTAGE = 25;
const CRITICAL_BATTERY_PERCENTAGE = 15;

export const computeBatteryPolicy = (status: BatteryStatus): BatteryPolicy => {
    if (!status.isAvailable || status.percentage === null) {
        return {
            mode: 'NORMAL',
            shouldWarnBeforeHeavyActivity: false,
            shouldDelayNonUrgentBackgroundWork: false,
            allowRequiredAcademicActivity: true,
            recommendedSensorIntervalMs: 500,
            message:
                'Battery information is unavailable, so STEMM Lab will continue normally.',
        };
    }

    if (!status.isCharging && status.percentage <= CRITICAL_BATTERY_PERCENTAGE) {
        return {
            mode: 'CRITICAL',
            shouldWarnBeforeHeavyActivity: true,
            shouldDelayNonUrgentBackgroundWork: true,
            allowRequiredAcademicActivity: true,
            recommendedSensorIntervalMs: 1500,
            message:
                'Battery is critically low. You can continue, but please consider charging before sensor or video-heavy activities.',
        };
    }

    if (
        !status.isCharging &&
        (status.percentage <= LOW_BATTERY_PERCENTAGE || status.lowPowerMode)
    ) {
        return {
            mode: 'CONSERVATIVE',
            shouldWarnBeforeHeavyActivity: true,
            shouldDelayNonUrgentBackgroundWork: true,
            allowRequiredAcademicActivity: true,
            recommendedSensorIntervalMs: 1000,
            message:
                'Battery is low. STEMM Lab will reduce non-essential background work where possible.',
        };
    }

    return {
        mode: 'NORMAL',
        shouldWarnBeforeHeavyActivity: false,
        shouldDelayNonUrgentBackgroundWork: false,
        allowRequiredAcademicActivity: true,
        recommendedSensorIntervalMs: 500,
        message: status.isCharging
            ? 'Device is charging. STEMM Lab can run normally.'
            : 'Battery level is healthy. STEMM Lab can run normally.',
    };
};

export const shouldDelayNonUrgentWork = (status: BatteryStatus): boolean => {
    return computeBatteryPolicy(status).shouldDelayNonUrgentBackgroundWork;
};

export const shouldWarnBeforeHeavyActivity = (
    status: BatteryStatus,
): boolean => {
    return computeBatteryPolicy(status).shouldWarnBeforeHeavyActivity;
};