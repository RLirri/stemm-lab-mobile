// src/screens/Activities/Activity3/A3ResultsScreen.tsx
import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    ActivityIndicator,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";
import {
    getActivity3RunDraft,
    type Activity3RunDraft,
} from "../../../store/activity3RunDraftStore";

import {
    computeSummary,
    getSubmissionGate,
    validateAllMeasurements,
    A3_DISTANCES,
    A3_MATERIALS,
} from "../../../services/activity3PhysicsService";

type Props = NativeStackScreenProps<AppStackParamList, "A3Results">;

export default function A3ResultsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);

    useEffect(() => {
        if (!user) return;

        const d = getActivity3RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Please restart Activity 3.", [
                {text: "OK", onPress: () => navigation.replace("A3SessionSetup", {activityId})},
            ]);
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    // Use physics service: validate -> summary
    const validatedDraft = useMemo(() => {
        if (!draft) return null;
        return validateAllMeasurements(draft);
    }, [draft]);

    const summary = useMemo(() => {
        if (!validatedDraft) return null;
        return computeSummary(validatedDraft);
    }, [validatedDraft]);

    const submissionGate = useMemo(() => {
        if (!validatedDraft) return null;
        return getSubmissionGate(validatedDraft);
    }, [validatedDraft]);

    // Build design averages list from validated measurements (valid-only)
    const designAverages = useMemo(() => {
        if (!validatedDraft) return [];
        const byDesign = new Map<number, { sum: number; count: number }>();

        for (const m of validatedDraft.measurements) {
            if (!m.isValid || m.bendAngleDeg == null) continue;
            const cur = byDesign.get(m.designIndex) ?? {sum: 0, count: 0};
            cur.sum += m.bendAngleDeg;
            cur.count += 1;
            byDesign.set(m.designIndex, cur);
        }

        const rows = Array.from(byDesign.entries()).map(([designIndex, v]) => ({
            designIndex,
            avg: v.count ? v.sum / v.count : 0,
            count: v.count,
        }));

        rows.sort((a, b) => b.avg - a.avg);
        return rows;
    }, [validatedDraft]);

    const leaderboardScore = useMemo(() => {
        if (!summary?.bestDesignAvgDeg) return 0;
        return Number(summary.bestDesignAvgDeg.toFixed(2));
    }, [summary]);

    function onContinueToReflection() {
        if (!validatedDraft || !submissionGate) return;

        // For moving to reflection/submit, enforce prediction + measurement completeness.
        // Video + GPS can be enforced later in submit service/screen if you want.
        const blocking: string[] = [];
        if (!submissionGate.hasPrediction) blocking.push("Prediction is missing.");
        if (submissionGate.validCount < Math.max(3, validatedDraft.session.fanDesignCount)) {
            blocking.push("Not enough valid measurements.");
        }

        // Also enforce at least one VALID measurement per design (scientific integrity)
        const perDesign = new Map<number, number>();
        for (const m of validatedDraft.measurements) {
            if (!m.isValid) continue;
            perDesign.set(m.designIndex, (perDesign.get(m.designIndex) ?? 0) + 1);
        }
        for (let i = 0; i < validatedDraft.session.fanDesignCount; i++) {
            if ((perDesign.get(i) ?? 0) < 1) blocking.push(`Design ${i + 1} needs at least 1 valid measurement.`);
        }

        if (blocking.length) {
            Alert.alert("Incomplete data", blocking.join("\n"));
            return;
        }

        navigation.navigate("A3ReflectionSubmit", {activityId, runId});
    }

    if (!user) return null;

    if (!validatedDraft || !summary) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
            </View>
        );
    }

    const predictedDesignLabel =
        typeof validatedDraft.prediction?.predictedBestDesignIndex === "number"
            ? `Design ${validatedDraft.prediction.predictedBestDesignIndex + 1}`
            : undefined;

    const predictedDistanceLabel =
        typeof validatedDraft.prediction?.predictedBestDistanceCm === "number"
            ? `${validatedDraft.prediction.predictedBestDistanceCm} cm`
            : undefined;

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Results Dashboard</Text>
            <Text style={styles.sub}>Leaderboard score = highest average bend angle (valid measurements only).</Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Overall Summary</Text>

                <View style={styles.rowBetween}>
                    <Text>Valid measurements</Text>
                    <Text style={styles.bold}>{summary.validCount}</Text>
                </View>

                <View style={styles.rowBetween}>
                    <Text>Average angle (overall)</Text>
                    <Text style={styles.bold}>{summary.avgAngleDeg.toFixed(2)}°</Text>
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Design Ranking (Valid Only)</Text>

                {designAverages.length === 0 ? (
                    <Text style={{opacity: 0.6}}>No valid measurements recorded.</Text>
                ) : (
                    designAverages.map((s) => (
                        <View key={s.designIndex} style={styles.rowBetween}>
                            <Text>Design {s.designIndex + 1}</Text>
                            <Text style={styles.bold}>
                                {s.avg.toFixed(1)}° ({s.count} valid)
                            </Text>
                        </View>
                    ))
                )}
            </View>

            {summary.bestDesignIndex != null && summary.bestDesignAvgDeg != null ? (
                <View style={[styles.card, styles.highlightCard]}>
                    <Text style={styles.cardTitle}>Best Performing Design</Text>
                    <Text style={styles.bigText}>Design {Number(summary.bestDesignIndex) + 1}</Text>
                    <Text style={styles.bigScore}>{leaderboardScore}° average</Text>
                    <Text style={styles.note}>This is used as the leaderboard score (FR-A3-06).</Text>
                </View>
            ) : null}

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Breakdown</Text>

                <Text style={styles.sectionLabel}>By distance</Text>
                {A3_DISTANCES.map((d) => (
                    <View key={d} style={styles.rowBetween}>
                        <Text>{d} cm</Text>
                        <Text style={styles.bold}>
                            {summary.byDistance[d] != null ? `${summary.byDistance[d]!.toFixed(2)}°` : "—"}
                        </Text>
                    </View>
                ))}

                <Text style={styles.sectionLabel}>By material</Text>
                {A3_MATERIALS.map((m) => (
                    <View key={m} style={styles.rowBetween}>
                        <Text style={{textTransform: "capitalize"}}>{m}</Text>
                        <Text style={styles.bold}>
                            {summary.byMaterial[m] != null ? `${summary.byMaterial[m]!.toFixed(2)}°` : "—"}
                        </Text>
                    </View>
                ))}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Prediction Evaluation</Text>

                <Text style={{marginTop: 8, opacity: 0.8}}>
                    Your prediction: {predictedDesignLabel ?? "—"} at {predictedDistanceLabel ?? "—"}
                </Text>

                {summary.wasPredictionCorrect != null ? (
                    <Text style={{marginTop: 10, fontWeight: "900"}}>
                        {summary.wasPredictionCorrect ? "✅ Your best-design prediction was correct!" : "❌ Your best-design prediction was not correct."}
                    </Text>
                ) : (
                    <Text style={{marginTop: 10, opacity: 0.7}}>Prediction not recorded.</Text>
                )}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Submission Readiness</Text>
                {submissionGate?.reasons?.length ? (
                    <>
                        <Text style={{marginTop: 8, fontWeight: "900"}}>Missing:</Text>
                        {submissionGate.reasons.map((r, i) => (
                            <Text key={i} style={{marginTop: 6, opacity: 0.85}}>
                                • {r}
                            </Text>
                        ))}
                    </>
                ) : (
                    <Text style={{marginTop: 8, fontWeight: "900"}}>✅ Ready to submit data</Text>
                )}
                <Text style={styles.note}>
                    Note: GPS/video may be enforced during final submission (FR-A3-07).
                </Text>
            </View>

            <Pressable style={styles.primaryBtn} onPress={onContinueToReflection}>
                <Text style={styles.primaryBtnText}>Continue to Reflection & Submit</Text>
            </Pressable>

            <View style={{height: 30}}/>
        </ScrollView>
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
    highlightCard: {borderColor: "#111"},

    cardTitle: {fontSize: 16, fontWeight: "900"},
    sectionLabel: {marginTop: 12, fontWeight: "900", opacity: 0.9},

    rowBetween: {
        marginTop: 8,
        flexDirection: "row",
        justifyContent: "space-between",
    },

    bold: {fontWeight: "900"},

    bigText: {marginTop: 10, fontSize: 20, fontWeight: "900"},
    bigScore: {marginTop: 8, fontSize: 28, fontWeight: "900"},

    note: {marginTop: 8, opacity: 0.7, lineHeight: 18},

    primaryBtn: {
        marginTop: 16,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},
});