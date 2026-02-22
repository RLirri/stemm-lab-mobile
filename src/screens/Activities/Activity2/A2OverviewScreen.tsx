import React, {useEffect, useMemo, useState} from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {getActivityById} from "../../../services/activityService";
import {SOUND_RISK_BANDS} from "../../../services/scoringService";
import type {Activity} from "../../../types/activity";

import {auth} from "../../../services/firebase";
import {createActivity2RunDraft} from "../../../store/activity2RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A2Overview">;

function normalizeText(x: unknown): string | undefined {
    const s = typeof x === "string" ? x.trim() : "";
    return s.length ? s : undefined;
}

function splitLines(x: string): string[] {
    return x
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);
}

function safeStringArray(x: unknown): string[] {
    if (!Array.isArray(x)) return [];
    return x
        .filter((v) => typeof v === "string" && v.trim().length)
        .map((v) => (v as string).trim());
}

function formatDbRange(minDb: number, maxDb: number | null): string {
    // matches your spec formatting, handles null/infinity
    if (maxDb == null) return `${minDb}+ dB`;
    return `${minDb}–${maxDb} dB`;
}

export default function A2OverviewScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;

    const [activity, setActivity] = useState<Activity | null>(null);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        let mounted = true;

        async function load() {
            try {
                setLoading(true);
                const a = await getActivityById(activityId);
                if (!mounted) return;
                setActivity(a);
            } catch (e: any) {
                if (!mounted) return;
                setActivity(null);
                Alert.alert("Load error", e?.message ?? "Failed to load activity.");
            } finally {
                if (!mounted) return;
                setLoading(false);
            }
        }

        load();
        return () => {
            mounted = false;
        };
    }, [activityId]);

    const title = useMemo(
        () => normalizeText(activity?.title) ?? "Sound Pollution Hunter",
        [activity?.title]
    );

    // NOTE: Activity type might not include shortDescription/description/instructions strongly.
    // Use casting, but always normalize.
    const shortDesc = useMemo(() => {
        const a = activity as any;
        return (
            normalizeText(a?.shortDescription) ??
            "Measure and compare classroom sound levels (dB), record locations, and map loud vs quiet zones."
        );
    }, [activity]);

    const overview = useMemo(() => {
        const a = activity as any;
        return (
            normalizeText(a?.description) ??
            "Students measure noise from different actions (dropping objects, talking, walking, stamping), record sound levels with GPS, then map loud and quiet zones. They predict the loudest action and reflect on whether earmuffs are needed."
        );
    }, [activity]);

    const equipment: string[] = useMemo(() => {
        const a = activity as any;
        const list = safeStringArray(a?.equipment);
        if (list.length) return list;

        // fallback if Firestore doc doesn’t include equipment yet
        return ["Mobile phone with STEMM Lab app", "Everyday objects (pens/books)"];
    }, [activity]);

    const instructionLines: string[] = useMemo(() => {
        const a = activity as any;
        const inst = normalizeText(a?.instructions);
        if (inst) return splitLines(inst);

        // fallback aligned to your spec
        return [
            "Measure noise from different actions (drop pens/books, talking, walking, stamping).",
            "Record sound levels (dB) and locations (GPS if enabled).",
            "Map loud and quiet zones.",
            "Predict the loudest action, then check if you were correct.",
            "Submit: at least 3 valid measurements + session video evidence + reflection.",
        ];
    }, [activity]);

    async function onStart() {
        if (!user) {
            Alert.alert("Sign in required", "Please sign in to start this activity.");
            return;
        }

        try {
            setStarting(true);

            // Create a run draft now so the rest of A2 flow always has runId.
            const draft = createActivity2RunDraft(activityId, user.uid);

            navigation.navigate("A2SessionSetup", {activityId, runId: draft.runId});
        } catch (e: any) {
            Alert.alert("Start failed", e?.message ?? "Unable to start Activity 2.");
        } finally {
            setStarting(false);
        }
    }

    function onBack() {
        navigation.goBack();
    }

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={styles.loadingText}>Loading activity…</Text>
            </View>
        );
    }

    if (!activity) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorTitle}>Activity not found</Text>
                <Text style={styles.errorSub}>
                    This activity may be missing from Firestore or the provided activityId is invalid.
                </Text>

                <Pressable style={styles.primaryBtn} onPress={onBack}>
                    <Text style={styles.primaryBtnText}>Back</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>{shortDesc}</Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Overview</Text>
                <Text style={styles.help}>{overview}</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Equipment</Text>
                {(equipment ?? []).map((it, idx) => (
                    <Bullet key={`${it}-${idx}`} text={it}/>
                ))}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Instructions</Text>
                {(instructionLines ?? []).map((line, idx) => (
                    <Bullet key={`${line}-${idx}`} text={line}/>
                ))}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Hearing Damage Risk (dB)</Text>
                <Text style={styles.help}>
                    Use this table to assign a risk category for each measurement. Then answer: “Should we
                    wear earmuffs in your classroom?”
                </Text>

                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <Text style={[styles.cell, styles.cellHeader]}>Sound Level</Text>
                        <Text style={[styles.cell, styles.cellHeader]}>Risk</Text>
                    </View>

                    {SOUND_RISK_BANDS.map((b) => (
                        <View key={`${b.minDb}-${String(b.maxDb)}`} style={styles.tableRow}>
                            <Text style={styles.cell}>{formatDbRange(b.minDb, b.maxDb)}</Text>
                            <Text style={styles.cell}>{b.label}</Text>
                        </View>
                    ))}
                </View>

                <Text style={styles.note}>
                    Submission policy: minimum <Text style={styles.bold}>3 valid measurements</Text> +{" "}
                    <Text style={styles.bold}>1 session video evidence</Text>.
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Write-up Prompts</Text>
                <Bullet text="Predict which action created the loudest sound."/>
                <Bullet text="Record results (dB) for at least 3 actions."/>
                <Bullet text="Were you right? Why or why not?"/>
                <Bullet text="Any surprises? Explain using surface/material/energy."/>
                <Bullet text="Should we wear earmuffs in your classroom? Use the risk table as evidence."/>
            </View>

            <Pressable
                style={[styles.primaryBtn, starting && {opacity: 0.7}]}
                onPress={onStart}
                disabled={starting}
            >
                <Text style={styles.primaryBtnText}>{starting ? "Starting…" : "Start Activity"}</Text>
            </Pressable>

            <Pressable
                style={styles.secondaryBtn}
                onPress={() =>
                    Alert.alert("Back", "Return to the previous screen?", [
                        {text: "Cancel", style: "cancel"},
                        {text: "OK", onPress: onBack},
                    ])
                }
            >
                <Text style={styles.secondaryBtnText}>Back</Text>
            </Pressable>

            <View style={{height: 30}}/>
        </ScrollView>
    );
}

function Bullet({text}: { text: string }) {
    return (
        <View style={styles.bulletRow}>
            <Text style={styles.bulletDot}>•</Text>
            <Text style={styles.bulletText}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20},

    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backgroundColor: "white",
    },
    loadingText: {marginTop: 10, opacity: 0.7},

    title: {fontSize: 26, fontWeight: "900", marginTop: 6},
    sub: {marginTop: 8, opacity: 0.75, lineHeight: 18},

    card: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {fontSize: 16, fontWeight: "900"},
    help: {marginTop: 8, opacity: 0.7, lineHeight: 18},

    bulletRow: {flexDirection: "row", alignItems: "flex-start", marginTop: 8, gap: 8},
    bulletDot: {fontWeight: "900", opacity: 0.85, marginTop: 1},
    bulletText: {flex: 1, fontWeight: "700", opacity: 0.9, lineHeight: 18},

    table: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "white",
    },
    tableRow: {
        flexDirection: "row",
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderTopWidth: 1,
        borderTopColor: "#f0f0f0",
    },
    tableHeader: {borderTopWidth: 0, backgroundColor: "#fafafa"},
    cell: {flex: 1, fontWeight: "800", opacity: 0.9},
    cellHeader: {fontWeight: "900", opacity: 0.85},

    note: {marginTop: 10, opacity: 0.75, lineHeight: 18},
    bold: {fontWeight: "900", opacity: 0.95},

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    secondaryBtn: {
        marginTop: 10,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},

    errorTitle: {fontSize: 16, fontWeight: "900"},
    errorSub: {marginTop: 8, opacity: 0.7, lineHeight: 18, textAlign: "center"},
});