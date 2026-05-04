import {Platform} from 'react-native';
import {getNotificationsModule, isExpoGoAndroid} from './notificationRuntime';
import type {StemNotificationPermissionStatus} from '../../types/notification';

const DEFAULT_ANDROID_CHANNEL_ID = 'stemm-lab-default';

export async function configureNotificationChannel(): Promise<void> {
    if (Platform.OS !== 'android' || isExpoGoAndroid()) {
        return;
    }

    const Notifications = await getNotificationsModule();

    if (!Notifications) {
        return;
    }

    await Notifications.setNotificationChannelAsync(DEFAULT_ANDROID_CHANNEL_ID, {
        name: 'STEMM Lab Updates',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
        sound: 'default',
    });
}

export async function getNotificationPermissionStatus(): Promise<StemNotificationPermissionStatus> {
    if (isExpoGoAndroid()) {
        return 'undetermined';
    }

    const Notifications = await getNotificationsModule();

    if (!Notifications) {
        return 'undetermined';
    }

    const permission = await Notifications.getPermissionsAsync();

    if (permission.status === 'granted') {
        return 'granted';
    }

    if (permission.status === 'denied') {
        return 'denied';
    }

    return 'undetermined';
}

export async function requestNotificationPermission(): Promise<StemNotificationPermissionStatus> {
    if (isExpoGoAndroid()) {
        return 'undetermined';
    }

    await configureNotificationChannel();

    const existingStatus = await getNotificationPermissionStatus();

    if (existingStatus === 'granted') {
        return 'granted';
    }

    const Notifications = await getNotificationsModule();

    if (!Notifications) {
        return 'undetermined';
    }

    const requested = await Notifications.requestPermissionsAsync();

    if (requested.status === 'granted') {
        return 'granted';
    }

    if (requested.status === 'denied') {
        return 'denied';
    }

    return 'undetermined';
}

export async function ensureNotificationPermission(): Promise<boolean> {
    const status = await requestNotificationPermission();
    return status === 'granted';
}