// src/screens/Activities/Activity5/A5ComparisonScreen.tsx
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
    View,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";

import {
    getActivity5RunDraft,
    type Activity5RunDraft,
    type A5MovementSpec,
    type A5MovementType,
    type A5TrialDraft,
    type A5TrialMode,
} from "../../../store/activity5RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A5Comparison">;

/**
 * ✅ Display scaling only.
 * Keep stored metrics raw; scale only for UI + improvement ranking.
 *
 * If your computeTrialMetrics now uses SMOOTHNESS_SCALE = 100,
 * then displaying raw values will look like 0.2 instead of 20.0.
 */
const SMOOTHNESS_DISPLAY_SCALE = 100;

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function scaleSmoothness(x: number | undefined): number | undefined {
    if (!isFiniteNumber(x)) return undefined;
    return x * SMOOTHNESS_DISPLAY_SCALE;
}

function fmt(n: number | undefined, digits = 1) {
    if (!isFiniteNumber(n)) return "—";
    return n.toFixed(digits);
}

function latestTrial(trials: A5TrialDraft[], pid: string, mv: A5MovementType, mode: A5TrialMode) {
    return trials
        .filter((t) => t.participantId === pid && t.movementType === mv && t.mode === mode)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
}

type FilterKey = "all" | A5MovementType;

function FilterChip(props: { label: string; selected: boolean; onPress: () => void }) {
    return (
        <Pressable onPress={props.onPress} style={[styles.chip, props.selected && styles.chipSelected]}>
            <Text style={[styles.chipText, props.selected && styles.chipTextSelected]}>{props.label}</Text>
        </Pressable>
    );
}

export default function A5ComparisonScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity5RunDraft | null>(null);
    const [filter, setFilter] = useState<FilterKey>("all");

    useEffect(() => {
        if (!user) return;

        const d = getActivity5RunDraft(runId);
        if (!d) {
            Alert.alert("Session not found", "Please restart Activity 5.", [
                {text: "OK", onPress: () => navigation.replace("A5SessionSetup", {activityId})},
            ]);
            return;
        }
        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const participants = draft?.session.participants ?? [];
    const movements: A5MovementSpec[] = draft?.session.movements ?? [];
    const trials = draft?.trials ?? [];

    const rows = useMemo(() => {
        if (!draft) return [];

        const out: Array<{
            participantId: string;
            participantName: string;
            movementType: A5MovementType;
            movementTitle: string;

            // raw (stored)
            baselineSmoothRaw?: number;
            feedbackSmoothRaw?: number;

            // scaled (for UI + ranking)
            baselineSmooth?: number;
            feedbackSmooth?: number;
            improvement?: number;

            baselineDuration?: number;
            feedbackDuration?: number;

            baselineDisp?: number;
            feedbackDisp?: number;
        }> = [];

        for (const p of participants) {
            for (const mv of movements) {
                const b = latestTrial(trials, p.id, mv.type, "baseline");
                const f = latestTrial(trials, p.id, mv.type, "feedback");

                const baselineSmoothRaw = b?.metrics?.smoothnessIndex;
                const feedbackSmoothRaw = f?.metrics?.smoothnessIndex;

                // ✅ apply display scale consistently
                const baselineSmooth = scaleSmoothness(baselineSmoothRaw);
                const feedbackSmooth = scaleSmoothness(feedbackSmoothRaw);

                // ✅ improvement in the SAME scaled units as UI
                const improvement =
                    isFiniteNumber(baselineSmooth) && isFiniteNumber(feedbackSmooth)
                        ? baselineSmooth - feedbackSmooth
                        : undefined;

                out.push({
                    participantId: p.id,
                    participantName: p.name,
                    movementType: mv.type,
                    movementTitle: mv.title,

                    baselineSmoothRaw,
                    feedbackSmoothRaw,
                    baselineSmooth,
                    feedbackSmooth,
                    improvement,

                    baselineDuration: b?.metrics?.durationSec,
                    feedbackDuration: f?.metrics?.durationSec,

                    baselineDisp: b?.metrics?.displacementMagnitudeCm,
                    feedbackDisp: f?.metrics?.displacementMagnitudeCm,
                });
            }
        }

        // rank by scaled improvement
        return out.sort((a, b) => (b.improvement ?? -Infinity) - (a.improvement ?? -Infinity));
    }, [draft, movements, participants, trials]);

    const filteredRows = useMemo(() => {
        if (filter === "all") return rows;
        return rows.filter((r) => r.movementType === filter);
    }, [filter, rows]);

    const best = useMemo(() => {
        const top = filteredRows.find((r) => isFiniteNumber(r.improvement));
        return top ?? null;
    }, [filteredRows]);

    function goToResults() {
        navigation.navigate("A5Results", {activityId, runId});
    }

    function goToTrials() {
        navigation.navigate("A5GuidedTrials", {activityId, runId});
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
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.title}>Compare</Text>
                <Text style={styles.sub}>
                    Smoothness Index is scaled for readability (×{SMOOTHNESS_DISPLAY_SCALE}). Lower is smoother.
                    {"\n"}Improvement = Baseline − Feedback (positive means feedback improved smoothness).
                </Text>

                {/* Filter */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Filter by Movement</Text>
                    <View style={styles.chipWrap}>
                        <FilterChip label="All" selected={filter === "all"} onPress={() => setFilter("all")}/>
                        {movements.map((m) => (
                            <FilterChip
                                key={m.type}
                                label={m.title.replace("Movement ", "M")}
                                selected={filter === m.type}
                                onPress={() => setFilter(m.type)}
                            />
                        ))}
                    </View>
                </View>

                {/* Best highlight */}
                <View style={styles.hero}>
                    <Text style={styles.heroTitle}>Top Improvement (Current Filter)</Text>
                    <Text style={styles.heroScore}>{best ? fmt(best.improvement, 1) : "—"}</Text>
                    <Text style={styles.heroMeta}>
                        {best ? `${best.participantName} • ${best.movementTitle}` : "No complete baseline+feedback pair yet."}
                    </Text>
                </View>

                {/* Comparison list */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Ranked Comparisons</Text>
                    <Text style={styles.help}>
                        Rows are ranked by improvement (highest first). Missing values mean the trial hasn’t been
                        recorded yet.
                    </Text>

                    {filteredRows.length === 0 ? (
                        <Text style={styles.muted}>No comparison rows available.</Text>
                    ) : (
                        <View style={{marginTop: 10, gap: 12}}>
                            {filteredRows.map((r, idx) => {
                                const imp = r.improvement;
                                const impOk = isFiniteNumber(imp);
                                const impPositive = impOk && (imp as number) >= 0;

                                return (
                                    <View key={`${r.participantId}_${r.movementType}`} style={styles.rowCard}>
                                        <View style={styles.rowHeader}>
                                            <Text style={styles.rank}>#{idx + 1}</Text>
                                            <Text style={styles.rowTitle}>
                                                {r.participantName} • {r.movementTitle}
                                            </Text>
                                        </View>

                                        <TwoCol
                                            leftLabel={`Baseline smoothness (×${SMOOTHNESS_DISPLAY_SCALE})`}
                                            leftValue={fmt(r.baselineSmooth, 1)}
                                            rightLabel={`Feedback smoothness (×${SMOOTHNESS_DISPLAY_SCALE})`}
                                            rightValue={fmt(r.feedbackSmooth, 1)}
                                        />
                                        <TwoCol
                                            leftLabel="Baseline duration"
                                            leftValue={r.baselineDuration != null ? `${fmt(r.baselineDuration, 1)} s` : "—"}
                                            rightLabel="Feedback duration"
                                            rightValue={r.feedbackDuration != null ? `${fmt(r.feedbackDuration, 1)} s` : "—"}
                                        />
                                        <TwoCol
                                            leftLabel="Baseline displacement"
                                            leftValue={r.baselineDisp != null ? `${fmt(r.baselineDisp, 1)} cm` : "—"}
                                            rightLabel="Feedback displacement"
                                            rightValue={r.feedbackDisp != null ? `${fmt(r.feedbackDisp, 1)} cm` : "—"}
                                        />

                                        <View style={styles.improveRow}>
                                            <Text style={{opacity: 0.75}}>Improvement (B − F)</Text>
                                            <Text
                                                style={[
                                                    styles.improveValue,
                                                    impOk ? (impPositive ? styles.pos : styles.neg) : styles.mutedValue,
                                                ]}
                                            >
                                                {impOk ? fmt(imp as number, 1) : "—"}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>

                {/* Actions */}
                <View style={styles.btnRow}>
                    <Pressable style={styles.secondaryBtn} onPress={goToTrials}>
                        <Text style={styles.secondaryBtnText}>Back to Trials</Text>
                    </Pressable>
                    <Pressable style={styles.primaryBtn} onPress={goToResults}>
                        <Text style={styles.primaryBtnText}>Go to Results</Text>
                    </Pressable>
                </View>

                <View style={{height: 40}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function TwoCol(props: {
    leftLabel: string;
    leftValue: string;
    rightLabel: string;
    rightValue: string;
}) {
    return (
        <View style={styles.twoCol}>
            <View style={{flex: 1}}>
                <Text style={styles.smallLabel}>{props.leftLabel}</Text>
                <Text style={styles.smallValue}>{props.leftValue}</Text>
            </View>
            <View style={{flex: 1}}>
                <Text style={styles.smallLabel}>{props.rightLabel}</Text>
                <Text style={styles.smallValue}>{props.rightValue}</Text>
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

    title: {fontSize: 24, fontWeight: "900"},
    sub: {marginTop: 8, opacity: 0.7, lineHeight: 20},

    hero: {marginTop: 16, borderRadius: 16, backgroundColor: "#111", padding: 16},
    heroTitle: {color: "white", fontWeight: "900", opacity: 0.9},
    heroScore: {color: "white", fontWeight: "900", fontSize: 34, marginTop: 6},
    heroMeta: {color: "white", opacity: 0.85, marginTop: 4, lineHeight: 18},

    card: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14
    },
    cardTitle: {fontSize: 16, fontWeight: "900", marginBottom: 8},
    help: {opacity: 0.75, lineHeight: 18},
    muted: {marginTop: 10, opacity: 0.6},

    chipWrap: {marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10},
    chip: {
        borderWidth: 1,
        borderColor: "#ddd",
        backgroundColor: "white",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999
    },
    chipSelected: {borderColor: "#111", backgroundColor: "#111"},
    chipText: {fontWeight: "900", opacity: 0.85},
    chipTextSelected: {color: "white", opacity: 1},

    rowCard: {borderWidth: 1, borderColor: "#eee", backgroundColor: "white", borderRadius: 14, padding: 14},
    rowHeader: {flexDirection: "row", alignItems: "center", gap: 10},
    rank: {width: 34, textAlign: "center", fontWeight: "900", opacity: 0.7},
    rowTitle: {fontWeight: "900", flex: 1},

    twoCol: {marginTop: 10, flexDirection: "row", gap: 12},
    smallLabel: {opacity: 0.7, fontSize: 12},
    smallValue: {fontWeight: "900", marginTop: 2},

    improveRow: {marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center"},
    improveValue: {fontWeight: "900"},
    pos: {color: "#0a7a2f"},
    neg: {color: "#b00020"},
    mutedValue: {opacity: 0.6},

    btnRow: {marginTop: 18, flexDirection: "row", gap: 10},
    secondaryBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#111",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor: "white"
    },
    secondaryBtnText: {fontWeight: "900"},
    primaryBtn: {flex: 1, backgroundColor: "#111", paddingVertical: 12, borderRadius: 12, alignItems: "center"},
    primaryBtnText: {color: "white", fontWeight: "900"},
});