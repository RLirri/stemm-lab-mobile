// src/screens/Activities/Activity7/A7PredictionScreen.tsx

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
    getActivity7RunDraft,
    setActivity7Prediction,
    validateA7Prediction,
    type Activity7RunDraft,
    type A7MeasurementPhase,
} from "../../../store/activity7RunDraftStore";

/* =========================================================
   Helpers
========================================================= */

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function digitsOnly(s: string) {
    return s.replace(/[^\d]/g, "");
}

function parseBpm(input: string): number | null {
    const cleaned = digitsOnly(input);
    if (!cleaned) return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return n;
}

type HighestPhasePick = A7MeasurementPhase;

type Props = NativeStackScreenProps<AppStackParamList, "A7Prediction">;

/* =========================================================
   Small components
========================================================= */

function ChoiceButton(props: {
    label: string;
    selected: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={props.onPress}
            style={[styles.choiceBtn, props.selected && styles.choiceBtnOn]}
        >
            <Text style={[styles.choiceText, props.selected && styles.choiceTextOn]}>
                {props.label}
            </Text>
        </Pressable>
    );
}

function ChecklistRow(props: { label: string; ok: boolean }) {
    return (
        <View style={styles.checkRow}>
            <Text style={styles.checkLabel}>{props.label}</Text>
            <View style={[styles.tickPill, props.ok ? styles.tickYes : styles.tickNo]}>
                <Text style={styles.tickText}>{props.ok ? "OK" : "Missing"}</Text>
            </View>
        </View>
    );
}

/* =========================================================
   Screen
========================================================= */

export default function A7PredictionScreen({route, navigation}: Props) {
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity7RunDraft | null>(null);

    const [restBpmText, setRestBpmText] = useState<string>("");
    const [afterExerciseBpmText, setAfterExerciseBpmText] = useState<string>("");
    const [highestPhasePick, setHighestPhasePick] = useState<HighestPhasePick | null>(null);

    const refresh = useCallback(() => {
        const d = getActivity7RunDraft(runId);
        setDraft(d);

        if (d?.prediction) {
            const rest = d.prediction.predictedRestBpm;
            const after = d.prediction.predictedAfterExerciseBpm;

            setRestBpmText(isFiniteNumber(rest) ? String(Math.round(rest)) : "");
            setAfterExerciseBpmText(isFiniteNumber(after) ? String(Math.round(after)) : "");
            setHighestPhasePick(d.prediction.expectedHighestPhase ?? null);
        }
    }, [runId]);

    useEffect(() => {
        const d = getActivity7RunDraft(runId);
        if (!d) {
            Alert.alert(
                "Session expired",
                "Your Activity 7 session draft was not found. Please start again.",
                [{text: "OK", onPress: () => navigation.replace("A7SessionSetup", {activityId})}]
            );
            return;
        }

        setDraft(d);

        const rest = d.prediction?.predictedRestBpm;
        const after = d.prediction?.predictedAfterExerciseBpm;

        setRestBpmText(isFiniteNumber(rest) ? String(Math.round(rest)) : "");
        setAfterExerciseBpmText(isFiniteNumber(after) ? String(Math.round(after)) : "");
        setHighestPhasePick(d.prediction?.expectedHighestPhase ?? null);
    }, [activityId, navigation, runId]);

    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh])
    );

    const view = useMemo(() => {
        if (!draft) return null;

        const restParsed = parseBpm(restBpmText);
        const afterParsed = parseBpm(afterExerciseBpmText);

        const restOk = restParsed != null && restParsed >= 1 && restParsed <= 80;
        const afterOk = afterParsed != null && afterParsed >= 1 && afterParsed <= 120;
        const highestPhaseOptional = true;

        return {
            participantCount: draft.session.participantCount ?? 1,
            measurementDurationSec: clampInt(draft.session.measurementDurationSec ?? 30, 10, 120),
            targetSamplingHz: draft.session.targetSamplingHz ?? 25,

            restParsed,
            afterParsed,

            restOk,
            afterOk,
            highestPhaseOptional,

            ready: restOk && afterOk,
        };
    }, [draft, restBpmText, afterExerciseBpmText]);

    function persistPrediction() {
        if (!draft) return null;

        const restParsed = parseBpm(restBpmText);
        const afterParsed = parseBpm(afterExerciseBpmText);

        const next = setActivity7Prediction(runId, {
            predictedRestBpm: restParsed != null ? clampInt(restParsed, 1, 80) : undefined,
            predictedAfterExerciseBpm:
                afterParsed != null ? clampInt(afterParsed, 1, 120) : undefined,
            expectedHighestPhase: highestPhasePick ?? undefined,
        });

        setDraft(next);
        return next;
    }

    function onSave() {
        if (!draft || !view) return;

        if (!view.restOk) {
            Alert.alert(
                "Missing prediction",
                "Please enter your predicted breathing rate at rest (1–80 breaths/min)."
            );
            return;
        }

        if (!view.afterOk) {
            Alert.alert(
                "Missing prediction",
                "Please enter your predicted breathing rate after exercise (1–120 breaths/min)."
            );
            return;
        }

        const next = persistPrediction();
        if (!next) return;

        const err = validateA7Prediction(next);
        if (err) {
            Alert.alert("Prediction required", err);
            return;
        }

        Alert.alert("Saved ✅", "Prediction saved. You can start the breathing measurements now.");
    }

    function onContinue() {
        if (!draft || !view) return;

        if (!view.restOk || !view.afterOk) {
            Alert.alert(
                "Complete prediction first",
                "Please enter predicted breathing rate at rest and after exercise before continuing."
            );
            return;
        }

        const next = persistPrediction();
        if (!next) return;

        const err = validateA7Prediction(next);
        if (err) {
            Alert.alert("Prediction required", err);
            return;
        }

        navigation.navigate("A7Measurements", {activityId, runId});
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
                    Before starting the breathing measurements, predict breathing rate at rest and
                    after exercise.
                </Text>

                {/* Session info */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Session Settings</Text>

                    <View style={styles.row}>
                        <Text style={styles.rowLabel}>Participants</Text>
                        <Text style={styles.rowValue}>{view.participantCount}</Text>
                    </View>

                    <View style={styles.row}>
                        <Text style={styles.rowLabel}>Measurement duration</Text>
                        <Text style={styles.rowValue}>{view.measurementDurationSec}s</Text>
                    </View>

                    <View style={styles.row}>
                        <Text style={styles.rowLabel}>Target sampling rate</Text>
                        <Text style={styles.rowValue}>{Math.round(view.targetSamplingHz)} Hz</Text>
                    </View>

                    <Text style={styles.help}>
                        Each participant must complete all three phases: Rest, Post-Exercise Measurement 1,
                        and Post-Exercise Measurement 2.
                    </Text>
                </View>

                {/* Participants reminder */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Participants</Text>
                    <Text style={styles.help}>
                        Rotate through each participant during the measurement flow. You can rename
                        participants in Session Setup.
                    </Text>

                    <View style={{marginTop: 10, gap: 8}}>
                        {participants.map((p, idx) => (
                            <View key={p.id} style={styles.pill}>
                                <Text style={{fontWeight: "900"}}>{p.name ?? `Participant ${idx + 1}`}</Text>
                                <Text style={{opacity: 0.7}}>Required phases: 3</Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Prediction inputs */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Your Predictions</Text>

                    <Text style={styles.label}>Predicted breathing rate at rest (breaths/min)</Text>
                    <TextInput
                        value={restBpmText}
                        onChangeText={setRestBpmText}
                        placeholder="e.g. 12"
                        keyboardType="number-pad"
                        style={styles.input}
                        maxLength={3}
                    />
                    <Text style={styles.tiny}>
                        Enter a number between 1 and 80. Example resting breathing rate: around 10–20 BPM.
                    </Text>

                    <Text style={[styles.label, {marginTop: 14}]}>
                        Predicted breathing rate after exercise (breaths/min)
                    </Text>
                    <TextInput
                        value={afterExerciseBpmText}
                        onChangeText={setAfterExerciseBpmText}
                        placeholder="e.g. 24"
                        keyboardType="number-pad"
                        style={styles.input}
                        maxLength={3}
                    />
                    <Text style={styles.tiny}>
                        Enter a number between 1 and 120. This prediction will be compared against both
                        post-exercise phases.
                    </Text>

                    <Text style={[styles.label, {marginTop: 14}]}>
                        Which phase do you think will have the highest breathing rate? (optional)
                    </Text>
                    <View style={styles.choiceRow}>
                        <ChoiceButton
                            label="Rest"
                            selected={highestPhasePick === "rest"}
                            onPress={() => setHighestPhasePick("rest")}
                        />
                        <ChoiceButton
                            label="Post-Jog"
                            selected={highestPhasePick === "post_jog_1min"}
                            onPress={() => setHighestPhasePick("post_jog_1min")}
                        />
                        <ChoiceButton
                            label="Post-Star-Jumps"
                            selected={highestPhasePick === "post_star_jumps_100"}
                            onPress={() => setHighestPhasePick("post_star_jumps_100")}
                        />
                    </View>

                    <View style={{marginTop: 12, gap: 8}}>
                        <ChecklistRow label="Rest breathing prediction entered (1–80 BPM)" ok={view.restOk}/>
                        <ChecklistRow
                            label="After-exercise prediction entered (1–120 BPM)"
                            ok={view.afterOk}
                        />
                        <ChecklistRow
                            label="Highest-phase prediction selected (optional)"
                            ok={view.highestPhaseOptional}
                        />
                    </View>

                    <Pressable style={[styles.secondaryBtn, {marginTop: 14}]} onPress={onSave}>
                        <Text style={styles.secondaryBtnText}>Save Prediction</Text>
                    </Pressable>
                </View>

                {/* Continue */}
                <Pressable style={[styles.primaryBtn, !view.ready && {opacity: 0.6}]} onPress={onContinue}>
                    <Text style={styles.primaryBtnText}>Continue to Measurements</Text>
                </Pressable>

                <View style={{height: 30}}/>
            </ScrollView>
        </KeyboardAvoidingView>
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

    row: {
        marginTop: 10,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
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

    choiceRow: {marginTop: 10, gap: 10},
    choiceBtn: {
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

    checkRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    checkLabel: {fontWeight: "800", flex: 1, paddingRight: 10},

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