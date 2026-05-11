import React, {useEffect} from "react";
import RootNavigator from "./src/navigation/RootNavigator";
import {initializeLocalDb} from "./src/services/localDb/sqlite";
import {debugPrintLocalDbOverview} from "./src/services/localDb/debugLocalDb";
// import {syncQueuedSubmissions} from "./src/services/syncService";
// import {submitOfflineToFirebase} from "./src/services/offlineSubmissionSyncAdapter";

import {
    disposeBackgroundSyncLifecycle,
    initializeBackgroundSyncLifecycle,
} from './src/services/backgroundSync/backgroundSyncLifecycle';

import {requestNotificationPermission} from './src/services/notifications/notificationPermission';
import {scheduleSmartUnfinishedDraftReminder} from './src/services/notifications/notificationReminderOrchestrator';
// import {notifyActivityCompleted} from './src/services/notifications/notificationService';
// import {scheduleQuickTestReminder} from './src/services/notifications/notificationScheduler';

export default function App() {
    useEffect(() => {
        async function bootstrap() {
            try {
                await initializeLocalDb();
                await debugPrintLocalDbOverview();

                const notificationStatus = await requestNotificationPermission();
                console.log("[Notifications] Permission status:", notificationStatus);
                
                await scheduleSmartUnfinishedDraftReminder();

                // await notifyActivityCompleted("STEMM Lab Test Activity");
                // const reminderResult = await scheduleQuickTestReminder();
                //console.log('[Notifications] Reminder test:', reminderResult);

                // const syncResults = await syncQueuedSubmissions({
                //     submitToRemote: submitOfflineToFirebase,
                // });
                //
                // console.log("Offline submission sync results:", syncResults);

                await initializeBackgroundSyncLifecycle();

            } catch (error) {
                console.error("Failed to bootstrap app", error);
            }
        }

        //     void bootstrap();
        // }, []);
        void bootstrap();

        return () => {
            disposeBackgroundSyncLifecycle();
        };
    }, []);

    return <RootNavigator/>;
}