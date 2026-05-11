import * as Battery from 'expo-battery';
import type {BatteryChargingState, BatteryStatus} from '../../types/battery';

const mapBatteryState = (state: Battery.BatteryState): BatteryChargingState => {
    switch (state) {
        case Battery.BatteryState.UNPLUGGED:
            return 'UNPLUGGED';
        case Battery.BatteryState.CHARGING:
            return 'CHARGING';
        case Battery.BatteryState.FULL:
            return 'FULL';
        case Battery.BatteryState.UNKNOWN:
        default:
            return 'UNKNOWN';
    }
};

const normalizeBatteryLevel = (
    level: number | null | undefined,
): number | null => {
    if (typeof level !== 'number' || level < 0) {
        return null;
    }

    return Math.max(0, Math.min(1, level));
};

export const getBatteryStatus = async (): Promise<BatteryStatus> => {
    try {
        const isAvailable = await Battery.isAvailableAsync();

        if (!isAvailable) {
            return {
                isAvailable: false,
                level: null,
                percentage: null,
                chargingState: 'UNKNOWN',
                isCharging: false,
                lowPowerMode: false,
                checkedAt: new Date().toISOString(),
            };
        }

        const powerState = await Battery.getPowerStateAsync();
        const level = normalizeBatteryLevel(powerState.batteryLevel);
        const chargingState = mapBatteryState(powerState.batteryState);

        return {
            isAvailable: true,
            level,
            percentage: level === null ? null : Math.round(level * 100),
            chargingState,
            isCharging: chargingState === 'CHARGING' || chargingState === 'FULL',
            lowPowerMode: Boolean(powerState.lowPowerMode),
            checkedAt: new Date().toISOString(),
        };
    } catch (error) {
        console.warn('[BatteryService] Failed to read battery status:', error);

        return {
            isAvailable: false,
            level: null,
            percentage: null,
            chargingState: 'UNKNOWN',
            isCharging: false,
            lowPowerMode: false,
            checkedAt: new Date().toISOString(),
        };
    }
};