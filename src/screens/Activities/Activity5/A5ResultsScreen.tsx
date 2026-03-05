// src/screens/Activities/Activity5/A5ResultsScreen.tsx
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

type Props = NativeStackScreenProps<AppStackParamList, "A5Results">;

/* =========================================================
   Scoring policy (Option 2)
   - Scale smoothness by 100 for display + leaderboard friendliness
   - Reward only positive improvement: max(0, Baseline - Feedback)
========================================================= */

const SMOOTHNESS_SCALE = 100; // display + score scaling

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function clampNum(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function fmt(n: number | undefined, digits = 1) {
    if (!isFiniteNumber(n)) return "—";
    return n.toFixed(digits);
}

function fmtScaledSmooth(n: number | undefined, digits = 1) {
    if (!isFiniteNumber(n)) return "—";
    return (n * SMOOTHNESS_SCALE).toFixed(digits);
}

/**
 * Leaderboard / best-improvement score.
 * Only positive improvements count (feedback smoother than baseline).
 */
function improvementScoreScaled(baselineSmooth?: number, feedbackSmooth?: number): number | undefined {
    if (!isFiniteNumber(baselineSmooth) || !isFiniteNumber(feedbackSmooth)) return undefined;
    const raw = baselineSmooth - feedbackSmooth;           // >0 means feedback smoother
    const clipped = Math.max(0, raw);                      // do not punish users
    const scaled = clipped * SMOOTHNESS_SCALE;             // readable score
    return clampNum(scaled, 0, 1e12);
}

function latestTrial(trials: A5TrialDraft[], pid: string, mv: A5MovementType, mode: A5TrialMode) {
    return trials
        .filter((t) => t.participantId === pid && t.movementType === mv && t.mode === mode)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
}

export default function A5ResultsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity5RunDraft | null>(null);

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

    const table = useMemo(() => {
        if (!draft) return [];

        const rows: Array<{
            participantId: string;
            participantName: string;
            movementType: A5MovementType;
            movementTitle: string;

            baselineSmooth?: number;       // raw
            feedbackSmooth?: number;       // raw
            improvementScore?: number;     // scaled + clipped score (>=0)

            baselineDuration?: number;
            baselineDisp?: number;

            feedbackDuration?: number;
            feedbackDisp?: number;
        }> = [];

        for (const p of participants) {
            for (const mv of movements) {
                const b = latestTrial(trials, p.id, mv.type, "baseline");
                const f = latestTrial(trials, p.id, mv.type, "feedback");

                const baselineSmooth = b?.metrics?.smoothnessIndex;
                const feedbackSmooth = f?.metrics?.smoothnessIndex;

                rows.push({
                    participantId: p.id,
                    participantName: p.name,
                    movementType: mv.type,
                    movementTitle: mv.title,

                    baselineSmooth,
                    feedbackSmooth,
                    improvementScore: improvementScoreScaled(baselineSmooth, feedbackSmooth),

                    baselineDuration: b?.metrics?.durationSec,
                    baselineDisp: b?.metrics?.displacementMagnitudeCm,

                    feedbackDuration: f?.metrics?.durationSec,
                    feedbackDisp: f?.metrics?.displacementMagnitudeCm,
                });
            }
        }

        return rows;
    }, [draft, movements, participants, trials]);

    const best = useMemo(() => {
        // Prefer cached improvements if you already store them in draft,
        // but we scale + clip here anyway to ensure consistent UI.
        const cached = draft?.improvements ?? [];
        if (cached.length > 0) {
            const top = cached[0];

            // If store already changed to scaled score, keep as-is; otherwise scale safely.
            // Heuristic: if it's very small (<5) assume raw and scale.
            const rawScore = top.improvementScore;
            const score =
                isFiniteNumber(rawScore)
                    ? rawScore < 5
                        ? Math.max(0, rawScore) * SMOOTHNESS_SCALE
                        : Math.max(0, rawScore)
                    : 0;

            const pname = participants.find((p) => p.id === top.participantId)?.name ?? "—";
            const mtitle = movements.find((m) => m.type === top.movementType)?.title ?? top.movementType;

            return {score, participantName: pname, movementTitle: mtitle};
        }

        // Fallback from computed rows
        let bestScore = 0;
        let bestPid = "";
        let bestMv = "";

        for (const r of table) {
            if (!isFiniteNumber(r.improvementScore)) continue;
            if (r.improvementScore > bestScore) {
                bestScore = r.improvementScore;
                bestPid = r.participantId;
                bestMv = r.movementTitle;
            }
        }

        return {
            score: bestScore,
            participantName: participants.find((p) => p.id === bestPid)?.name ?? "—",
            movementTitle: bestMv || "—",
        };
    }, [draft?.improvements, movements, participants, table]);

    function goToTrials() {
        navigation.navigate("A5GuidedTrials", {activityId, runId});
    }

    function goToCompare() {
        navigation.navigate("A5Comparison", {activityId, runId});
    }

    function goToSubmit() {
        navigation.navigate("A5ReflectionSubmit", {activityId, runId});
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
                <Text style={styles.title}>Results</Text>
                <Text style={styles.sub}>
                    Smoothness index is scaled ×{SMOOTHNESS_SCALE} for readability.{" "}
                    Score = max(0, Baseline − Feedback) × {SMOOTHNESS_SCALE}. Higher score = better improvement.
                </Text>

                {/* Best improvement */}
                <View style={styles.hero}>
                    <Text style={styles.heroTitle}>Best Improvement (Session)</Text>
                    <Text style={styles.heroScore}>{fmt(best.score, 1)}</Text>
                    <Text style={styles.heroMeta}>
                        {best.participantName} • {best.movementTitle}
                    </Text>
                    <Text style={styles.heroHint}>
                        Leaderboard uses the highest improvement score recorded within the session.
                    </Text>
                </View>

                {/* Per participant summary */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Summary Table</Text>
                    <Text style={styles.help}>
                        Smoothness index (scaled) lower = smoother. Improvement score is positive when feedback is
                        smoother than
                        baseline (no negative scores).
                    </Text>

                    {participants.length === 0 || movements.length === 0 ? (
                        <Text style={styles.muted}>No participants or movements found.</Text>
                    ) : (
                        <View style={{marginTop: 10, gap: 12}}>
                            {participants.map((p) => {
                                const rows = table.filter((r) => r.participantId === p.id);

                                const bestRow = rows
                                    .filter((r) => isFiniteNumber(r.improvementScore))
                                    .sort((a, b) => (b.improvementScore ?? 0) - (a.improvementScore ?? 0))[0];

                                return (
                                    <View key={p.id} style={styles.participantBlock}>
                                        <Text style={styles.participantName}>{p.name}</Text>

                                        <Text style={styles.participantMeta}>
                                            Best improvement:{" "}
                                            <Text style={{fontWeight: "900"}}>
                                                {bestRow?.improvementScore != null ? fmt(bestRow.improvementScore, 1) : "—"}
                                            </Text>
                                            {bestRow?.movementTitle ? ` • ${bestRow.movementTitle}` : ""}
                                        </Text>

                                        {rows.map((r) => (
                                            <View key={`${r.participantId}_${r.movementType}`} style={styles.rowCard}>
                                                <Text style={styles.rowTitle}>{r.movementTitle}</Text>

                                                <TwoCol
                                                    leftLabel={`Baseline smoothness (×${SMOOTHNESS_SCALE})`}
                                                    leftValue={fmtScaledSmooth(r.baselineSmooth, 1)}
                                                    rightLabel={`Feedback smoothness (×${SMOOTHNESS_SCALE})`}
                                                    rightValue={fmtScaledSmooth(r.feedbackSmooth, 1)}
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
                                                    <Text style={{opacity: 0.75}}>
                                                        Improvement score (max(0, B − F) × {SMOOTHNESS_SCALE})
                                                    </Text>
                                                    <Text
                                                        style={[
                                                            styles.improveValue,
                                                            isFiniteNumber(r.improvementScore) && r.improvementScore > 0
                                                                ? styles.improvePositive
                                                                : styles.improveNeutral,
                                                        ]}
                                                    >
                                                        {isFiniteNumber(r.improvementScore) ? fmt(r.improvementScore, 1) : "—"}
                                                    </Text>
                                                </View>

                                                {isFiniteNumber(r.baselineSmooth) && isFiniteNumber(r.feedbackSmooth) ? (
                                                    r.baselineSmooth - r.feedbackSmooth < 0 ? (
                                                        <Text style={styles.tinyNote}>
                                                            Note: feedback was less smooth than baseline in this trial,
                                                            so the score is clipped to 0.
                                                        </Text>
                                                    ) : null
                                                ) : null}
                                            </View>
                                        ))}
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

                    <Pressable style={styles.secondaryBtn} onPress={goToCompare}>
                        <Text style={styles.secondaryBtnText}>Compare</Text>
                    </Pressable>

                    <Pressable style={styles.primaryBtn} onPress={goToSubmit}>
                        <Text style={styles.primaryBtnText}>Reflection & Submit</Text>
                    </Pressable>
                </View>

                <View style={{height: 40}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

/* =========================================================
   UI components
========================================================= */

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

    hero: {
        marginTop: 16,
        borderRadius: 16,
        backgroundColor: "#111",
        padding: 16,
    },
    heroTitle: {color: "white", fontWeight: "900", opacity: 0.9},
    heroScore: {color: "white", fontWeight: "900", fontSize: 34, marginTop: 6},
    heroMeta: {color: "white", opacity: 0.9, marginTop: 4},
    heroHint: {color: "white", opacity: 0.65, marginTop: 8, lineHeight: 18},

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
    muted: {marginTop: 10, opacity: 0.6},
    tinyNote: {marginTop: 8, opacity: 0.6, fontSize: 12, lineHeight: 16},

    participantBlock: {
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "white",
        borderRadius: 14,
        padding: 14,
    },
    participantName: {fontWeight: "900", fontSize: 16},
    participantMeta: {marginTop: 6, opacity: 0.7},

    rowCard: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 12,
    },
    rowTitle: {fontWeight: "900"},

    twoCol: {
        marginTop: 10,
        flexDirection: "row",
        gap: 12,
    },
    smallLabel: {opacity: 0.7, fontSize: 12},
    smallValue: {fontWeight: "900", marginTop: 2},

    improveRow: {
        marginTop: 12,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    improveValue: {fontWeight: "900"},
    improvePositive: {color: "#0a7a2f"},
    improveNeutral: {color: "#111"},

    btnRow: {
        marginTop: 18,
        flexDirection: "row",
        gap: 10,
    },
    secondaryBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#111",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor: "white",
    },
    secondaryBtnText: {fontWeight: "900"},
    primaryBtn: {
        flex: 1,
        backgroundColor: "#111",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900"},
});