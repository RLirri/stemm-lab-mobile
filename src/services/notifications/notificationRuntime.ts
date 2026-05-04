import Constants from 'expo-constants';
import {Platform} from 'react-native';

type ExpoNotificationsModule = typeof import('expo-notifications');

let notificationsModule: ExpoNotificationsModule | null = null;
let notificationHandlerConfigured = false;

export function isExpoGoAndroid(): boolean {
    return Platform.OS === 'android' && Constants.appOwnership === 'expo';
}

export async function getNotificationsModule(): Promise<ExpoNotificationsModule | null> {
    if (isExpoGoAndroid()) {
        return null;
    }

    if (!notificationsModule) {
        notificationsModule = await import('expo-notifications');
    }

    return notificationsModule;
}

export async function configureForegroundNotificationHandler(): Promise<void> {
    const Notifications = await getNotificationsModule();

    if (!Notifications || notificationHandlerConfigured) {
        return;
    }

    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
        }),
    });

    notificationHandlerConfigured = true;
}