import React, {useEffect, useMemo, useState} from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";
import {
    getActivity4RunDraft,
    setActivity4Prediction,
    type Activity4RunDraft,
} from "../../../store/activity4RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A4Prediction">;

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function hasSessionBasics(d: Activity4RunDraft) {
    return !!d.session?.activityId && typeof d.session.designCount === "number" && d.session.designCount >= 3;
}

function isValidPick(idx: number, designCount: number) {
    return Number.isFinite(idx) && idx >= 0 && idx < designCount;
}

export default function A4PredictionScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);

    const [bestDesignIndex, setBestDesignIndex] = useState<number | null>(null);
    const [notes, setNotes] = useState<string>("");

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user) return;

        const d = getActivity4RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Please restart Activity 4.", [
                {text: "OK", onPress: () => navigation.replace("A4SessionSetup", {activityId})},
            ]);
            return;
        }

        if (!hasSessionBasics(d)) {
            Alert.alert("Setup required", "Please complete Session Setup before Prediction.", [
                {text: "Go to Setup", onPress: () => navigation.replace("A4SessionSetup", {activityId, runId})},
            ]);
            return;
        }

        setDraft(d);
        setBestDesignIndex(
            typeof d.prediction?.predictedBestDesignIndex === "number"
                ? d.prediction!.predictedBestDesignIndex!
                : null
        );
        setNotes(d.prediction?.predictedNotes ?? "");
    }, [activityId, navigation, runId, user]);

    const designOptions = useMemo(() => {
        if (!draft) return [];
        return Array.from({length: draft.session.designCount}, (_, i) => {
            const name = draft.session.designs?.[i]?.name?.trim();
            return {
                index: i,
                label: name ? name : `Design ${i + 1}`,
                meta: buildDesignMeta(draft, i),
            };
        });
    }, [draft]);

    function buildDesignMeta(d: Activity4RunDraft, i: number) {
        const des = d.session.designs?.[i];
        if (!des) return "";

        const parts: string[] = [];
        if (typeof des.foldCount === "number") parts.push(`${des.foldCount} folds`);
        if (typeof des.pillarCount === "number") parts.push(`${des.pillarCount} pillars`);
        if (typeof des.layers === "number") parts.push(`${des.layers} layers`);

        if (typeof des.baseWidthCm === "number" || typeof des.baseLengthCm === "number") {
            const w = typeof des.baseWidthCm === "number" ? `${Math.round(des.baseWidthCm)}cm` : "?";
            const l = typeof des.baseLengthCm === "number" ? `${Math.round(des.baseLengthCm)}cm` : "?";
            parts.push(`${w}×${l}`);
        }

        return parts.join(" • ");
    }

    const durationText = useMemo(() => {
        if (!draft) return "";
        const sec = draft.session.vibrationDurationSec;
        return `${sec}s vibration test`;
    }, [draft]);

    function validate(): string | null {
        if (!draft) return "Draft not loaded.";
        const count = draft.session.designCount;

        if (bestDesignIndex == null) return "Please select which design will move the least.";
        if (!isValidPick(bestDesignIndex, count)) return "Selected design is out of range.";

        // Keep it meaningful but not overly strict
        if (notes.trim().length > 0 && notes.trim().length < 8) {
            return "Prediction notes are too short. Add a bit more detail (or clear it).";
        }

        return null;
    }

    async function onSaveAndContinue() {
        if (!draft) return;

        const err = validate();
        if (err) {
            Alert.alert("Check prediction", err);
            return;
        }
        if (bestDesignIndex == null) return;

        try {
            setSaving(true);

            const next = setActivity4Prediction(runId, {
                predictedBestDesignIndex: bestDesignIndex,
                predictedNotes: notes.trim() ? notes.trim() : undefined,
            });

            setDraft(next);

            navigation.navigate("A4Measurements", {activityId, runId});
        } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Failed to save prediction.");
        } finally {
            setSaving(false);
        }
    }

    function onBackToSetup() {
        navigation.navigate("A4SessionSetup", {activityId, runId});
    }

    if (!user) return null;

    if (!draft) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10, opacity: 0.7}}>Loading…</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Prediction</Text>
                <Text style={styles.sub}>
                    Before measuring, predict which structure design will make the phone move the least.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Test conditions</Text>
                    <Text style={styles.help}>
                        {durationText} · Surface:{" "}
                        <Text style={styles.bold}>{draft.session.surfaceContext ?? "Not sure"}</Text>
                    </Text>
                    <Text style={[styles.help, {marginTop: 6}]}>
                        Goal: <Text style={styles.bold}>Lowest movement score</Text> wins on the leaderboard.
                    </Text>

                    <Pressable style={[styles.secondaryBtn, {marginTop: 12}]} onPress={onBackToSetup}>
                        <Text style={styles.secondaryBtnText}>Edit Session Setup</Text>
                    </Pressable>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Select best design</Text>
                    <Text style={styles.help}>
                        Choose the design you believe will have the smallest movement during vibration.
                    </Text>

                    <View style={{marginTop: 10, gap: 10}}>
                        {designOptions.map((o) => {
                            const selected = bestDesignIndex === o.index;
                            return (
                                <Pressable
                                    key={o.index}
                                    onPress={() => setBestDesignIndex(o.index)}
                                    style={[styles.choiceCard, selected && styles.choiceCardOn]}
                                >
                                    <Text style={[styles.choiceTitle, selected && styles.choiceTitleOn]}>
                                        {o.label}
                                    </Text>
                                    {o.meta ? (
                                        <Text
                                            style={[styles.choiceMeta, selected && styles.choiceMetaOn]}>{o.meta}</Text>
                                    ) : (
                                        <Text style={[styles.choiceMeta, selected && styles.choiceMetaOn]}>
                                            (No design details yet)
                                        </Text>
                                    )}
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Why do you think so?</Text>

                    <View style={styles.promptBox}>
                        <Text style={styles.promptTitle}>Prompt ideas</Text>
                        <Text style={styles.promptText}>• More folds = better vibration dampening?</Text>
                        <Text style={styles.promptText}>• More pillars = better stability?</Text>
                        <Text style={styles.promptText}>• Wider base = less wobble?</Text>
                    </View>

                    <Text style={styles.label}>Prediction notes (optional)</Text>
                    <TextInput
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="e.g. Design 2 has more folds and a wider base, so it should absorb vibration better."
                        style={[styles.input, {height: 120, textAlignVertical: "top"}]}
                        multiline
                    />
                </View>

                <Pressable
                    style={[styles.primaryBtn, saving && {opacity: 0.7}]}
                    onPress={onSaveAndContinue}
                    disabled={saving}
                >
                    {saving ? (
                        <View style={{flexDirection: "row", alignItems: "center", gap: 10}}>
                            <ActivityIndicator color="white"/>
                            <Text style={styles.primaryBtnText}>Saving…</Text>
                        </View>
                    ) : (
                        <Text style={styles.primaryBtnText}>Continue to Measurements</Text>
                    )}
                </Pressable>

                <Text style={styles.footerHint}>Next: Measurements → Results → Reflection & Submit.</Text>
                <View style={{height: 30}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20},
    center: {flex: 1, alignItems: "center", justifyContent: "center"},

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
    label: {marginTop: 12, fontWeight: "800"},
    help: {marginTop: 6, opacity: 0.7, lineHeight: 18},
    bold: {fontWeight: "900"},

    choiceCard: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    choiceCardOn: {backgroundColor: "#111", borderColor: "#111"},
    choiceTitle: {fontWeight: "900", fontSize: 14, opacity: 0.9},
    choiceTitleOn: {color: "white", opacity: 1},
    choiceMeta: {marginTop: 6, opacity: 0.75, lineHeight: 18},
    choiceMetaOn: {color: "white", opacity: 0.85},

    promptBox: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    promptTitle: {fontWeight: "900"},
    promptText: {marginTop: 6, opacity: 0.85, lineHeight: 18},

    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
    },

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    secondaryBtn: {
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#111",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},

    footerHint: {marginTop: 10, opacity: 0.7, lineHeight: 18},
});