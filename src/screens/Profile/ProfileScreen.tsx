import React, {useEffect, useState} from "react";
import {
    View,
    Text,
    TextInput,
    Pressable,
    StyleSheet,
    ActivityIndicator,
    Alert,
    ScrollView,
} from "react-native";
import {doc, onSnapshot, updateDoc} from "firebase/firestore";
import {useTranslation} from "react-i18next";

import {auth, db} from "../../services/firebase";
import {logout} from "../../services/authService";
import LanguageSwitcher from "../../components/common/LanguageSwitcher";

type UserProfileDoc = {
    uid: string;
    email: string | null;
    displayName: string | null;
    provider: string;
    teamId: string | null;
    createdAt?: any;
    updatedAt?: any;
};

export default function ProfileScreen() {
    const {t} = useTranslation(["common", "profile"]);
    const user = auth.currentUser;

    const [profile, setProfile] = useState<UserProfileDoc | null>(null);
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user) return;

        const ref = doc(db, "users", user.uid);
        const unsub = onSnapshot(ref, (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as UserProfileDoc;
            setProfile(data);
            setName(data.displayName ?? "");
        });

        return unsub;
    }, [user?.uid]);

    const saveName = async () => {
        if (!user) {
            Alert.alert(t("common:feedback.error"), t("profile:notLoggedIn"));
            return;
        }

        const trimmed = name.trim();

        if (trimmed.length < 2) {
            Alert.alert(
                t("profile:invalidNameTitle"),
                t("profile:invalidNameMessage")
            );
            return;
        }

        try {
            setSaving(true);
            await updateDoc(doc(db, "users", user.uid), {
                displayName: trimmed,
            });

            Alert.alert(
                t("common:feedback.saved"),
                t("profile:updatedMessage")
            );
        } catch (e: any) {
            Alert.alert(
                t("common:feedback.updateFailed"),
                e?.message ?? t("common:actions.retry")
            );
        } finally {
            setSaving(false);
        }
    };

    if (!user) {
        return (
            <View style={styles.centerContainer}>
                <Text style={styles.title}>{t("profile:notLoggedIn")}</Text>
            </View>
        );
    }

    if (!profile) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator/>
                <Text style={styles.loadingText}>{t("common:states.loadingProfile")}</Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>{t("profile:title")}</Text>

            <View style={styles.card}>
                <Text style={styles.row}>
                    <Text style={styles.k}>{t("profile:email")}: </Text>
                    {profile.email ?? "-"}
                </Text>

                <Text style={styles.row}>
                    <Text style={styles.k}>{t("profile:provider")}: </Text>
                    {profile.provider}
                </Text>

                <Text style={styles.row}>
                    <Text style={styles.k}>{t("profile:teamId")}: </Text>
                    {profile.teamId ?? t("profile:notInTeam")}
                </Text>

                <Text style={styles.row}>
                    <Text style={styles.k}>{t("profile:uid")}: </Text>
                    {profile.uid}
                </Text>
            </View>

            <Text style={styles.label}>{t("profile:displayName")}</Text>
            <TextInput
                style={styles.input}
                value={name}
                placeholder={t("profile:placeholderName")}
                onChangeText={setName}
            />

            <Pressable
                style={[styles.button, saving && styles.buttonDisabled]}
                disabled={saving}
                onPress={saveName}
            >
                <Text style={styles.buttonText}>
                    {saving ? t("common:states.saving") : t("common:actions.save")}
                </Text>
            </Pressable>

            <LanguageSwitcher/>

            <Pressable style={[styles.button, styles.logout]} onPress={logout}>
                <Text style={styles.buttonText}>{t("common:actions.logout")}</Text>
            </Pressable>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        padding: 20,
        justifyContent: "center",
    },
    centerContainer: {
        flex: 1,
        padding: 20,
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        marginTop: 10,
    },
    title: {
        fontSize: 28,
        fontWeight: "800",
        marginBottom: 18,
    },
    card: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 14,
        padding: 14,
        marginBottom: 18,
        backgroundColor: "#fafafa",
    },
    row: {
        marginBottom: 6,
    },
    k: {
        fontWeight: "700",
    },
    label: {
        fontSize: 14,
        fontWeight: "700",
        marginTop: 6,
    },
    input: {
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 12,
        padding: 12,
        marginTop: 8,
        backgroundColor: "white",
    },
    button: {
        backgroundColor: "#111",
        padding: 14,
        borderRadius: 12,
        alignItems: "center",
        marginTop: 14,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    buttonText: {
        color: "white",
        fontWeight: "800",
    },
    logout: {
        backgroundColor: "#444",
    },
});