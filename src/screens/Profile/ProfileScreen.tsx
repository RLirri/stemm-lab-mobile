import React, {useEffect, useState} from "react";
import {
    View,
    Text,
    TextInput,
    Pressable,
    StyleSheet,
    ActivityIndicator,
    Alert,
} from "react-native";
import {doc, onSnapshot, updateDoc} from "firebase/firestore";
import {auth, db} from "../../services/firebase";
import {logout} from "../../services/authService";
import {syncQueuedSubmissions} from "../../services/syncService";
import {submitOfflineToFirebase} from "../../services/offlineSubmissionSyncAdapter";

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
    const user = auth.currentUser;

    const [profile, setProfile] = useState<UserProfileDoc | null>(null);
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);

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

    if (!user) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>Not logged in</Text>
            </View>
        );
    }

    if (!profile) {
        return (
            <View style={[styles.container, {alignItems: "center"}]}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10}}>Loading profile...</Text>
            </View>
        );
    }

    const saveName = async () => {
        const trimmed = name.trim();

        if (trimmed.length < 2) {
            Alert.alert("Invalid name", "Name must be at least 2 characters.");
            return;
        }

        try {
            setSaving(true);
            await updateDoc(doc(db, "users", user.uid), {
                displayName: trimmed,
            });
            Alert.alert("Saved", "Your name has been updated.");
        } catch (e: any) {
            Alert.alert("Update failed", e?.message ?? "Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const retryOfflineSubmissions = async () => {
        try {
            setSyncing(true);

            const results = await syncQueuedSubmissions({
                submitToRemote: submitOfflineToFirebase,
            });

            const syncedCount = results.filter(
                (result) => result.status === "synced"
            ).length;

            const failedCount = results.filter(
                (result) => result.status === "failed"
            ).length;

            Alert.alert(
                "Offline sync complete",
                `Synced: ${syncedCount}\nFailed: ${failedCount}`
            );
        } catch (e: any) {
            Alert.alert(
                "Sync failed",
                e?.message ?? "Unable to retry offline submissions."
            );
        } finally {
            setSyncing(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Profile</Text>

            <View style={styles.card}>
                <Text style={styles.row}>
                    <Text style={styles.k}>Email: </Text>
                    {profile.email ?? "-"}
                </Text>
                <Text style={styles.row}>
                    <Text style={styles.k}>Provider: </Text>
                    {profile.provider}
                </Text>
                <Text style={styles.row}>
                    <Text style={styles.k}>Team ID: </Text>
                    {profile.teamId ?? "Not in a team"}
                </Text>
                <Text style={styles.row}>
                    <Text style={styles.k}>UID: </Text>
                    {profile.uid}
                </Text>
            </View>

            <Text style={styles.label}>Display name</Text>
            <TextInput
                style={styles.input}
                value={name}
                placeholder="Your name"
                onChangeText={setName}
            />

            <Pressable
                style={[styles.button, saving && styles.buttonDisabled]}
                disabled={saving}
                onPress={saveName}
            >
                <Text style={styles.buttonText}>
                    {saving ? "Saving..." : "Save"}
                </Text>
            </Pressable>

            <Pressable
                style={[styles.button, styles.syncButton, syncing && styles.buttonDisabled]}
                disabled={syncing}
                onPress={retryOfflineSubmissions}
            >
                <Text style={styles.buttonText}>
                    {syncing ? "Retrying sync..." : "Retry Offline Submissions"}
                </Text>
            </Pressable>

            <Pressable style={[styles.button, styles.logout]} onPress={logout}>
                <Text style={styles.buttonText}>Logout</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flex: 1, padding: 20, justifyContent: "center"},
    title: {fontSize: 28, fontWeight: "800", marginBottom: 18},
    card: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 14,
        padding: 14,
        marginBottom: 18,
        backgroundColor: "#fafafa",
    },
    row: {marginBottom: 6},
    k: {fontWeight: "700"},
    label: {fontSize: 14, fontWeight: "700", marginTop: 6},
    input: {
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 12,
        padding: 12,
        marginTop: 8,
    },
    button: {
        backgroundColor: "#111",
        padding: 14,
        borderRadius: 12,
        alignItems: "center",
        marginTop: 14,
    },
    buttonDisabled: {opacity: 0.6},
    buttonText: {color: "white", fontWeight: "800"},
    syncButton: {backgroundColor: "#2563eb"},
    logout: {backgroundColor: "#444"},
});