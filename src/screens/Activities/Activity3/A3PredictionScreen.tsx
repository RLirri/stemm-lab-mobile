// src/screens/Activities/Activity3/A3PredictionScreen.tsx
import React, {useEffect, useMemo, useState} from "react";
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {
    getActivity3RunDraft,
    setActivity3Prediction,
    type Activity3RunDraft,
    type FanDistanceCm,
} from "../../../store/activity3RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A3Prediction">;

export default function A3PredictionScreen({route, navigation}: Props) {
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);

    const [bestDesignIndex, setBestDesignIndex] = useState<number | null>(null);
    const [bestDistance, setBestDistance] = useState<FanDistanceCm | null>(null);
    const [notes, setNotes] = useState<string>("");

    useEffect(() => {
        const d = getActivity3RunDraft(runId);
        setDraft(d);

        if (!d?.prediction) return;

        if (typeof d.prediction.predictedBestDesignIndex === "number") {
            setBestDesignIndex(d.prediction.predictedBestDesignIndex);
        }
        if (typeof d.prediction.predictedBestDistanceCm === "number") {
            setBestDistance(d.prediction.predictedBestDistanceCm);
        }
        if (typeof d.prediction.predictedNotes === "string") {
            setNotes(d.prediction.predictedNotes);
        }
    }, [runId]);

    const designCount = draft?.session.fanDesignCount ?? 3;

    const canContinue = useMemo(() => {
        return bestDesignIndex != null && bestDistance != null;
    }, [bestDesignIndex, bestDistance]);

    if (!draft) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>Session not found</Text>
                <Text style={styles.sub}>Your run draft may have expired. Go back and start again.</Text>
            </View>
        );
    }

    function onContinue() {
        if (bestDesignIndex == null || bestDistance == null) {
            Alert.alert("Prediction required", "Please choose the predicted best design and distance before continuing.");
            return;
        }

        setActivity3Prediction(runId, {
            predictedBestDesignIndex: bestDesignIndex,
            predictedBestDistanceCm: bestDistance,
            predictedNotes: notes.trim() ? notes.trim() : undefined,
        });

        navigation.navigate("A3Measurements", {activityId, runId});
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Prediction</Text>
            <Text style={styles.sub}>Before measuring, predict which fan design performs best (required).</Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Predicted Best Design</Text>
                <View style={styles.segmentWrap}>
                    {Array.from({length: designCount}).map((_, i) => {
                        const on = bestDesignIndex === i;
                        return (
                            <Pressable
                                key={i}
                                onPress={() => setBestDesignIndex(i)}
                                style={[styles.segmentBtn, on && styles.segmentBtnActive]}
                            >
                                <Text style={[styles.segmentText, on && styles.segmentTextActive]}>Design {i + 1}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Predicted Best Distance</Text>
                <View style={styles.segmentWrap}>
                    {([15, 30, 45] as const).map((v) => {
                        const on = bestDistance === v;
                        return (
                            <Pressable
                                key={v}
                                onPress={() => setBestDistance(v)}
                                style={[styles.segmentBtn, on && styles.segmentBtnActive]}
                            >
                                <Text style={[styles.segmentText, on && styles.segmentTextActive]}>{v} cm</Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Notes (optional)</Text>
                <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Why do you think this will win?"
                    style={styles.input}
                    multiline
                />
            </View>

            <Pressable
                style={[styles.primaryBtn, !canContinue && {opacity: 0.5}]}
                onPress={onContinue}
                disabled={!canContinue}
            >
                <Text style={styles.primaryBtnText}>Continue to Measurements</Text>
            </Pressable>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20},
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

    segmentWrap: {marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8},
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
        marginTop: 10,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        minHeight: 80,
        textAlignVertical: "top",
    },

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},
});