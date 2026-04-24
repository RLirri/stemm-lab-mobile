// src/screens/Activities/Activity3/A3ResultsScreen.tsx

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
import {auth} from "../../../services/firebase";
import {
    getActivity3RunDraft,
    type Activity3RunDraft,
} from "../../../store/activity3RunDraftStore";

import {
    A3_DISTANCES,
    A3_MATERIALS,
    computeSummary,
    getSubmissionGate,
    validateAllMeasurements,
} from "../../../services/activity3PhysicsService";

import ActivityBarChart from "../../../components/charts/ActivityBarChart";
import ResultsInsightCard from "../../../components/insights/ResultsInsightCard";
import {
    buildA3Visualization,
    type A3VisualizationTrial,
} from "../../../services/resultInsights/activity3VisualizationService";

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
                {
                    text: "OK",
                    onPress: () =>
                        navigation.replace("A3SessionSetup", {activityId}),
                },
            ]);
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

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

    const designAverages = useMemo(() => {
        if (!validatedDraft) return [];

        const byDesign = new Map<number, { sum: number; count: number }>();

        for (const m of validatedDraft.measurements) {
            if (!m.isValid || m.bendAngleDeg == null) continue;

            const current = byDesign.get(m.designIndex) ?? {sum: 0, count: 0};
            current.sum += m.bendAngleDeg;
            current.count += 1;
            byDesign.set(m.designIndex, current);
        }

        const rows = Array.from(byDesign.entries()).map(([designIndex, value]) => ({
            designIndex,
            avg: value.count > 0 ? value.sum / value.count : 0,
            count: value.count,
        }));

        rows.sort((a, b) => b.avg - a.avg);

        return rows;
    }, [validatedDraft]);

    const visualization = useMemo(() => {
        const trials: A3VisualizationTrial[] = designAverages.map(item => ({
            label: `Design ${item.designIndex + 1}`,
            averageBendAngleDeg: item.avg,
        }));

        return buildA3Visualization(trials);
    }, [designAverages]);

    const leaderboardScore = useMemo(() => {
        if (!summary?.bestDesignAvgDeg) return 0;
        return Number(summary.bestDesignAvgDeg.toFixed(2));
    }, [summary]);

    function onContinueToReflection() {
        if (!validatedDraft || !submissionGate) return;

        const blocking: string[] = [];

        if (!submissionGate.hasPrediction) {
            blocking.push("Prediction is missing.");
        }

        if (
            submissionGate.validCount <
            Math.max(3, validatedDraft.session.fanDesignCount)
        ) {
            blocking.push("Not enough valid measurements.");
        }

        const perDesign = new Map<number, number>();

        for (const m of validatedDraft.measurements) {
            if (!m.isValid) continue;
            perDesign.set(m.designIndex, (perDesign.get(m.designIndex) ?? 0) + 1);
        }

        for (let i = 0; i < validatedDraft.session.fanDesignCount; i += 1) {
            if ((perDesign.get(i) ?? 0) < 1) {
                blocking.push(`Design ${i + 1} needs at least 1 valid measurement.`);
            }
        }

        if (blocking.length > 0) {
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
            <Text style={styles.sub}>
                Leaderboard score = highest average bend angle from valid measurements
                only.
            </Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Overall Summary</Text>

                <View style={styles.rowBetween}>
                    <Text>Valid measurements</Text>
                    <Text style={styles.bold}>{summary.validCount}</Text>
                </View>

                <View style={styles.rowBetween}>
                    <Text>Average angle overall</Text>
                    <Text style={styles.bold}>{summary.avgAngleDeg.toFixed(2)}°</Text>
                </View>
            </View>

            <ActivityBarChart
                title="Design Performance Chart"
                subtitle="Average bend angle for each fan design"
                data={visualization.chartData}
                unitLabel="degrees"
            />

            <ResultsInsightCard insight={visualization.insight}/>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Design Ranking</Text>

                {designAverages.length === 0 ? (
                    <Text style={styles.muted}>No valid measurements recorded.</Text>
                ) : (
                    designAverages.map(item => (
                        <View key={item.designIndex} style={styles.rowBetween}>
                            <Text>Design {item.designIndex + 1}</Text>
                            <Text style={styles.bold}>
                                {item.avg.toFixed(1)}° ({item.count} valid)
                            </Text>
                        </View>
                    ))
                )}
            </View>

            {summary.bestDesignIndex != null && summary.bestDesignAvgDeg != null ? (
                <View style={[styles.card, styles.highlightCard]}>
                    <Text style={styles.cardTitle}>Best Performing Design</Text>
                    <Text style={styles.bigText}>
                        Design {Number(summary.bestDesignIndex) + 1}
                    </Text>
                    <Text style={styles.bigScore}>{leaderboardScore}° average</Text>
                    <Text style={styles.note}>
                        This value is used as the leaderboard score.
                    </Text>
                </View>
            ) : null}

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Breakdown</Text>

                <Text style={styles.sectionLabel}>By distance</Text>
                {A3_DISTANCES.map(distance => (
                    <View key={distance} style={styles.rowBetween}>
                        <Text>{distance} cm</Text>
                        <Text style={styles.bold}>
                            {summary.byDistance[distance] != null
                                ? `${summary.byDistance[distance]!.toFixed(2)}°`
                                : "—"}
                        </Text>
                    </View>
                ))}

                <Text style={styles.sectionLabel}>By material</Text>
                {A3_MATERIALS.map(material => (
                    <View key={material} style={styles.rowBetween}>
                        <Text style={styles.capitalize}>{material}</Text>
                        <Text style={styles.bold}>
                            {summary.byMaterial[material] != null
                                ? `${summary.byMaterial[material]!.toFixed(2)}°`
                                : "—"}
                        </Text>
                    </View>
                ))}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Prediction Evaluation</Text>

                <Text style={styles.predictionText}>
                    Your prediction: {predictedDesignLabel ?? "—"} at{" "}
                    {predictedDistanceLabel ?? "—"}
                </Text>

                {summary.wasPredictionCorrect != null ? (
                    <Text style={styles.predictionResult}>
                        {summary.wasPredictionCorrect
                            ? "Your best-design prediction was correct."
                            : "Your best-design prediction was not correct."}
                    </Text>
                ) : (
                    <Text style={styles.muted}>Prediction not recorded.</Text>
                )}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Submission Readiness</Text>

                {submissionGate?.reasons?.length ? (
                    <>
                        <Text style={styles.missingTitle}>Missing:</Text>
                        {submissionGate.reasons.map((reason, index) => (
                            <Text key={`${reason}-${index}`} style={styles.reasonText}>
                                • {reason}
                            </Text>
                        ))}
                    </>
                ) : (
                    <Text style={styles.readyText}>Ready to submit data</Text>
                )}

                <Text style={styles.note}>
                    Note: GPS and video evidence may be enforced during final submission.
                </Text>
            </View>

            <Pressable style={styles.primaryBtn} onPress={onContinueToReflection}>
                <Text style={styles.primaryBtnText}>
                    Continue to Reflection & Submit
                </Text>
            </Pressable>

            <View style={styles.bottomSpace}/>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        padding: 20,
        backgroundColor: "#FFFFFF",
    },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    title: {
        fontSize: 26,
        fontWeight: "900",
        marginTop: 6,
        color: "#172033",
    },
    sub: {
        marginTop: 8,
        opacity: 0.75,
        lineHeight: 18,
        color: "#344054",
    },
    card: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#FAFAFA",
        borderRadius: 14,
        padding: 14,
    },
    highlightCard: {
        borderColor: "#111827",
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: "900",
        color: "#172033",
    },
    sectionLabel: {
        marginTop: 12,
        fontWeight: "900",
        opacity: 0.9,
        color: "#172033",
    },
    rowBetween: {
        marginTop: 8,
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
    },
    bold: {
        fontWeight: "900",
        color: "#172033",
    },
    bigText: {
        marginTop: 10,
        fontSize: 20,
        fontWeight: "900",
        color: "#172033",
    },
    bigScore: {
        marginTop: 8,
        fontSize: 28,
        fontWeight: "900",
        color: "#172033",
    },
    note: {
        marginTop: 8,
        opacity: 0.7,
        lineHeight: 18,
        color: "#344054",
    },
    muted: {
        marginTop: 8,
        opacity: 0.6,
        color: "#344054",
    },
    capitalize: {
        textTransform: "capitalize",
    },
    predictionText: {
        marginTop: 8,
        opacity: 0.8,
        color: "#344054",
    },
    predictionResult: {
        marginTop: 10,
        fontWeight: "900",
        color: "#172033",
    },
    missingTitle: {
        marginTop: 8,
        fontWeight: "900",
        color: "#172033",
    },
    reasonText: {
        marginTop: 6,
        opacity: 0.85,
        color: "#344054",
    },
    readyText: {
        marginTop: 8,
        fontWeight: "900",
        color: "#172033",
    },
    primaryBtn: {
        marginTop: 16,
        backgroundColor: "#111827",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {
        color: "#FFFFFF",
        fontWeight: "900",
        fontSize: 16,
    },
    bottomSpace: {
        height: 30,
    },
});