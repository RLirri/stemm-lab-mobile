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
    getActivity4RunDraft,
    type Activity4RunDraft,
} from "../../../store/activity4RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A4Results">;

function safeNum(x: unknown, fallback = 0) {
    return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function medal(rank: number) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}`;
}

export default function A4ResultsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);

    useEffect(() => {
        if (!user) return;

        const d = getActivity4RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Please restart Activity 4.", [
                {text: "OK", onPress: () => navigation.replace("A4SessionSetup", {activityId})},
            ]);
            return;
        }

        // Prediction gating (robust)
        if (typeof d.prediction?.predictedBestDesignIndex !== "number") {
            Alert.alert("Prediction required", "Please complete prediction first.", [
                {text: "Go to Prediction", onPress: () => navigation.replace("A4Prediction", {activityId, runId})},
            ]);
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const measuredRows = useMemo(() => {
        if (!draft) return [];

        // Build row per design (even if missing)
        const rows = draft.session.designs.map((design, idx) => {
            const m = draft.measurements.find((x) => x.designIndex === idx);
            const score =
                typeof m?.movementScore === "number" && Number.isFinite(m.movementScore)
                    ? m.movementScore
                    : null;

            return {
                designIndex: idx,
                name: design.name ?? `Design ${idx + 1}`,
                score,
                hasScore: typeof score === "number",
            };
        });

        // Sort: measured first (lowest score best), then unmeasured at bottom
        rows.sort((a, b) => {
            if (a.score == null && b.score == null) return a.designIndex - b.designIndex;
            if (a.score == null) return 1;
            if (b.score == null) return -1;
            return a.score - b.score;
        });

        return rows;
    }, [draft]);

    const measuredCount = useMemo(() => {
        return measuredRows.filter((r) => r.hasScore).length;
    }, [measuredRows]);

    const best = useMemo(() => {
        const firstMeasured = measuredRows.find((r) => r.hasScore);
        return firstMeasured ?? null;
    }, [measuredRows]);

    const predictionInfo = useMemo(() => {
        if (!draft) return null;

        const predicted = draft.prediction?.predictedBestDesignIndex;
        const predIdx = typeof predicted === "number" ? predicted : null;

        const predictedName =
            predIdx != null ? draft.session.designs[predIdx]?.name ?? `Design ${predIdx + 1}` : "—";

        const bestIdx = best?.designIndex ?? null;

        const correct =
            predIdx != null && bestIdx != null ? predIdx === bestIdx : null;

        return {
            predIdx,
            predictedName,
            bestIdx,
            correct,
        };
    }, [best, draft]);

    function onBackToMeasurements() {
        navigation.navigate("A4Measurements", {activityId, runId});
    }

    function onContinueToComparison() {
        if (!draft) return;

        // FR-A4-04: comparison across at least 3 designs
        if (draft.session.designCount < 3) {
            Alert.alert("Setup issue", "Activity 4 requires at least 3 designs.");
            return;
        }

        if (measuredCount < draft.session.designCount) {
            Alert.alert(
                "Not complete",
                `You tested ${measuredCount}/${draft.session.designCount} designs.\nPlease test all designs before submitting.`
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
                <Text style={{marginTop: 10, opacity: 0.7}}>Loading results…</Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Results</Text>
            <Text style={styles.sub}>
                Lower movement score means your structure absorbed vibration better.
            </Text>

            {/* Best design card */}
            <View style={styles.bestCard}>
                <Text style={styles.bestTitle}>Best Design</Text>
                {best?.hasScore ? (
                    <>
                        <Text style={styles.bestName}>
                            {best.name}
                        </Text>
                        <Text style={styles.bestScore}>
                            Score: {safeNum(best.score, 0)}
                        </Text>
                    </>
                ) : (
                    <Text style={{marginTop: 10, opacity: 0.75}}>
                        No measured designs yet. Go back and run tests.
                    </Text>
                )}
            </View>

            {/* Prediction vs outcome */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Prediction Check</Text>

                <View style={{marginTop: 10, gap: 10}}>
                    <Row label="Your prediction" value={predictionInfo.predictedName}/>
                    <Row label="Winner" value={best?.name ?? "—"}/>
                    <Row
                        label="Were you right?"
                        value={
                            predictionInfo.correct == null
                                ? "—"
                                : predictionInfo.correct
                                    ? "Yes ✅"
                                    : "No ❌"
                        }
                    />
                </View>
            </View>

            {/* Rankings */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Rankings</Text>
                <Text style={styles.help}>
                    Sorted by movement score (lowest = best).
                </Text>

                <View style={{marginTop: 12, gap: 10}}>
                    {measuredRows.map((r, i) => (
                        <View key={r.designIndex} style={styles.rankRow}>
                            <Text style={styles.rank}>{medal(i + 1)}</Text>

                            <View style={{flex: 1}}>
                                <Text style={styles.rankName} numberOfLines={1}>
                                    {r.name}
                                </Text>
                                <Text style={styles.rankMeta}>
                                    {r.hasScore ? `Score: ${safeNum(r.score, 0)}` : "Not tested yet"}
                                </Text>
                            </View>

                            {r.hasScore ? (
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
                        You still need to test {draft.session.designCount - measuredCount} design(s).
                    </Text>
                ) : null}
            </View>

            {/* Actions */}
            <View style={{marginTop: 14, gap: 10}}>
                <Pressable style={styles.secondaryBtn} onPress={onBackToMeasurements}>
                    <Text style={styles.secondaryBtnText}>Back to Measurements</Text>
                </Pressable>

                <Pressable style={styles.primaryBtn} onPress={onContinueToComparison}>
                    <Text style={styles.primaryBtnText}>Continue to Comparison</Text>
                </Pressable>
            </View>

            <View style={{height: 40}}/>
        </ScrollView>
    );
}

function Row({label, value}: { label: string; value: string }) {
    return (
        <View style={{flexDirection: "row", justifyContent: "space-between", gap: 10}}>
            <Text style={{fontWeight: "900", opacity: 0.9}}>{label}</Text>
            <Text style={{opacity: 0.85, flexShrink: 1, textAlign: "right"}}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20},
    center: {flex: 1, justifyContent: "center", alignItems: "center"},

    title: {fontSize: 26, fontWeight: "900", marginTop: 6},
    sub: {marginTop: 8, opacity: 0.75, lineHeight: 18},

    bestCard: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#111",
        backgroundColor: "#111",
        borderRadius: 14,
        padding: 14,
    },
    bestTitle: {color: "white", opacity: 0.85, fontWeight: "900"},
    bestName: {marginTop: 10, color: "white", fontWeight: "900", fontSize: 18},
    bestScore: {marginTop: 6, color: "white", opacity: 0.9, fontWeight: "800"},

    card: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {fontSize: 16, fontWeight: "900"},
    help: {marginTop: 6, opacity: 0.7, lineHeight: 18},
    warn: {marginTop: 12, fontWeight: "900", opacity: 0.85},

    rankRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    rank: {width: 40, fontSize: 16, fontWeight: "900"},
    rankName: {fontSize: 15, fontWeight: "900"},
    rankMeta: {marginTop: 4, opacity: 0.75},

    pillOk: {borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#111"},
    pillNo: {borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#777"},
    pillText: {color: "white", fontWeight: "900"},

    primaryBtn: {
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
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},
});