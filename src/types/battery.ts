export type BatteryChargingState =
    | 'UNKNOWN'
    | 'UNPLUGGED'
    | 'CHARGING'
    | 'FULL';

export type BatteryPolicyMode = 'NORMAL' | 'CONSERVATIVE' | 'CRITICAL';

export type BatteryStatus = {
    isAvailable: boolean;
    level: number | null;
    percentage: number | null;
    chargingState: BatteryChargingState;
    isCharging: boolean;
    lowPowerMode: boolean;
    checkedAt: string;
};

export type BatteryPolicy = {
    mode: BatteryPolicyMode;
    shouldWarnBeforeHeavyActivity: boolean;
    shouldDelayNonUrgentBackgroundWork: boolean;
    allowRequiredAcademicActivity: boolean;
    recommendedSensorIntervalMs: number;
    message: string;
};

export type PerformanceMeasurement = {
    label: string;
    durationMs: number;
    startedAt: string;
    finishedAt: string;
    success: boolean;
};