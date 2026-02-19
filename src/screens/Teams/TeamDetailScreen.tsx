import React, {useEffect, useMemo, useState} from "react";
import {
    View,
    Text,
    Pressable,
    StyleSheet,
    ActivityIndicator,
    Alert,
    FlatList,
} from "react-native";
import {auth, db} from "../../services/firebase";
import {doc, onSnapshot, updateDoc} from "firebase/firestore";
import {leaveTeam} from "../../services/teamService";
import * as Clipboard from "expo-clipboard";

type TeamDoc = {
    name: string;
    code: string;
    createdBy: string;
    isPublic?: boolean;
    members: string[];
    memberMap?: Record<string, { displayName: string | null; email: string | null }>;
};

export default function TeamDetailScreen() {
    const user = auth.currentUser;

    const [teamId, setTeamId] = useState<string | null>(null);
    const [team, setTeam] = useState<TeamDoc | null>(null);
    const [loading, setLoading] = useState(true);

    // Listen to user doc -> teamId
    useEffect(() => {
        if (!user) return;

        const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
            const data = snap.data() as any;
            setTeamId(data?.teamId ?? null);
        });

        return unsub;
    }, [user?.uid]);

    // Listen to team doc
    useEffect(() => {
        if (!teamId) {
            setTeam(null);
            setLoading(false);
            return;
        }

        const unsub = onSnapshot(doc(db, "teams", teamId), (snap) => {
            if (!snap.exists()) {
                setTeam(null);
                setLoading(false);
                return;
            }
            setTeam(snap.data() as TeamDoc);
            setLoading(false);
        });

        return unsub;
    }, [teamId]);

    const memberList = useMemo(() => {
        const map = team?.memberMap ?? {};
        return Object.entries(map).map(([uid, info]) => ({
            uid,
            displayName: info.displayName,
            email: info.email,
        }));
    }, [team?.memberMap]);

    if (!user) return null;

    if (loading) {
        return (
            <View style={[styles.container, {alignItems: "center"}]}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10}}>Loading team...</Text>
            </View>
        );
    }

    if (!teamId || !team) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>No team yet</Text>
                <Text style={styles.subtitle}>Create or join a team from Team Up.</Text>
            </View>
        );
    }
    const copyCode = async () => {
        try {
            await Clipboard.setStringAsync(team.code);
            Alert.alert("Copied ✅", "Team code copied to clipboard.");
        } catch {
            Alert.alert("Copy failed", "Please try again.");
        }
    };


    const handleLeave = async () => {
        try {
            await leaveTeam(teamId, user.uid);
            Alert.alert("Left team", "You have left the team.");
        } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Failed to leave team.");
        }
    };

    const isCreator = team.createdBy === user.uid;
    const visibilityLabel = team.isPublic ? "Public" : "Private";

    const toggleVisibility = async () => {
        if (!isCreator) return;

        try {
            await updateDoc(doc(db, "teams", teamId), {
                isPublic: !team.isPublic,
            });
            Alert.alert("Updated", `Team is now ${!team.isPublic ? "Public" : "Private"}.`);
        } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Failed to update visibility.");
        }
    };


    return (
        <View style={styles.container}>
            <View style={styles.codeRow}>
                <Text style={styles.subtitle}>Team code: {team.code}</Text>

                <Pressable style={styles.copyBtn} onPress={copyCode}>
                    <Text style={styles.copyBtnText}>Copy</Text>
                </Pressable>
            </View>

            <View style={styles.visibilityBox}>
                <Text style={styles.visibilityText}>Visibility: {visibilityLabel}</Text>

                {isCreator ? (
                    <Pressable style={styles.visibilityBtn} onPress={toggleVisibility}>
                        <Text style={styles.visibilityBtnText}>
                            Make {team.isPublic ? "Private" : "Public"}
                        </Text>
                    </Pressable>
                ) : (
                    <Text style={styles.visibilityHint}>Only the creator can change visibility.</Text>
                )}
            </View>


            <Text style={styles.section}>Members</Text>
            <FlatList
                data={memberList}
                keyExtractor={(item) => item.uid}
                renderItem={({item}) => (
                    <View style={styles.memberRow}>
                        <Text style={styles.memberName}>{item.displayName ?? "(No name)"}</Text>
                        <Text style={styles.memberEmail}>{item.email ?? ""}</Text>
                    </View>
                )}
            />

            <Pressable style={[styles.button, styles.leave]} onPress={handleLeave}>
                <Text style={styles.buttonText}>Leave Team</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flex: 1, padding: 20},
    title: {fontSize: 28, fontWeight: "900", marginTop: 20},
    subtitle: {marginTop: 8, opacity: 0.8},
    section: {marginTop: 18, fontWeight: "800", fontSize: 16},
    memberRow: {
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    memberName: {fontWeight: "800"},
    memberEmail: {opacity: 0.7, marginTop: 2},
    button: {
        backgroundColor: "#111",
        padding: 14,
        borderRadius: 12,
        alignItems: "center",
        marginTop: 18,
    },
    leave: {backgroundColor: "#B00020"},
    buttonText: {color: "white", fontWeight: "800"},
    visibilityBox: {
        marginTop: 14,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
    },
    visibilityText: {fontWeight: "900"},
    visibilityHint: {marginTop: 8, opacity: 0.7},
    visibilityBtn: {
        marginTop: 10,
        backgroundColor: "#111",
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: "center",
    },
    visibilityBtnText: {color: "white", fontWeight: "800"},


    codeRow: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: "#fafafa",
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#eee",
    },

    copyBtn: {
        backgroundColor: "#111",
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 999,
    },

    copyBtnText: {
        color: "white",
        fontWeight: "800",
        fontSize: 12,
    },

});
