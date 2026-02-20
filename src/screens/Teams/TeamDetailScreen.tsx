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
import {NativeStackScreenProps} from "@react-navigation/native-stack";
import {doc, onSnapshot, updateDoc} from "firebase/firestore";
import * as Clipboard from "expo-clipboard";

import {auth, db} from "../../services/firebase";
import {leaveTeam} from "../../services/teamService";
import type {AppStackParamList} from "../../navigation/AppStack";

type Props = NativeStackScreenProps<AppStackParamList, "TeamDetail">;

type TeamDoc = {
    name: string;
    code: string;
    createdBy: string;
    isPublic?: boolean;
    members: string[];
    memberMap?: Record<string, { displayName: string | null; email: string | null }>;
    stats?: {
        totalScore?: number;
        memberCount?: number;
        lastUpdated?: any;
    };
};

export default function TeamDetailScreen({route}: Props) {
    const user = auth.currentUser;

    // --- Mode handling ---
    const mode: "my" | "view" = route.params?.mode ?? "my";
    const routeTeamId = route.params?.teamId ?? null;
    const isViewMode = mode === "view";

    const [teamId, setTeamId] = useState<string | null>(null);
    const [team, setTeam] = useState<TeamDoc | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // A) Resolve teamId depending on mode
    useEffect(() => {
        setError(null);
        setLoading(true);
        setTeam(null);

        if (!user) {
            setTeamId(null);
            setLoading(false);
            return;
        }

        // View mode: directly show the team from the route param
        if (isViewMode) {
            if (!routeTeamId) {
                setTeamId(null);
                setLoading(false);
                setError("No teamId provided for view mode.");
                return;
            }
            setTeamId(routeTeamId);
            return;
        }

        // My mode: listen to user doc -> teamId (your existing behavior)
        const unsub = onSnapshot(
            doc(db, "users", user.uid),
            (snap) => {
                const data = snap.data() as any;
                setTeamId(data?.teamId ?? null);
            },
            (err) => {
                setError(err?.message ?? "Failed to load user profile.");
                setTeamId(null);
                setLoading(false);
            }
        );

        return unsub;
    }, [user?.uid, isViewMode, routeTeamId]);

    // B) Listen to team doc
    useEffect(() => {
        if (!teamId) {
            setTeam(null);
            setLoading(false);
            return;
        }

        const unsub = onSnapshot(
            doc(db, "teams", teamId),
            (snap) => {
                if (!snap.exists()) {
                    setTeam(null);
                    setLoading(false);
                    setError("Team not found.");
                    return;
                }
                setTeam(snap.data() as TeamDoc);
                setLoading(false);
            },
            (err) => {
                // If user has no permission to read a private team, you'll land here
                setTeam(null);
                setLoading(false);
                setError(err?.message ?? "Failed to load team.");
            }
        );

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

    // If view mode fails due to permissions (private team), show a clear message
    if (error && isViewMode) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>Cannot view this team</Text>
                <Text style={styles.subtitle}>
                    {error.includes("Missing or insufficient permissions")
                        ? "This team is private or you don't have permission to view it."
                        : error}
                </Text>
            </View>
        );
    }

    if (!teamId || !team) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>No team yet</Text>
                <Text style={styles.subtitle}>
                    {isViewMode ? "This team could not be loaded." : "Create or join a team from Team Up."}
                </Text>
            </View>
        );
    }

    const isCreator = team.createdBy === user.uid;
    const visibilityLabel = team.isPublic ? "Public" : "Private";

    // In view mode, keep it read-only: no leave, no visibility toggle.
    // Copy code: allow only if team is public OR you're in my-mode (your own team view).
    const canCopyCode = !!team.isPublic || !isViewMode;

    const copyCode = async () => {
        if (!canCopyCode) {
            Alert.alert("Unavailable", "Team code is hidden for private teams.");
            return;
        }

        try {
            await Clipboard.setStringAsync(team.code);
            Alert.alert("Copied ✅", "Team code copied to clipboard.");
        } catch {
            Alert.alert("Copy failed", "Please try again.");
        }
    };

    const handleLeave = async () => {
        if (isViewMode) return;

        try {
            await leaveTeam(teamId, user.uid);
            Alert.alert("Left team", "You have left the team.");
        } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Failed to leave team.");
        }
    };

    const toggleVisibility = async () => {
        if (isViewMode) return;
        if (!isCreator) return;

        try {
            await updateDoc(doc(db, "teams", teamId), {
                isPublic: !team.isPublic,
                updatedAt: new Date(),
            });
            Alert.alert("Updated", `Team is now ${!team.isPublic ? "Public" : "Private"}.`);
        } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Failed to update visibility.");
        }
    };

    return (
        <View style={styles.container}>
            {isViewMode ? (
                <View style={styles.banner}>
                    <Text style={styles.bannerText}>Viewing Team (Read-only)</Text>
                </View>
            ) : null}

            <View style={styles.codeRow}>
                <Text style={styles.subtitle}>
                    Team code: {canCopyCode ? team.code : "Hidden"}
                </Text>

                <Pressable
                    style={[styles.copyBtn, !canCopyCode && styles.copyBtnDisabled]}
                    onPress={copyCode}
                    disabled={!canCopyCode}
                >
                    <Text style={styles.copyBtnText}>Copy</Text>
                </Pressable>
            </View>

            <View style={styles.visibilityBox}>
                <Text style={styles.visibilityText}>Visibility: {visibilityLabel}</Text>

                {/* Only allow toggling in MY mode and creator only */}
                {!isViewMode ? (
                    isCreator ? (
                        <Pressable style={styles.visibilityBtn} onPress={toggleVisibility}>
                            <Text style={styles.visibilityBtnText}>
                                Make {team.isPublic ? "Private" : "Public"}
                            </Text>
                        </Pressable>
                    ) : (
                        <Text style={styles.visibilityHint}>Only the creator can change visibility.</Text>
                    )
                ) : (
                    <Text style={styles.visibilityHint}>Read-only view from leaderboard.</Text>
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

            {/* Leave team only in MY mode */}
            {!isViewMode ? (
                <Pressable style={[styles.button, styles.leave]} onPress={handleLeave}>
                    <Text style={styles.buttonText}>Leave Team</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flex: 1, padding: 20},
    title: {fontSize: 28, fontWeight: "900", marginTop: 20},
    subtitle: {marginTop: 8, opacity: 0.8},

    banner: {
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        marginBottom: 12,
    },
    bannerText: {fontWeight: "800", opacity: 0.85},

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
    copyBtnDisabled: {opacity: 0.5},

    copyBtnText: {
        color: "white",
        fontWeight: "800",
        fontSize: 12,
    },
});