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

type Props = NativeStackScreenProps<AppStackParamList, "A4Comparison">;

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function fmtScore(x: unknown) {
    if (!isFiniteNumber(x)) return "—";
    // movementScore can be large/small depending on your algorithm; keep readable
    return x >= 100 ? x.toFixed(0) : x.toFixed(3);
}

function safeText(x: unknown, fallback = "—") {
    return typeof x === "string" && x.trim() ? x.trim() : fallback;
}

export default function A4ComparisonScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);

    useEffect(() => {
        if (!user) return;

        const d = getActivity4RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Your draft session was reset. Please start again.", [
                {text: "OK", onPress: () => navigation.replace("A4SessionSetup", {activityId})},
            ]);
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const view = useMemo(() => {
        if (!draft) return null;

        const designs = draft.session.designs ?? [];
        const measured = draft.measurements.filter((m) => isFiniteNumber(m.movementScore));

        // distinct designs with scores
        const scoredDesignSet = new Set(measured.map((m) => m.designIndex));

        // best score per design (lower is better)
        const bestByDesign = new Map<number, number>();
        for (const m of measured) {
            const idx = m.designIndex;
            const s = m.movementScore!;
            const prev = bestByDesign.get(idx);
            if (!isFiniteNumber(prev) || s < prev) bestByDesign.set(idx, s);
        }

        // determine best overall design (lowest movement score)
        let bestDesignIndex: number | null = null;
        let bestScore: number | null = null;
        for (const [idx, s] of bestByDesign.entries()) {
            if (bestScore == null || s < bestScore) {
                bestScore = s;
                bestDesignIndex = idx;
            }
        }

        // build rows (one per design)
        const rows = designs.map((d, i) => {
            const best = bestByDesign.get(i);
            return {
                index: i,
                name: safeText(d.name, `Design ${i + 1}`),
                foldCount: d.foldCount,
                pillarCount: d.pillarCount,
                layers: d.layers,
                notes: d.notes,
                bestScore: best,
                hasScore: isFiniteNumber(best),
            };
        });

        // sort: scored first by bestScore asc, then unscored
        const sorted = [...rows].sort((a, b) => {
            if (a.hasScore && b.hasScore) return (a.bestScore ?? 0) - (b.bestScore ?? 0);
            if (a.hasScore && !b.hasScore) return -1;
            if (!a.hasScore && b.hasScore) return 1;
            return a.index - b.index;
        });

        return {
            rows: sorted,
            scoredCount: scoredDesignSet.size,
            bestDesignIndex,
            bestScore,
            designCount: designs.length,
        };
    }, [draft]);

    function onRetest() {
        navigation.navigate("A4Measurements", {activityId, runId});
    }

    function onContinue() {
        if (!draft || !view) return;

        // FR-A4-04: compare across at least 3 designs
        if (view.scoredCount < 3) {
            Alert.alert(
                "Not enough designs measured",
                `You need scores for at least 3 designs before submitting.\nCurrently: ${view.scoredCount}/${Math.min(
                    3,
                    view.designCount
                )}.`,
                [
                    {text: "Go measure", onPress: () => navigation.navigate("A4Measurements", {activityId, runId})},
                    {text: "OK", style: "cancel"},
                ]
            );
            return;
        }

        navigation.navigate("A4ReflectionSubmit", {activityId, runId});
    }

    if (!user) return null;

    if (!draft || !view) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10, opacity: 0.7}}>Loading comparison…</Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Comparison</Text>
            <Text style={styles.sub}>
                Compare designs by movement score. **Lower score = better vibration resistance.**
            </Text>

            {/* Summary card */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Summary</Text>

                <View style={{marginTop: 10, gap: 10}}>
                    <RowStat label="Designs measured (with score)" value={`${view.scoredCount}/${view.designCount}`}/>
                    <RowStat
                        label="Best score"
                        value={view.bestScore == null ? "—" : fmtScore(view.bestScore)}
                        strong
                    />
                    <RowStat
                        label="Best design"
                        value={
                            view.bestDesignIndex == null
                                ? "—"
                                : `Design ${view.bestDesignIndex + 1}`
                        }
                        strong
                    />
                </View>

                {view.scoredCount < 3 ? (
                    <View style={styles.warnBox}>
                        <Text style={styles.warnTitle}>Need at least 3 designs</Text>
                        <Text style={styles.warnText}>
                            Measure at least 3 designs before submission (FR-A4-04).
                        </Text>
                        <Pressable style={styles.secondaryBtn} onPress={onRetest}>
                            <Text style={styles.secondaryBtnText}>Go to Measurements</Text>
                        </Pressable>
                    </View>
                ) : null}
            </View>

            {/* Design list */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Design Breakdown</Text>
                <Text style={styles.help}>Sorted by best (lowest) movement score first.</Text>

                <View style={{marginTop: 12, gap: 10}}>
                    {view.rows.map((r) => {
                        const isBest = view.bestDesignIndex === r.index && r.hasScore;

                        return (
                            <View key={r.index} style={[styles.designCard, isBest && styles.designCardBest]}>
                                <View style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start"
                                }}>
                                    <View style={{flex: 1, paddingRight: 10}}>
                                        <Text style={[styles.designTitle, isBest && styles.designTitleBest]}>
                                            {r.name}
                                            {isBest ? "  👑" : ""}
                                        </Text>

                                        <Text style={[styles.meta, isBest && styles.metaBest]}>
                                            Folds: {r.foldCount ?? "—"} • Pillars: {r.pillarCount ?? "—"} •
                                            Layers: {r.layers ?? "—"}
                                        </Text>

                                        {r.notes ? (
                                            <Text style={[styles.notes, isBest && styles.notesBest]} numberOfLines={3}>
                                                Notes: {r.notes}
                                            </Text>
                                        ) : null}
                                    </View>

                                    <View style={{alignItems: "flex-end", minWidth: 90}}>
                                        <Text style={[styles.score, isBest && styles.scoreBest]}>
                                            {fmtScore(r.bestScore)}
                                        </Text>
                                        <Text style={[styles.scoreHint, isBest && styles.scoreHintBest]}>
                                            best score
                                        </Text>
                                    </View>
                                </View>

                                {!r.hasScore ? (
                                    <Text style={styles.missing}>No measurement yet — go to Measurements to run this
                                        design.</Text>
                                ) : (
                                    <Text style={styles.good}>Lower is better ✅</Text>
                                )}
                            </View>
                        );
                    })}
                </View>
            </View>

            {/* Actions */}
            <View style={{marginTop: 14, gap: 10}}>
                <Pressable style={styles.secondaryBigBtn} onPress={onRetest}>
                    <Text style={styles.secondaryBigText}>Retest / Add Measurements</Text>
                </Pressable>

                <Pressable style={styles.primaryBtn} onPress={onContinue}>
                    <Text style={styles.primaryBtnText}>Continue to Reflection & Submit</Text>
                </Pressable>
            </View>

            <View style={{height: 30}}/>
        </ScrollView>
    );
}

function RowStat(props: { label: string; value: string; strong?: boolean }) {
    return (
        <View style={styles.statRow}>
            <Text style={styles.statLabel}>{props.label}</Text>
            <Text style={[styles.statValue, props.strong && styles.statValueStrong]}>{props.value}</Text>
        </View>
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
    help: {marginTop: 6, opacity: 0.7, lineHeight: 18},

    statRow: {flexDirection: "row", justifyContent: "space-between", alignItems: "center"},
    statLabel: {opacity: 0.8, fontWeight: "800"},
    statValue: {fontWeight: "900"},
    statValueStrong: {fontSize: 16},

    warnBox: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#b00020",
        backgroundColor: "#fff5f5",
        borderRadius: 14,
        padding: 12,
    },
    warnTitle: {fontWeight: "900"},
    warnText: {marginTop: 6, opacity: 0.85, lineHeight: 18},

    designCard: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 14,
        padding: 12,
    },
    designCardBest: {
        backgroundColor: "#111",
        borderColor: "#111",
    },

    designTitle: {fontWeight: "900", fontSize: 15},
    designTitleBest: {color: "white"},

    meta: {marginTop: 6, opacity: 0.7, lineHeight: 18},
    metaBest: {color: "white", opacity: 0.85},

    notes: {marginTop: 6, opacity: 0.75, lineHeight: 18},
    notesBest: {color: "white", opacity: 0.9},

    score: {fontSize: 18, fontWeight: "900"},
    scoreBest: {color: "white"},

    scoreHint: {marginTop: 2, fontSize: 12, opacity: 0.7, fontWeight: "800"},
    scoreHintBest: {color: "white", opacity: 0.8},

    missing: {marginTop: 10, opacity: 0.8, lineHeight: 18},
    good: {marginTop: 10, opacity: 0.7, lineHeight: 18, fontWeight: "800"},

    primaryBtn: {
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    secondaryBtn: {
        marginTop: 12,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#111",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},

    secondaryBigBtn: {
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBigText: {fontWeight: "900", fontSize: 15},
});