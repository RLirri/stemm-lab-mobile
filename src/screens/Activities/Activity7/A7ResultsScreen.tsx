// src/screens/Activities/Activity7/A7ResultsScreen.tsx

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
    getActivity7RunDraft,
    validateA7Submission,
    isA7LeaderboardEligible,
    getA7LeaderboardMetrics,
    type Activity7RunDraft,
    type A7ParticipantSummary,
} from "../../../store/activity7RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A7Results">;

/* =========================================================
   Helpers
========================================================= */

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}

function mean(xs: number[]): number | undefined {
    if (!xs.length) return undefined;
    return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function fmtBpm(v?: number) {
    if (!isFiniteNumber(v)) return "—";
    return `${v.toFixed(1)} BPM`;
}

function fmtDelta(v?: number) {
    if (!isFiniteNumber(v)) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(1)} BPM`;
}

function fmtScore(v?: number) {
    if (!isFiniteNumber(v)) return "—";
    return v.toFixed(3);
}

function fmtN(v?: number) {
    if (!isFiniteNumber(v)) return "—";
    return `${Math.round(v)}`;
}

function participantName(d: Activity7RunDraft, participantId: string) {
    return d.session.participants.find((p) => p.id === participantId)?.name ?? "—";
}

function stripReflectionBlockingItems(missing: string[]) {
    return missing.filter(
        (m) =>
            ![
                "Reflection text",
                "Rating (1–5)",
                "GPS permission granted",
                "GPS coordinates captured",
            ].includes(m)
    );
}

function getPredictionVerdict(errors: Array<number | undefined>) {
    const vals = errors.filter(isFiniteNumber);
    if (!vals.length) return "Not enough data";
    const avg = mean(vals);
    if (!isFiniteNumber(avg)) return "Not enough data";
    if (avg <= 2) return "Very close";
    if (avg <= 5) return "Reasonably close";
    if (avg <= 10) return "Partly correct";
    return "Not very close";
}

function minDefined(xs: Array<number | undefined>) {
    const vals = xs.filter(isFiniteNumber);
    return vals.length ? Math.min(...vals) : undefined;
}

function maxDefined(xs: Array<number | undefined>) {
    const vals = xs.filter(isFiniteNumber);
    return vals.length ? Math.max(...vals) : undefined;
}

function getHighestPhaseLabel(s: A7ParticipantSummary): string {
    const candidates = [
        {label: "Rest", value: s.restBpm},
        {label: "Post-Jog", value: s.postJogBpm},
        {label: "Post-Star-Jumps", value: s.postStarJumpBpm},
    ].filter((x) => isFiniteNumber(x.value));

    if (!candidates.length) return "—";

    candidates.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return candidates[0].label;
}

/* =========================================================
   UI atoms
========================================================= */

function Pill({label}: { label: string }) {
    return (
        <View style={styles.pill}>
            <Text style={styles.pillText}>{label}</Text>
        </View>
    );
}

function Divider() {
    return <View style={styles.divider}/>;
}

function MetricRow(props: { label: string; value: string; hint?: string }) {
    return (
        <View style={styles.metricRow}>
            <View style={{flex: 1}}>
                <Text style={styles.metricLabel}>{props.label}</Text>
                {props.hint ? <Text style={styles.metricHint}>{props.hint}</Text> : null}
            </View>
            <Text style={styles.metricValue}>{props.value}</Text>
        </View>
    );
}

/* =========================================================
   Screen
========================================================= */

export default function A7ResultsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity7RunDraft | null>(null);

    useEffect(() => {
        if (!user) return;

        const d = getActivity7RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Please restart Activity 7.", [
                {text: "OK", onPress: () => navigation.goBack()},
            ]);
            return;
        }

        setDraft(d);
    }, [navigation, runId, user]);

    const metrics = useMemo(() => {
        if (!draft) return null;
        return draft.metrics ?? {participantSummaries: []};
    }, [draft]);

    const leaderboard = useMemo(() => {
        if (!draft) return null;
        return getA7LeaderboardMetrics(draft);
    }, [draft]);

    const leaderboardEligible = useMemo(() => {
        if (!draft) return false;
        return isA7LeaderboardEligible(draft);
    }, [draft]);

    const submissionMissing = useMemo(() => {
        if (!draft) return [];
        return validateA7Submission(draft);
    }, [draft]);

    const experimentBlockingMissing = useMemo(() => {
        return stripReflectionBlockingItems(submissionMissing);
    }, [submissionMissing]);

    const canProceedToReflection = useMemo(() => {
        return experimentBlockingMissing.length === 0;
    }, [experimentBlockingMissing]);

    const highlights = useMemo(() => {
        if (!draft || !metrics) return null;

        const summaries = metrics.participantSummaries ?? [];
        const bestId = metrics.bestParticipantId;
        const bestSummary = summaries.find((s) => s.participantId === bestId);

        const bestParticipantName = bestId ? participantName(draft, bestId) : undefined;
        const lowestRest = minDefined(summaries.map((s) => s.restBpm));
        const highestExercise = maxDefined([
            ...summaries.map((s) => s.postJogBpm),
            ...summaries.map((s) => s.postStarJumpBpm),
        ]);

        const avgPredictionAbsError = mean(
            summaries.flatMap((s) =>
                [
                    s.prediction?.restAbsError,
                    s.prediction?.postJogAbsError,
                    s.prediction?.postStarJumpAbsError,
                ].filter(isFiniteNumber)
            )
        );

        return {
            bestParticipantName,
            bestRecoveryScore: bestSummary?.recoveryConsistencyScore,
            lowestRest,
            highestExercise,
            avgPredictionAbsError,
        };
    }, [draft, metrics]);

    function refresh() {
        const d = getActivity7RunDraft(runId);
        if (d) setDraft(d);
    }

    function goToMeasurements() {
        navigation.navigate("A7Measurements", {activityId, runId});
    }

    function goToSubmit() {
        navigation.navigate("A7ReflectionSubmit", {activityId, runId});
    }

    if (!user) return null;

    if (!draft || !metrics) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10, opacity: 0.7}}>Loading…</Text>
            </View>
        );
    }

    const summaries: A7ParticipantSummary[] = metrics.participantSummaries ?? [];
    const prediction = draft.prediction;

    return (
        <KeyboardAvoidingView
            style={{flex: 1}}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView contentContainerStyle={styles.container}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>Results Dashboard</Text>
                    <Pressable style={styles.ghostBtn} onPress={refresh}>
                        <Text style={styles.ghostBtnText}>Refresh</Text>
                    </Pressable>
                </View>

                <Text style={styles.sub}>
                    Review breathing rate at rest and after exercise, compare changes between
                    phases, and check recovery consistency. Lower recovery consistency score is
                    better for leaderboard ranking.
                </Text>

                {/* Highlights */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Highlights</Text>

                    <View style={styles.pillWrap}>
                        <Pill label={leaderboardEligible ? "Leaderboard: Eligible ✅" : "Leaderboard: Not eligible"}/>
                        <Pill
                            label={
                                prediction
                                    ? `Prediction entered: Rest ${fmtN(prediction.predictedRestBpm)} / After exercise ${fmtN(
                                        prediction.predictedAfterExerciseBpm
                                    )}`
                                    : "Prediction missing"
                            }
                        />
                    </View>

                    <Divider/>

                    <MetricRow
                        label="Best recovery consistency"
                        value={
                            highlights?.bestParticipantName
                                ? `${highlights.bestParticipantName} • ${fmtScore(highlights.bestRecoveryScore)}`
                                : "—"
                        }
                        hint="Lower score means more stable recovery relative to resting breathing rate."
                    />

                    <MetricRow
                        label="Lowest resting breathing rate"
                        value={fmtBpm(highlights?.lowestRest)}
                        hint="Based on participant resting measurements."
                    />

                    <MetricRow
                        label="Highest post-exercise breathing rate"
                        value={fmtBpm(highlights?.highestExercise)}
                        hint="Computed across both post-jog and post-star-jumps phases."
                    />

                    <MetricRow
                        label="Average prediction error"
                        value={
                            isFiniteNumber(highlights?.avgPredictionAbsError)
                                ? `${highlights!.avgPredictionAbsError!.toFixed(1)} BPM`
                                : "—"
                        }
                        hint="Average absolute error across all available measured-vs-predicted values."
                    />
                </View>

                {/* Team Summary */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Team Summary</Text>

                    <MetricRow
                        label="Average resting breathing rate"
                        value={fmtBpm(metrics.avgRestBpm)}
                        hint="Computed from participants with resting measurements."
                    />

                    <MetricRow
                        label="Average breathing rate after 1-minute jog"
                        value={fmtBpm(metrics.avgPostJogBpm)}
                        hint="Computed from participants with post-jog measurements."
                    />

                    <MetricRow
                        label="Average breathing rate after 100 star jumps"
                        value={fmtBpm(metrics.avgPostStarJumpBpm)}
                        hint="Computed from participants with post-star-jumps measurements."
                    />

                    <MetricRow
                        label="Team recovery consistency score"
                        value={fmtScore(leaderboard?.teamRecoveryConsistencyScore)}
                        hint="Lower team score indicates more consistent recovery patterns across participants."
                    />

                    <MetricRow
                        label="Best participant result"
                        value={
                            leaderboard?.bestParticipantId
                                ? `${participantName(draft, leaderboard.bestParticipantId)} • ${fmtScore(
                                    leaderboard.bestParticipantRecoveryConsistencyScore
                                )}`
                                : "—"
                        }
                        hint="Best participant is the one with the lowest recovery consistency score."
                    />
                </View>

                {/* Per Participant Breakdown */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Per Participant Breakdown</Text>
                    <Text style={styles.help}>
                        Compare each participant’s breathing rate at rest and after exercise, then
                        review deltas, recovery consistency, and prediction accuracy.
                    </Text>

                    <Divider/>

                    {summaries.length === 0 ? (
                        <Text style={styles.empty}>
                            No results yet. Record all breathing measurements first.
                        </Text>
                    ) : (
                        summaries.map((s) => {
                            const name = participantName(draft, s.participantId);
                            const verdict = getPredictionVerdict([
                                s.prediction?.restAbsError,
                                s.prediction?.postJogAbsError,
                                s.prediction?.postStarJumpAbsError,
                            ]);

                            return (
                                <View key={s.participantId} style={styles.participantCard}>
                                    <View style={styles.participantHeader}>
                                        <Text style={styles.participantName}>{name}</Text>
                                        <Text style={styles.participantMeta}>
                                            Recovery score:{" "}
                                            <Text style={{fontWeight: "900"}}>
                                                {fmtScore(s.recoveryConsistencyScore)}
                                            </Text>
                                        </Text>
                                    </View>

                                    <Text style={styles.participantHint}>
                                        Highest measured phase: {getHighestPhaseLabel(s)}
                                    </Text>

                                    <View style={styles.grid2}>
                                        <View style={styles.gridBox}>
                                            <Text style={styles.gridTitle}>Measured breathing rates</Text>
                                            <MetricRow label="Rest" value={fmtBpm(s.restBpm)}/>
                                            <MetricRow label="Post-Jog" value={fmtBpm(s.postJogBpm)}/>
                                            <MetricRow
                                                label="Post-Star-Jumps"
                                                value={fmtBpm(s.postStarJumpBpm)}
                                            />
                                        </View>

                                        <View style={styles.gridBox}>
                                            <Text style={styles.gridTitle}>Phase changes</Text>
                                            <MetricRow label="Rest → Jog" value={fmtDelta(s.deltaRestToJog)}/>
                                            <MetricRow
                                                label="Rest → Star Jumps"
                                                value={fmtDelta(s.deltaRestToStarJump)}
                                            />
                                            <MetricRow
                                                label="Jog → Star Jumps"
                                                value={fmtDelta(s.deltaJogToStarJump)}
                                            />
                                        </View>
                                    </View>

                                    <View style={{marginTop: 10}}>
                                        <MetricRow
                                            label="Prediction verdict"
                                            value={verdict}
                                            hint="Judged from available absolute error values."
                                        />
                                        <MetricRow
                                            label="Rest prediction error"
                                            value={
                                                isFiniteNumber(s.prediction?.restAbsError)
                                                    ? `${s.prediction!.restAbsError!.toFixed(1)} BPM`
                                                    : "—"
                                            }
                                        />
                                        <MetricRow
                                            label="Post-Jog prediction error"
                                            value={
                                                isFiniteNumber(s.prediction?.postJogAbsError)
                                                    ? `${s.prediction!.postJogAbsError!.toFixed(1)} BPM`
                                                    : "—"
                                            }
                                        />
                                        <MetricRow
                                            label="Post-Star-Jumps prediction error"
                                            value={
                                                isFiniteNumber(s.prediction?.postStarJumpAbsError)
                                                    ? `${s.prediction!.postStarJumpAbsError!.toFixed(1)} BPM`
                                                    : "—"
                                            }
                                        />
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>

                {/* Experiment readiness */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Experiment Readiness</Text>
                    <Text style={styles.help}>
                        You can continue to Reflection & Submit once the experiment data is complete.
                    </Text>

                    <Divider/>

                    {experimentBlockingMissing.length === 0 ? (
                        <View style={styles.readyBox}>
                            <Text style={styles.readyTitle}>Ready for Reflection ✅</Text>
                            <Text style={styles.readyText}>
                                All required breathing measurements and computed datasets are present.
                                You can continue to the reflection page.
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.missingBox}>
                            <Text style={styles.missingTitle}>
                                Complete these experiment items first
                            </Text>
                            {experimentBlockingMissing.map((m, idx) => (
                                <Text key={`${m}_${idx}`} style={styles.missingItem}>
                                    • {m}
                                </Text>
                            ))}
                        </View>
                    )}
                </View>

                {/* Final submission note */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Final Submission Notes</Text>
                    <Text style={styles.help}>
                        Reflection, rating, and GPS are completed in the Reflection & Submit screen.
                        Video evidence remains optional.
                    </Text>

                    <Divider/>

                    <Text style={styles.noteText}>You will complete:</Text>
                    <Text style={styles.noteItem}>• Reflection text</Text>
                    <Text style={styles.noteItem}>• Rating (1–5)</Text>
                    <Text style={styles.noteItem}>• GPS permission / coordinate check</Text>
                    <Text style={styles.noteItem}>• Optional session video</Text>
                </View>

                {/* Actions */}
                <View style={styles.actionRow}>
                    <Pressable style={styles.secondaryBtn} onPress={goToMeasurements}>
                        <Text style={styles.secondaryBtnText}>Back to Measurements</Text>
                    </Pressable>
                </View>

                <Pressable
                    style={[styles.primaryBtnWide, !canProceedToReflection && styles.btnDisabled]}
                    disabled={!canProceedToReflection}
                    onPress={goToSubmit}
                >
                    <Text style={styles.primaryBtnText}>Go to Reflection & Submit</Text>
                </Pressable>

                <View style={{height: 40}}/>
            </ScrollView>
        </KeyboardAvoidingView>
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

    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },

    title: {
        fontSize: 24,
        fontWeight: "900",
    },
    sub: {
        marginTop: 8,
        opacity: 0.72,
        lineHeight: 20,
    },

    card: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "white",
        borderRadius: 14,
        padding: 14,
    },
    participantCard: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },

    cardTitle: {
        fontSize: 16,
        fontWeight: "900",
    },
    help: {
        marginTop: 6,
        opacity: 0.75,
        lineHeight: 18,
    },

    divider: {
        height: 1,
        backgroundColor: "#eee",
        marginVertical: 12,
    },

    pillWrap: {
        marginTop: 10,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
    },
    pill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#ddd",
        backgroundColor: "#fafafa",
    },
    pillText: {
        fontWeight: "900",
        opacity: 0.86,
    },

    metricRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
    },
    metricLabel: {
        fontWeight: "800",
        opacity: 0.8,
    },
    metricHint: {
        marginTop: 2,
        opacity: 0.65,
        fontSize: 12,
        lineHeight: 16,
    },
    metricValue: {
        fontWeight: "900",
        marginLeft: 10,
    },

    participantHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
    },
    participantName: {
        fontSize: 16,
        fontWeight: "900",
    },
    participantMeta: {
        opacity: 0.75,
    },
    participantHint: {
        marginTop: 6,
        opacity: 0.75,
        fontWeight: "800",
    },

    grid2: {
        marginTop: 12,
        flexDirection: "row",
        gap: 10,
    },
    gridBox: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 12,
        padding: 12,
        backgroundColor: "white",
    },
    gridTitle: {
        fontWeight: "900",
        marginBottom: 6,
    },

    empty: {
        marginTop: 8,
        opacity: 0.7,
    },

    readyBox: {
        padding: 14,
        borderRadius: 12,
        backgroundColor: "#f3f4f6",
    },
    readyTitle: {
        fontWeight: "900",
    },
    readyText: {
        marginTop: 6,
        opacity: 0.75,
        lineHeight: 18,
    },

    missingBox: {
        padding: 14,
        borderRadius: 12,
        backgroundColor: "#fff7ed",
        borderWidth: 1,
        borderColor: "#fed7aa",
    },
    missingTitle: {
        fontWeight: "900",
    },
    missingItem: {
        marginTop: 8,
        opacity: 0.85,
        lineHeight: 18,
    },

    noteText: {
        opacity: 0.8,
        fontWeight: "800",
    },
    noteItem: {
        marginTop: 8,
        opacity: 0.8,
        lineHeight: 18,
    },

    actionRow: {
        marginTop: 14,
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
    secondaryBtnText: {
        fontWeight: "900",
    },

    primaryBtnWide: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {
        color: "white",
        fontWeight: "900",
    },

    btnDisabled: {
        opacity: 0.5,
    },

    ghostBtn: {
        borderWidth: 1,
        borderColor: "#ddd",
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: "white",
    },
    ghostBtnText: {
        fontWeight: "900",
        opacity: 0.85,
    },
});