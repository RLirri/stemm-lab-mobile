import React, {useEffect, useMemo, useState} from "react";
import {
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
    getActivity2RunDraft,
    updateActivity2Session,
    type Activity2RunDraft,
} from "../../../store/activity2RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A2Prediction">;

function normalizeLabel(x: string): string | undefined {
    const s = x.trim();
    return s.length ? s : undefined;
}

const QUICK_ACTIONS = [
    "Drop a pen",
    "Drop a book",
    "Talking",
    "Walking",
    "Stamp feet",
] as const;

export default function A2PredictionScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity2RunDraft | null>(null);

    // Form fields
    const [selectedQuick, setSelectedQuick] = useState<string | null>(null);
    const [customRaw, setCustomRaw] = useState<string>("");

    useEffect(() => {
        if (!user) return;

        const d = getActivity2RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Your draft session was reset. Please start again.", [
                {text: "OK", onPress: () => navigation.replace("A2SessionSetup", {activityId})},
            ]);
            return;
        }
        setDraft(d);
    }, [activityId, navigation, runId, user]);

    useEffect(() => {
        if (!draft) return;

        const predicted = draft.session.predictedLoudestAction ?? "";

        // If matches a quick pick, select it; else put into custom.
        const match = QUICK_ACTIONS.find((q) => q.toLowerCase() === predicted.toLowerCase());
        if (match) {
            setSelectedQuick(match);
            setCustomRaw("");
        } else {
            setSelectedQuick(null);
            setCustomRaw(predicted);
        }
    }, [draft]);

    const chosen = useMemo(() => {
        const fromQuick = selectedQuick ? selectedQuick.trim() : "";
        if (fromQuick) return fromQuick;
        return customRaw.trim();
    }, [customRaw, selectedQuick]);

    function persistPrediction() {
        const next = updateActivity2Session(runId, {
            predictedLoudestAction: normalizeLabel(chosen),
        });
        setDraft(next);
    }

    function validate(): string | null {
        // Prediction is required by spec (write-up table).
        if (!chosen.trim()) return "Please choose or type your predicted loudest action.";
        if (chosen.trim().length > 60) return "Prediction is too long. Keep it under 60 characters.";
        return null;
    }

    function onContinue() {
        if (!user) return;
        if (!draft) return;

        const err = validate();
        if (err) {
            Alert.alert("Check prediction", err);
            return;
        }

        persistPrediction();

        // Next screen will be Measurement loop (we’ll build next).
        navigation.navigate("A2Measurement", {activityId, runId});
    }

    function onSelectQuick(v: string) {
        setSelectedQuick(v);
        setCustomRaw("");
    }

    function onUseCustom() {
        setSelectedQuick(null);
    }

    if (!user) return null;

    if (!draft) {
        return (
            <View style={styles.center}>
                <Text style={{fontWeight: "900"}}>Loading draft…</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Prediction</Text>
                <Text style={styles.sub}>
                    Predict which classroom action will produce the loudest sound. You will compare this prediction
                    later.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Quick Picks</Text>
                    <Text style={styles.help}>
                        Choose one common action, or switch to “Custom” if you want a different action.
                    </Text>

                    <View style={styles.segmentWrap}>
                        {QUICK_ACTIONS.map((v) => {
                            const on = selectedQuick === v;
                            return (
                                <Pressable
                                    key={v}
                                    style={[styles.segmentBtn, on && styles.segmentBtnActive]}
                                    onPress={() => onSelectQuick(v)}
                                >
                                    <Text style={[styles.segmentText, on && styles.segmentTextActive]}>{v}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Pressable style={styles.ghostBtn} onPress={onUseCustom}>
                        <Text style={styles.ghostBtnText}>Use Custom Action Instead</Text>
                    </Pressable>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Custom (optional)</Text>
                    <Text style={styles.help}>
                        If your predicted action isn’t listed above, type it here.
                    </Text>

                    <Text style={styles.label}>Predicted loudest action</Text>
                    <TextInput
                        value={customRaw}
                        onChangeText={(t) => {
                            setCustomRaw(t);
                            // once they type, treat as custom
                            if (t.trim().length) setSelectedQuick(null);
                        }}
                        placeholder='e.g. "Drop a metal water bottle"'
                        style={styles.input}
                        maxLength={60}
                    />

                    <View style={styles.previewRow}>
                        <Text style={styles.previewK}>Current selection:</Text>
                        <Text style={styles.previewV}>{chosen.trim() ? chosen.trim() : "—"}</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>What happens next</Text>
                    <Text style={styles.help}>
                        You will record at least <Text style={styles.bold}>3 measurements</Text> (dB + optional GPS).
                        Then you’ll view a map and a results dashboard to see whether you were right.
                    </Text>
                </View>

                <Pressable style={styles.primaryBtn} onPress={onContinue}>
                    <Text style={styles.primaryBtnText}>Continue</Text>
                </Pressable>

                <Text style={styles.footerHint}>Next: Measurement loop → Map → Results → Reflection & Submit.</Text>

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

    segmentWrap: {
        marginTop: 10,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    segmentBtn: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    segmentBtnActive: {backgroundColor: "#111", borderColor: "#111"},
    segmentText: {fontWeight: "900", opacity: 0.85},
    segmentTextActive: {color: "white", opacity: 1},

    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === "ios" ? 12 : 10,
    },

    previewRow: {marginTop: 12, flexDirection: "row", justifyContent: "space-between", gap: 12},
    previewK: {flex: 1, fontWeight: "800", opacity: 0.9},
    previewV: {fontWeight: "900"},

    bold: {fontWeight: "900"},

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    ghostBtn: {
        marginTop: 12,
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor: "transparent",
    },
    ghostBtnText: {fontWeight: "900", opacity: 0.85},

    footerHint: {marginTop: 10, opacity: 0.7, lineHeight: 18},
});