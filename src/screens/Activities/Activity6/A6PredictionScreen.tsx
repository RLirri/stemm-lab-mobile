// src/screens/Activities/Activity6/A6PredictionScreen.tsx

import React, {useCallback, useEffect, useMemo, useState} from "react";
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
import {useFocusEffect} from "@react-navigation/native";

import type {AppStackParamList} from "../../../navigation/AppStack";

import {
    getActivity6RunDraft,
    setActivity6Prediction,
    type Activity6RunDraft,
    type A6PredictionDraft,
} from "../../../store/activity6RunDraftStore";

/* =========================================================
   Helpers
========================================================= */

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function trimOrUndef(s?: string) {
    const t = s?.trim();
    return t ? t : undefined;
}

function parseMs(input: string): number | null {
    const cleaned = input.replace(/[^\d]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return n;
}

type HandPick = NonNullable<A6PredictionDraft["predictedHandFaster"]>;

type Props = NativeStackScreenProps<AppStackParamList, "A6Prediction">;

/* =========================================================
   Screen
========================================================= */

export default function A6PredictionScreen({route, navigation}: Props) {
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity6RunDraft | null>(null);

    const [reactionMsText, setReactionMsText] = useState<string>("");
    const [handPick, setHandPick] = useState<HandPick | null>(null);

    const refresh = useCallback(() => {
        const d = getActivity6RunDraft(runId);
        setDraft(d);

        if (d?.prediction) {
            const ms = d.prediction.predictedReactionTimeMs;
            setReactionMsText(isFiniteNumber(ms) ? String(Math.round(ms)) : "");
            setHandPick(d.prediction.predictedHandFaster ?? null);
        }
    }, [runId]);

    useEffect(() => {
        const d = getActivity6RunDraft(runId);
        if (!d) {
            Alert.alert(
                "Session expired",
                "Your Activity 6 session draft was not found. Please start again.",
                [{text: "OK", onPress: () => navigation.replace("A6SessionSetup", {activityId})}]
            );
            return;
        }

        setDraft(d);
        const ms = d.prediction?.predictedReactionTimeMs;
        setReactionMsText(isFiniteNumber(ms) ? String(Math.round(ms)) : "");
        setHandPick(d.prediction?.predictedHandFaster ?? null);
    }, [activityId, navigation, runId]);

    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh])
    );

    const view = useMemo(() => {
        if (!draft) return null;

        const threshold = clampInt(draft.session.accuracyThresholdPct ?? 60, 0, 100);
        const trialsPerHand = clampInt(draft.session.trialsPerHand ?? 3, 1, 10);

        // Validation status
        const msParsed = parseMs(reactionMsText);
        const msOk = msParsed != null && msParsed >= 100 && msParsed <= 2000;
        const handOk = !!handPick;

        return {
            threshold,
            trialsPerHand,
            msParsed,
            msOk,
            handOk,
            ready: msOk && handOk,
        };
    }, [draft, handPick, reactionMsText]);

    function onSave() {
        if (!draft || !view) return;

        const msParsed = parseMs(reactionMsText);
        if (msParsed == null) {
            Alert.alert("Missing prediction", "Please enter your predicted reaction time (ms).");
            return;
        }

        const ms = clampInt(msParsed, 100, 2000);

        if (!handPick) {
            Alert.alert("Missing choice", "Please choose which hand you think will be faster.");
            return;
        }

        setActivity6Prediction(runId, {
            predictedReactionTimeMs: ms,
            predictedHandFaster: handPick,
        });

        refresh();

        Alert.alert("Saved ✅", "Prediction saved. You can start the reaction challenge now.");
    }

    function onContinue() {
        if (!draft || !view) return;

        // Ensure saved + valid
        const msParsed = parseMs(reactionMsText);
        const msOk = msParsed != null && msParsed >= 100 && msParsed <= 2000;
        if (!msOk || !handPick) {
            Alert.alert(
                "Complete prediction first",
                "Please enter a predicted reaction time (100–2000 ms) and choose which hand will be faster."
            );
            return;
        }

        // Persist before navigating
        const ms = clampInt(msParsed!, 100, 2000);
        setActivity6Prediction(runId, {
            predictedReactionTimeMs: ms,
            predictedHandFaster: handPick!,
        });

        navigation.navigate("A6ReactionTrial", {activityId, runId});
    }

    if (!draft || !view) {
        return (
            <View style={styles.center}>
                <Text style={{opacity: 0.7}}>Loading…</Text>
            </View>
        );
    }

    const participants = draft.session.participants ?? [];

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Prediction</Text>
                <Text style={styles.sub}>
                    Before you start the reaction trials, predict your reaction time and which hand will be faster.
                </Text>

                {/* Session info */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Session Settings</Text>

                    <View style={styles.row}>
                        <Text style={styles.rowLabel}>Trials per hand</Text>
                        <Text style={styles.rowValue}>{view.trialsPerHand}</Text>
                    </View>

                    <View style={styles.row}>
                        <Text style={styles.rowLabel}>Leaderboard accuracy threshold</Text>
                        <Text style={styles.rowValue}>≥ {view.threshold}%</Text>
                    </View>

                    <Text style={styles.help}>
                        You must complete dominant and non-dominant trials for each participant, then finish the tracing
                        challenge.
                    </Text>
                </View>

                {/* Participants reminder */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Participants</Text>
                    <Text style={styles.help}>
                        Rotate through each participant when running trials. You can rename participants in Session
                        Setup.
                    </Text>

                    <View style={{marginTop: 10, gap: 8}}>
                        {participants.map((p, idx) => (
                            <View key={p.id} style={styles.pill}>
                                <Text style={{fontWeight: "900"}}>{p.name ?? `Participant ${idx + 1}`}</Text>
                                <Text style={{opacity: 0.7}}>
                                    Dominant: {p.dominantHand ?? "—"}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Prediction inputs */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Your Predictions</Text>

                    <Text style={styles.label}>Predicted reaction time (ms)</Text>
                    <TextInput
                        value={reactionMsText}
                        onChangeText={setReactionMsText}
                        placeholder="e.g. 320"
                        keyboardType="number-pad"
                        style={styles.input}
                        maxLength={5}
                    />
                    <Text style={styles.tiny}>
                        Enter a number between 100 and 2000 ms. Typical human reaction time is ~200–400 ms.
                    </Text>

                    <Text style={[styles.label, {marginTop: 14}]}>Which hand will be faster?</Text>
                    <View style={styles.choiceRow}>
                        <ChoiceButton label="Dominant" selected={handPick === "Dominant"}
                                      onPress={() => setHandPick("Dominant")}/>
                        <ChoiceButton
                            label="Non-dominant"
                            selected={handPick === "Non-dominant"}
                            onPress={() => setHandPick("Non-dominant")}
                        />
                        <ChoiceButton label="Same" selected={handPick === "Same"} onPress={() => setHandPick("Same")}/>
                    </View>

                    {/* Validation hints */}
                    <View style={{marginTop: 12, gap: 8}}>
                        <ChecklistRow label="Reaction time entered (100–2000 ms)" ok={view.msOk}/>
                        <ChecklistRow label="Hand choice selected" ok={view.handOk}/>
                    </View>

                    <Pressable style={[styles.secondaryBtn, {marginTop: 14}]} onPress={onSave}>
                        <Text style={styles.secondaryBtnText}>Save Prediction</Text>
                    </Pressable>
                </View>

                {/* Continue */}
                <Pressable style={[styles.primaryBtn, !view.ready && {opacity: 0.6}]} onPress={onContinue}>
                    <Text style={styles.primaryBtnText}>Continue to Reaction Trials</Text>
                </Pressable>

                <View style={{height: 30}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

/* =========================================================
   Small components
========================================================= */

function ChoiceButton(props: { label: string; selected: boolean; onPress: () => void }) {
    return (
        <Pressable onPress={props.onPress} style={[styles.choiceBtn, props.selected && styles.choiceBtnOn]}>
            <Text style={[styles.choiceText, props.selected && styles.choiceTextOn]}>{props.label}</Text>
        </Pressable>
    );
}

function ChecklistRow(props: { label: string; ok: boolean }) {
    return (
        <View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between"}}>
            <Text style={{fontWeight: "800"}}>{props.label}</Text>
            <View style={[styles.tickPill, props.ok ? styles.tickYes : styles.tickNo]}>
                <Text style={styles.tickText}>{props.ok ? "OK" : "Missing"}</Text>
            </View>
        </View>
    );
}

/* =========================================================
   Styles
========================================================= */

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20, backgroundColor: "#fff"},
    center: {flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff"},

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
    help: {marginTop: 10, opacity: 0.7, lineHeight: 18},
    tiny: {marginTop: 8, opacity: 0.65, lineHeight: 18, fontSize: 12},

    row: {marginTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center"},
    rowLabel: {opacity: 0.75, fontWeight: "700"},
    rowValue: {fontWeight: "900"},

    pill: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },

    label: {marginTop: 12, fontWeight: "800"},
    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
    },

    choiceRow: {marginTop: 10, flexDirection: "row", gap: 10},
    choiceBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
    },
    choiceBtnOn: {backgroundColor: "#111", borderColor: "#111"},
    choiceText: {fontWeight: "900", opacity: 0.85},
    choiceTextOn: {color: "white", opacity: 1},

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

    tickPill: {borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10},
    tickYes: {backgroundColor: "#111"},
    tickNo: {backgroundColor: "#777"},
    tickText: {color: "white", fontWeight: "900"},
});