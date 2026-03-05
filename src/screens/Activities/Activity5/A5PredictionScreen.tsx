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
    createActivity5RunDraft,
    getActivity5RunDraft,
    setActivity5Prediction,
    validateA5Prediction,
    type Activity5RunDraft,
    type A5MovementSpec,
} from "../../../store/activity5RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A5Prediction">;

/* =========================================================
   Helpers
========================================================= */

function trimOrUndef(s?: string) {
    const t = s?.trim();
    return t ? t : undefined;
}

/**
 * Simple chip-like selector item (string-only to avoid TS2322)
 */
function MovementChip(props: {
    label: string;
    selected: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable
            onPress={props.onPress}
            style={[styles.chip, props.selected && styles.chipSelected]}
        >
            <Text style={[styles.chipText, props.selected && styles.chipTextSelected]}>
                {props.label}
            </Text>
        </Pressable>
    );
}

/* =========================================================
   Screen
========================================================= */

export default function A5PredictionScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity5RunDraft | null>(null);

    // UI buffers
    const [predictedVibrationLevel, setPredictedVibrationLevel] = useState<string>("");
    const [predictedMostDifficultMovement, setPredictedMostDifficultMovement] = useState<string>("");

    /* ----------------------------
       Hydrate / Create draft
    ---------------------------- */

    useEffect(() => {
        if (!user) return;

        let d = runId ? getActivity5RunDraft(runId) : null;
        if (!d) {
            // Safety: if user deep-links here without setup
            d = createActivity5RunDraft({
                activityId,
                createdBy: user.uid,
                participantCount: 1,
                samplingHz: 50,
                movementDurationSec: 20,
                gpsEnabled: true,
                feedbackEnabled: true,
            });
        }
        setDraft(d);
    }, [activityId, runId, user]);

    /* ----------------------------
       Draft -> UI sync
    ---------------------------- */

    useEffect(() => {
        if (!draft) return;

        setPredictedVibrationLevel(draft.prediction?.predictedVibrationLevel ?? "");
        setPredictedMostDifficultMovement(draft.prediction?.predictedMostDifficultMovement ?? "");
    }, [draft]);

    const movements: A5MovementSpec[] = useMemo(() => {
        return draft?.session.movements ?? [];
    }, [draft]);

    /* ----------------------------
       Validation
    ---------------------------- */

    const predictionError = useMemo(() => {
        if (!draft) return null;

        const shadow: Activity5RunDraft = {
            ...draft,
            prediction: {
                predictedVibrationLevel: trimOrUndef(predictedVibrationLevel),
                predictedMostDifficultMovement: trimOrUndef(predictedMostDifficultMovement),
                createdAt: draft.prediction?.createdAt ?? Date.now(),
                updatedAt: Date.now(),
            },
        };

        return validateA5Prediction(shadow);
    }, [draft, predictedMostDifficultMovement, predictedVibrationLevel]);

    function persistPrediction(): Activity5RunDraft | null {
        if (!draft) return null;

        const next = setActivity5Prediction(draft.runId, {
            predictedVibrationLevel: trimOrUndef(predictedVibrationLevel),
            predictedMostDifficultMovement: trimOrUndef(predictedMostDifficultMovement),
        });

        setDraft(next);
        return next;
    }

    function onContinue() {
        if (!draft) return;

        const err = predictionError;
        if (err) {
            Alert.alert("Prediction required", err);
            return;
        }

        const next = persistPrediction();
        if (!next) return;

        navigation.navigate("A5GuidedTrials", {
            activityId,
            runId: next.runId,
        });
    }

    /* ----------------------------
       Render guards
    ---------------------------- */

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
                    Before starting trials, predict your expected vibration level and which movement will be hardest to
                    keep smooth.
                </Text>

                {/* Predicted vibration level */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Predicted Vibration Level</Text>
                    <Text style={styles.help}>
                        Enter a simple estimate (e.g., “low”, “medium”, “high” or “~5 mm”). This is your hypothesis
                        before measuring.
                    </Text>

                    <Text style={styles.label}>Your prediction</Text>
                    <TextInput
                        value={predictedVibrationLevel}
                        onChangeText={setPredictedVibrationLevel}
                        placeholder='e.g. "medium" or "~5 mm"'
                        style={styles.input}
                    />
                </View>

                {/* Predicted hardest movement */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Predicted Most Difficult Movement</Text>
                    <Text style={styles.help}>
                        Choose the movement you think will be hardest to keep the vibration low.
                    </Text>

                    <View style={styles.chipWrap}>
                        {movements.map((m) => {
                            const selected = predictedMostDifficultMovement === m.type;
                            return (
                                <MovementChip
                                    key={m.type}
                                    label={m.title}
                                    selected={selected}
                                    onPress={() => setPredictedMostDifficultMovement(m.type)}
                                />
                            );
                        })}
                    </View>

                    <Text style={styles.note}>
                        Selected:{" "}
                        {predictedMostDifficultMovement
                            ? movements.find((m) => m.type === predictedMostDifficultMovement)?.title ??
                            predictedMostDifficultMovement
                            : "None"}
                    </Text>
                </View>

                <Pressable style={styles.primaryBtn} onPress={onContinue}>
                    <Text style={styles.primaryBtnText}>Start Guided Trials</Text>
                </Pressable>

                {predictionError ? (
                    <Text style={styles.errorText}>⚠️ {predictionError}</Text>
                ) : null}

                <View style={{height: 40}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

/* =========================================================
   Styles (match your A4 style)
========================================================= */

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        padding: 20,
        backgroundColor: "#fff",
    },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
    },

    title: {fontSize: 24, fontWeight: "900"},
    sub: {marginTop: 8, opacity: 0.7, lineHeight: 20},

    card: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {fontSize: 16, fontWeight: "900", marginBottom: 8},
    help: {opacity: 0.75, lineHeight: 18},

    label: {marginTop: 10, fontWeight: "800"},
    input: {
        marginTop: 6,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    note: {marginTop: 10, opacity: 0.65, lineHeight: 18},

    chipWrap: {
        marginTop: 10,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
    },
    chip: {
        borderWidth: 1,
        borderColor: "#ddd",
        backgroundColor: "white",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        maxWidth: "100%",
    },
    chipSelected: {
        borderColor: "#111",
        backgroundColor: "#111",
    },
    chipText: {
        fontWeight: "900",
        opacity: 0.85,
    },
    chipTextSelected: {
        color: "white",
        opacity: 1,
    },

    primaryBtn: {
        marginTop: 20,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    errorText: {marginTop: 12, color: "#b00020", fontWeight: "800"},
});