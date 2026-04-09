import React, {useEffect, useState} from "react";
import {NavigationContainer} from "@react-navigation/native";
import {onAuthStateChanged, User} from "firebase/auth";
import {ActivityIndicator, StyleSheet, View} from "react-native";

import {auth} from "../services/firebase";
import AuthStack from "./AuthStack";
import AppStack from "./AppStack";
import {ensureUserProfile} from "../services/userService";
import {useAppLanguage} from "../hooks/useAppLanguage";

export default function RootNavigator() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const {isReady} = useAppLanguage();

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (u) => {
            try {
                if (u) {
                    await ensureUserProfile(u);
                    setUser(u);
                } else {
                    setUser(null);
                }
            } catch (e) {
                console.warn("ensureUserProfile failed:", e);
                setUser(u ?? null);
            } finally {
                setLoading(false);
            }
        });

        return unsub;
    }, []);

    if (!isReady || loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large"/>
            </View>
        );
    }

    return (
        <NavigationContainer>
            {user ? <AppStack/> : <AuthStack/>}
        </NavigationContainer>
    );
}

const styles = StyleSheet.create({
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "white",
    },
});