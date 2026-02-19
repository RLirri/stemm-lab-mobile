import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    TextInput,
    Pressable,
    StyleSheet,
    Alert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { AppStackParamList } from "../../navigation/AppStack";
import { auth, db } from "../../services/firebase";
import { createTeam, joinTeamByCode } from "../../services/teamService";
import { doc, onSnapshot } from "firebase/firestore";

type Props = NativeStackScreenProps<AppStackParamList, "TeamUp">;

export default function TeamUpScreen({ navigation }: Props) {
    const user = auth.currentUser;

    const [teamName, setTeamName] = useState("");
    const [joinCode, setJoinCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
            const data = snap.data() as any;
            setCurrentTeamId(data?.teamId ?? null);
        });

        return unsub;
    }, [user?.uid]);

    if (!user) return null;

    const displayName = user.displayName ?? null;
    const email = user.email ?? null;

    const blocked = !!currentTeamId;

    const handleCreate = async () => {
        if (blocked) {
            Alert.alert("Already in a team", "Leave your current team before creating a new one.");
            return;
        }
        if (!teamName.trim()) {
            Alert.alert("Error", "Enter a team name.");
            return;
        }

        try {
            setLoading(true);
            const res = await createTeam(teamName.trim(), user.uid, displayName, email);
            // res can be string or object depending on your implementation; see section 2 below
            const teamId = typeof res === "string" ? res : res.teamId;
            const code = typeof res === "string" ? undefined : res.code;

            Alert.alert(
                "Team created ✅",
                code ? `Team code: ${code}` : `Team created (id: ${teamId})`
            );
            setTeamName("");

            // optional: jump straight to My Team
            navigation.navigate("TeamDetail");
        } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Failed to create team.");
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (blocked) {
            Alert.alert("Already in a team", "Leave your current team before joining another one.");
            return;
        }
        if (!joinCode.trim()) {
            Alert.alert("Error", "Enter a team code.");
            return;
        }

        try {
            setLoading(true);
            await joinTeamByCode(joinCode.trim(), user.uid, displayName, email);
            Alert.alert("Joined ✅", "You joined the team successfully.");
            setJoinCode("");

            navigation.navigate("TeamDetail");
        } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Failed to join team.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Team Up</Text>

            {blocked && (
                <View style={styles.banner}>
                    <Text style={styles.bannerText}>You are already in a team.</Text>
                    <Pressable
                        style={styles.bannerBtn}
                        onPress={() => navigation.navigate("TeamDetail")}
                    >
                        <Text style={styles.bannerBtnText}>Go to My Team</Text>
                    </Pressable>
                </View>
            )}

            <Pressable
                style={[styles.secondaryButton, (loading) && styles.buttonDisabled]}
                disabled={loading}
                onPress={() => navigation.navigate("ExploreTeams")}
            >
                <Text style={styles.secondaryText}>Explore teams</Text>
            </Pressable>

            <Text style={styles.section}>Create Team</Text>
            <TextInput
                style={styles.input}
                placeholder="Team name"
                value={teamName}
                onChangeText={setTeamName}
                editable={!blocked && !loading}
            />
            <Pressable
                style={[styles.button, (loading || blocked) && styles.buttonDisabled]}
                disabled={loading || blocked}
                onPress={handleCreate}
            >
                <Text style={styles.buttonText}>{loading ? "Please wait..." : "Create"}</Text>
            </Pressable>

            <Text style={styles.section}>Join Team</Text>
            <TextInput
                style={styles.input}
                placeholder="Team code"
                value={joinCode}
                autoCapitalize="characters"
                onChangeText={setJoinCode}
                editable={!blocked && !loading}
            />
            <Pressable
                style={[styles.button, (loading || blocked) && styles.buttonDisabled]}
                disabled={loading || blocked}
                onPress={handleJoin}
            >
                <Text style={styles.buttonText}>{loading ? "Please wait..." : "Join"}</Text>
            </Pressable>

            <Text style={styles.hint}>
                Public teams appear in Explore. Private teams require a code.
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    title: { fontSize: 32, fontWeight: "900", marginTop: 10, marginBottom: 10 },
    section: { marginTop: 18, fontWeight: "800", fontSize: 16 },
    input: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 14,
        padding: 14,
        marginTop: 10,
        backgroundColor: "#fafafa",
    },
    button: {
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
        marginTop: 12,
    },
    buttonText: { color: "white", fontWeight: "800", fontSize: 16 },
    secondaryButton: {
        alignSelf: "flex-start",
        borderWidth: 1,
        borderColor: "#111",
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 999,
        marginTop: 6,
    },
    secondaryText: { fontWeight: "800" },
    buttonDisabled: { opacity: 0.45 },
    hint: { marginTop: 14, opacity: 0.7 },

    banner: {
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 12,
        marginBottom: 12,
    },
    bannerText: { fontWeight: "800" },
    bannerBtn: {
        marginTop: 10,
        backgroundColor: "#111",
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: "center",
    },
    bannerBtnText: { color: "white", fontWeight: "800" },
});
