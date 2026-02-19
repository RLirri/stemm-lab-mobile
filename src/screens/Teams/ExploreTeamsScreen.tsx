import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, Alert } from "react-native";
import { doc, collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../../services/firebase";
import { joinTeamById } from "../../services/teamService";
import * as Clipboard from "expo-clipboard";


type TeamCard = {
    id: string;
    name: string;
    code: string;
    members?: string[];
    isPublic?: boolean;
};

export default function ExploreTeamsScreen() {
    const user = auth.currentUser;
    const [teams, setTeams] = useState<TeamCard[]>([]);
    const [loading, setLoading] = useState(true);

    const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
            const data = snap.data() as any;
            setCurrentTeamId(data?.teamId ?? null);
        });
        return unsub;
    }, [user?.uid]);

    const blocked = !!currentTeamId;

    const copyCode = async (code: string) => {
        try {
            await Clipboard.setStringAsync(code);
            Alert.alert("Copied ✅", "Team code copied to clipboard.");
        } catch {
            Alert.alert("Error", "Failed to copy code.");
        }
    };



    useEffect(() => {
        const q = query(collection(db, "teams"), where("isPublic", "==", true));
        const unsub = onSnapshot(q, (snap) => {
            const list: TeamCard[] = snap.docs.map((d) => ({
                id: d.id,
                ...(d.data() as any),
            }));
            setTeams(list);
            setLoading(false);
        });
        return unsub;
    }, []);

    if (!user) return null;

    const handleJoin = async (teamId: string) => {
        try {
            await joinTeamById(teamId, user.uid, user.displayName ?? null, user.email ?? null);
            Alert.alert("Success", "Joined team!");
        } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Failed to join.");
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Explore Teams</Text>

            {loading ? (
                <Text style={{ opacity: 0.7 }}>Loading teams...</Text>
            ) : (
                <FlatList
                    data={teams}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingVertical: 8 }}
                    renderItem={({ item }) => (
                        <View style={styles.card}>
                            <Text style={styles.teamName}>{item.name}</Text>

                            <Text style={styles.meta}>
                                Members: {item.members?.length ?? 0}
                            </Text>

                            <View style={styles.codeRow}>
                                <Text style={styles.codeText}>Code: {item.code}</Text>

                                <Pressable
                                    style={styles.copyBtn}
                                    onPress={() => copyCode(item.code)}
                                >
                                    <Text style={styles.copyBtnText}>Copy</Text>
                                </Pressable>
                            </View>

                            <Pressable
                                style={[styles.button, blocked && { opacity: 0.45 }]}
                                disabled={blocked}
                                onPress={() => handleJoin(item.id)}
                            >
                                <Text style={styles.buttonText}>{blocked ? "Already in a team" : "Join"}</Text>
                            </Pressable>

                        </View>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    title: { fontSize: 26, fontWeight: "900", marginTop: 12 },
    card: {
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 16,
        padding: 16,
        marginTop: 14,
        backgroundColor: "#fafafa",
    },

    teamName: {
        fontSize: 16,
        fontWeight: "900",
    },

    meta: {
        marginTop: 6,
        fontSize: 12,
        opacity: 0.7,
    },

    codeRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#eee",
    },

    codeText: {
        fontWeight: "800",
        fontSize: 13,
    },

    copyBtn: {
        backgroundColor: "#111",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
    },

    copyBtnText: {
        color: "white",
        fontWeight: "800",
        fontSize: 12,
    },

    button: {
        marginTop: 12,
        backgroundColor: "#111",
        paddingVertical: 12,
        borderRadius: 14,
        alignItems: "center",
    },

    buttonText: {
        color: "white",
        fontWeight: "800",
    },

});
