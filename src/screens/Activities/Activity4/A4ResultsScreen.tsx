// src/screens/Activities/Activity4/A4ResultsScreen.tsx

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
    getActivity4RunDraft,
    type Activity4RunDraft,
} from "../../../store/activity4RunDraftStore";

import ActivityBarChart from "../../../components/charts/ActivityBarChart";
import ResultsInsightCard from "../../../components/insights/ResultsInsightCard";
import {
    buildA4Visualization,
    type A4VisualizationTrial,
} from "../../../services/resultInsights/activity4VisualizationService";

type Props = NativeStackScreenProps<AppStackParamList, "A4Results">;

type MeasuredRow = {
    designIndex: number;
    name: string;
    score: number | null;
    hasScore: boolean;
};

function safeNum(x: unknown, fallback = 0): number {
    return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function rankLabel(rank: number): string {
    return `#${rank}`;
}

function hasValidScore(row: MeasuredRow): row is MeasuredRow & { score: number } {
    return row.hasScore && typeof row.score === "number" && Number.isFinite(row.score);
}

export default function A4ResultsScreen({route, navigation}: Props): React.JSX.Element | null {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);

    useEffect(() => {
        if (!user) return;

        const d = getActivity4RunDraft(runId);

        if (!d) {
            Alert.alert("Session expired", "Please restart Activity 4.", [
                {
                    text: "OK",
                    onPress: () => navigation.replace("A4SessionSetup", {activityId}),
                },
            ]);
            return;
        }

        if (typeof d.prediction?.predictedBestDesignIndex !== "number") {
            Alert.alert("Prediction required", "Please complete prediction first.", [
                {
                    text: "Go to Prediction",
                    onPress: () =>
                        navigation.replace("A4Prediction", {activityId, runId}),
                },
            ]);
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const measuredRows = useMemo<MeasuredRow[]>(() => {
        if (!draft) return [];

        const rows: MeasuredRow[] = draft.session.designs.map((design, index) => {
            const measurement = draft.measurements.find(
                item => item.designIndex === index,
            );

            const score =
                typeof measurement?.movementScore === "number" &&
                Number.isFinite(measurement.movementScore)
                    ? measurement.movementScore
                    : null;

            return {
                designIndex: index,
                name: design.name ?? `Design ${index + 1}`,
                score,
                hasScore: typeof score === "number",
            };
        });

        rows.sort((a, b) => {
            if (a.score == null && b.score == null) {
                return a.designIndex - b.designIndex;
            }

            if (a.score == null) return 1;
            if (b.score == null) return -1;

            return a.score - b.score;
        });

        return rows;
    }, [draft]);

    const measuredCount = useMemo(() => {
        return measuredRows.filter(row => row.hasScore).length;
    }, [measuredRows]);

    const best = useMemo(() => {
        return measuredRows.find(row => row.hasScore) ?? null;
    }, [measuredRows]);

    const averageMovementScore = useMemo(() => {
        const scoredRows = measuredRows.filter(hasValidScore);

        if (scoredRows.length === 0) return null;

        const total = scoredRows.reduce((sum, row) => sum + row.score, 0);
        return total / scoredRows.length;
    }, [measuredRows]);

    const visualization = useMemo(() => {
        const trials: A4VisualizationTrial[] = measuredRows
            .filter(hasValidScore)
            .map(row => ({
                label: row.name,
                movementScore: row.score,
            }));

        return buildA4Visualization(trials);
    }, [measuredRows]);

    const predictionInfo = useMemo(() => {
        if (!draft) return null;

        const predicted = draft.prediction?.predictedBestDesignIndex;
        const predictedIndex = typeof predicted === "number" ? predicted : null;

        const predictedName =
            predictedIndex != null
                ? draft.session.designs[predictedIndex]?.name ??
                `Design ${predictedIndex + 1}`
                : "—";

        const bestIndex = best?.designIndex ?? null;

        const correct =
            predictedIndex != null && bestIndex != null
                ? predictedIndex === bestIndex
                : null;

        return {
            predictedIndex,
            predictedName,
            bestIndex,
            correct,
        };
    }, [best, draft]);

    function onBackToMeasurements() {
        navigation.navigate("A4Measurements", {activityId, runId});
    }

    function onContinueToComparison() {
        if (!draft) return;

        if (draft.session.designCount < 3) {
            Alert.alert("Setup issue", "Activity 4 requires at least 3 designs.");
            return;
        }

        if (measuredCount < draft.session.designCount) {
            Alert.alert(
                "Not complete",
                `You tested ${measuredCount}/${draft.session.designCount} designs.\nPlease test all designs before submitting.`,
            );
            return;
        }

        navigation.navigate("A4Comparison", {activityId, runId});
    }

    if (!user) return null;

    if (!draft || !predictionInfo) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={styles.loadingText}>Loading results…</Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Results Dashboard</Text>
            <Text style={styles.sub}>
                Lower movement score means the structure absorbed vibration better.
            </Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Overall Summary</Text>

                <View style={styles.rowBetween}>
                    <Text>Tested designs</Text>
                    <Text style={styles.bold}>
                        {measuredCount}/{draft.session.designCount}
                    </Text>
                </View>

                <View style={styles.rowBetween}>
                    <Text>Average movement score</Text>
                    <Text style={styles.bold}>
                        {averageMovementScore != null
                            ? averageMovementScore.toFixed(2)
                            : "—"}
                    </Text>
                </View>
            </View>

            <ActivityBarChart
                title="Structural Stability Chart"
                subtitle="Movement score comparison across structure designs"
                data={visualization.chartData}
                unitLabel="movement score"
            />

            <ResultsInsightCard insight={visualization.insight}/>

            <View style={[styles.card, styles.highlightCard]}>
                <Text style={styles.cardTitle}>Most Stable Design</Text>

                {best && hasValidScore(best) ? (
                    <>
                        <Text style={styles.bigText}>{best.name}</Text>
                        <Text style={styles.bigScore}>{best.score.toFixed(2)}</Text>
                        <Text style={styles.note}>
                            This is the lowest movement score, so it represents the
                            strongest earthquake-resistant performance.
                        </Text>
                    </>
                ) : (
                    <Text style={styles.muted}>
                        No measured designs yet. Go back and run tests.
                    </Text>
                )}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Prediction Evaluation</Text>

                <View style={styles.infoBlock}>
                    <Row label="Your prediction" value={predictionInfo.predictedName}/>
                    <Row label="Most stable design" value={best?.name ?? "—"}/>
                    <Row
                        label="Prediction result"
                        value={
                            predictionInfo.correct == null
                                ? "—"
                                : predictionInfo.correct
                                    ? "Correct"
                                    : "Not correct"
                        }
                    />
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Design Ranking</Text>
                <Text style={styles.help}>
                    Sorted by movement score. Lower score means better stability.
                </Text>

                <View style={styles.rankList}>
                    {measuredRows.map((row, index) => (
                        <View key={row.designIndex} style={styles.rankRow}>
                            <Text style={styles.rank}>{rankLabel(index + 1)}</Text>

                            <View style={styles.rankContent}>
                                <Text style={styles.rankName} numberOfLines={1}>
                                    {row.name}
                                </Text>
                                <Text style={styles.rankMeta}>
                                    {hasValidScore(row)
                                        ? `Movement score: ${row.score.toFixed(2)}`
                                        : "Not tested yet"}
                                </Text>
                            </View>

                            {row.hasScore ? (
                                <View style={styles.pillOk}>
                                    <Text style={styles.pillText}>Done</Text>
                                </View>
                            ) : (
                                <View style={styles.pillNo}>
                                    <Text style={styles.pillText}>Missing</Text>
                                </View>
                            )}
                        </View>
                    ))}
                </View>

                {measuredCount < draft.session.designCount ? (
                    <Text style={styles.warn}>
                        You still need to test{" "}
                        {draft.session.designCount - measuredCount} design(s).
                    </Text>
                ) : null}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Submission Readiness</Text>

                {measuredCount >= draft.session.designCount ? (
                    <Text style={styles.readyText}>Ready to continue</Text>
                ) : (
                    <Text style={styles.warn}>
                        Complete all structure tests before comparison.
                    </Text>
                )}

                <Text style={styles.note}>
                    Note: GPS and video evidence may be enforced during final
                    submission.
                </Text>
            </View>

            <View style={styles.actions}>
                <Pressable style={styles.secondaryBtn} onPress={onBackToMeasurements}>
                    <Text style={styles.secondaryBtnText}>Back to Measurements</Text>
                </Pressable>

                <Pressable style={styles.primaryBtn} onPress={onContinueToComparison}>
                    <Text style={styles.primaryBtnText}>Continue to Comparison</Text>
                </Pressable>
            </View>

            <View style={styles.bottomSpace}/>
        </ScrollView>
    );
}

function Row({label, value}: { label: string; value: string }): React.JSX.Element {
    return (
        <View style={styles.rowBetween}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
        </View>
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
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        marginTop: 10,
        opacity: 0.7,
        color: "#344054",
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
    rowBetween: {
        marginTop: 8,
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
    },
    rowLabel: {
        fontWeight: "900",
        opacity: 0.9,
        color: "#172033",
    },
    rowValue: {
        opacity: 0.85,
        flexShrink: 1,
        textAlign: "right",
        color: "#344054",
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
        fontSize: 30,
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
        opacity: 0.65,
        color: "#344054",
    },
    infoBlock: {
        marginTop: 10,
    },
    help: {
        marginTop: 6,
        opacity: 0.7,
        lineHeight: 18,
        color: "#344054",
    },
    rankList: {
        marginTop: 12,
        gap: 10,
    },
    rankRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 12,
    },
    rank: {
        width: 40,
        fontSize: 16,
        fontWeight: "900",
        color: "#172033",
    },
    rankContent: {
        flex: 1,
    },
    rankName: {
        fontSize: 15,
        fontWeight: "900",
        color: "#172033",
    },
    rankMeta: {
        marginTop: 4,
        opacity: 0.75,
        color: "#344054",
    },
    pillOk: {
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: "#111827",
    },
    pillNo: {
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: "#777777",
    },
    pillText: {
        color: "#FFFFFF",
        fontWeight: "900",
    },
    warn: {
        marginTop: 12,
        fontWeight: "900",
        opacity: 0.85,
        color: "#92400E",
    },
    readyText: {
        marginTop: 8,
        fontWeight: "900",
        color: "#172033",
    },
    actions: {
        marginTop: 14,
        gap: 10,
    },
    primaryBtn: {
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
    secondaryBtn: {
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#111827",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText: {
        fontWeight: "900",
        color: "#111827",
    },
    bottomSpace: {
        height: 40,
    },
});