// src/services/backgroundSync/backgroundSyncLifecycle.ts

import {AppState, type AppStateStatus} from 'react-native';
import * as Network from 'expo-network';

import {
    registerBackgroundSyncTask,
    runBackgroundSyncSafely,
} from './backgroundSyncService';

let appStateSubscription: { remove: () => void } | null = null;
let networkSubscription: { remove: () => void } | null = null;
let previousNetworkConnected: boolean | null = null;

export const initializeBackgroundSyncLifecycle = async (): Promise<void> => {
    await registerBackgroundSyncTask();

    void runBackgroundSyncSafely('app_start');

    appStateSubscription?.remove();
    networkSubscription?.remove();

    appStateSubscription = AppState.addEventListener(
        'change',
        (nextState: AppStateStatus): void => {
            if (nextState === 'active') {
                void runBackgroundSyncSafely('foreground_resume');
            }
        },
    );

    const initialNetworkState = await Network.getNetworkStateAsync();
    previousNetworkConnected =
        initialNetworkState.isConnected === true &&
        initialNetworkState.isInternetReachable !== false;

    networkSubscription = Network.addNetworkStateListener((state): void => {
        const isConnected =
            state.isConnected === true && state.isInternetReachable !== false;

        if (previousNetworkConnected === false && isConnected) {
            void runBackgroundSyncSafely('network_reconnect');
        }

        previousNetworkConnected = isConnected;
    });
};

export const disposeBackgroundSyncLifecycle = (): void => {
    appStateSubscription?.remove();
    networkSubscription?.remove();

    appStateSubscription = null;
    networkSubscription = null;
    previousNetworkConnected = null;
};