import {Alert} from 'react-native';
import {computeBatteryPolicy, getBatteryStatus} from './index';

export type BatteryActivityIntensity = 'LOW' | 'MEDIUM' | 'HIGH';

type ConfirmBatteryBeforeActivityArgs = {
    activityId: string;
    activityTitle: string;
    intensity: BatteryActivityIntensity;
};

const getIntensityNote = (intensity: BatteryActivityIntensity): string => {
    switch (intensity) {
        case 'HIGH':
            return 'This activity may use sensors, timers, microphone, camera, or repeated measurements.';
        case 'MEDIUM':
            return 'This activity may involve measurements or repeated interaction.';
        case 'LOW':
        default:
            return 'This activity has light battery impact.';
    }
};

export const confirmBatteryBeforeActivity = async ({
                                                       activityId,
                                                       activityTitle,
                                                       intensity,
                                                   }: ConfirmBatteryBeforeActivityArgs): Promise<boolean> => {
    const status = await getBatteryStatus();
    const policy = computeBatteryPolicy(status);

    if (!policy.shouldWarnBeforeHeavyActivity) {
        return true;
    }

    return new Promise((resolve) => {
        Alert.alert(
            'Battery reminder',
            `${activityTitle} is ready to start.\n\n${policy.message}\n\n${getIntensityNote(
                intensity,
            )}\n\nYou can continue, but charging your device is recommended if possible.`,
            [
                {
                    text: 'Review first',
                    style: 'cancel',
                    onPress: () => resolve(false),
                },
                {
                    text: 'Continue',
                    onPress: () => resolve(true),
                },
            ],
        );

        console.log('[BatteryActivityGuard]', {
            activityId,
            activityTitle,
            intensity,
            mode: policy.mode,
            batteryPercentage: status.percentage,
            chargingState: status.chargingState,
        });
    });
};