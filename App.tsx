import React, {useEffect} from "react";
import RootNavigator from "./src/navigation/RootNavigator";
import {initializeLocalDb} from "./src/services/localDb/sqlite";
import {debugPrintLocalDbOverview} from "./src/services/localDb/debugLocalDb";

export default function App() {
    useEffect(() => {
        async function bootstrap() {
            try {
                await initializeLocalDb();
                await debugPrintLocalDbOverview();
            } catch (error) {
                console.error("Failed to initialize local database", error);
            }
        }

        void bootstrap();
    }, []);

    return <RootNavigator/>;
}