import React, {useEffect, useState} from "react";
import {NavigationContainer} from "@react-navigation/native";
import {onAuthStateChanged, User} from "firebase/auth";
import {auth} from "../services/firebase";
import AuthStack from "./AuthStack";
import AppStack from "./AppStack";
import {ensureUserProfile} from "../services/userService";
import {syncQueuedSubmissions} from "../services/syncService";
import {submitOfflineToFirebase} from "../services/offlineSubmissionSyncAdapter";

export default function RootNavigator() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (u) => {
            try {
                if (u) {
                    await ensureUserProfile(u);

                    const results = await syncQueuedSubmissions({
                        submitToRemote: submitOfflineToFirebase,
                    });

                    console.log("Post-login offline sync results:", results);

                    setUser(u);
                } else {
                    setUser(null);
                }
            } catch (e) {
                console.warn("Auth/bootstrap failed:", e);
                setUser(u ?? null);
            } finally {
                setLoading(false);
            }
        });

        return unsub;
    }, []);

    if (loading) return null;

    return (
        <NavigationContainer>
            {user ? <AppStack/> : <AuthStack/>}
        </NavigationContainer>
    );
}