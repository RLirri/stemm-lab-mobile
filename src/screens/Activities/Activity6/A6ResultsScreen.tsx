// src/screens/Activities/Activity6/A6ResultsScreen.tsx

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
    getActivity6RunDraft,
    validateA6Submission,
    isA6LeaderboardEligible,
    getA6LeaderboardMetrics,
    type Activity6RunDraft,
    type A6ParticipantSummary,
} from "../../../store/activity6RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A6Results">;

/* =========================================================
   Helpers
========================================================= */

function fmtMs(v?: number) {
    if (v == null || !Number.isFinite(v)) return "—";
    return `${Math.round(v)} ms`;
}

function fmtPct(v?: number) {
    if (v == null || !Number.isFinite(v)) return "—";
    return `${Math.round(v)}%`;
}

function fmtN(v?: number) {
    if (v == null || !Number.isFinite(v)) return "—";
    return `${Math.round(v)}`;
}

function participantName(d: Activity6RunDraft, pid: string) {
    return d.session.participants.find((p) => p.id === pid)?.name ?? "—";
}

function isFiniteNum(x: any): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function minDefined(xs: Array<number | undefined>) {
    const v = xs.filter(isFiniteNum);
    return v.length ? Math.min(...v) : undefined;
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

function Divider() {
    return <View style={styles.divider}/>;
}

/* =========================================================
   Screen
========================================================= */

export default function A6ResultsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity6RunDraft | null>(null);

    useEffect(() => {
        if (!user) return;

        const d = getActivity6RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Please restart Activity 6.", [
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

    const eligibility = useMemo(() => {
        if (!draft) return {eligible: false, threshold: 60};
        return {
            eligible: isA6LeaderboardEligible(draft),
            threshold: draft.session.accuracyThresholdPct ?? 60,
        };
    }, [draft]);

    const leaderboard = useMemo(() => {
        if (!draft) return null;
        return getA6LeaderboardMetrics(draft);
    }, [draft]);

    const submissionMissing = useMemo(() => {
        if (!draft) return [];
        return validateA6Submission(draft);
    }, [draft]);

    const experimentBlockingMissing = useMemo(() => {
        return stripReflectionBlockingItems(submissionMissing);
    }, [submissionMissing]);

    const canProceedToReflection = useMemo(() => {
        return experimentBlockingMissing.length === 0;
    }, [experimentBlockingMissing]);

    const highlights = useMemo(() => {
        if (!draft || !metrics) return null;

        const fastestId = metrics.fastestParticipantId;
        const mostAccurateId = metrics.mostAccurateParticipantId;

        const fastestName = fastestId ? participantName(draft, fastestId) : undefined;
        const mostAccName = mostAccurateId ? participantName(draft, mostAccurateId) : undefined;

        const fastestSummary = metrics.participantSummaries.find((s) => s.participantId === fastestId);
        const fastestOverall = fastestSummary?.overallMeanReactionTimeMs;

        const accSummary = metrics.participantSummaries.find((s) => s.participantId === mostAccurateId);
        const bestAcc = accSummary?.tracingAccuracyPct;

        return {
            fastestName,
            fastestOverall,
            mostAccName,
            bestAcc,
        };
    }, [draft, metrics]);

    function refresh() {
        const d = getActivity6RunDraft(runId);
        if (d) setDraft(d);
    }

    function goToReaction() {
        navigation.navigate("A6ReactionTrial", {activityId, runId});
    }

    function goToTracing() {
        navigation.navigate("A6TracingChallenge", {activityId, runId});
    }

    function goToSubmit() {
        navigation.navigate("A6ReflectionSubmit", {activityId, runId});
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

    const summaries: A6ParticipantSummary[] = metrics.participantSummaries ?? [];

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container}>
                <View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between"}}>
                    <Text style={styles.title}>Results Dashboard</Text>
                    <Pressable style={styles.ghostBtn} onPress={refresh}>
                        <Text style={styles.ghostBtnText}>Refresh</Text>
                    </Pressable>
                </View>

                <Text style={styles.sub}>
                    Review reaction speed, consistency, and tracing accuracy. Leaderboard eligibility requires meeting
                    the accuracy threshold.
                </Text>

                {/* Highlights */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Highlights</Text>

                    <View style={styles.pillWrap}>
                        <Pill label={`Accuracy threshold: ${fmtPct(eligibility.threshold)}`}/>
                        <Pill label={eligibility.eligible ? "Leaderboard: Eligible ✅" : "Leaderboard: Not eligible"}/>
                    </View>

                    <Divider/>

                    <MetricRow
                        label="Fastest participant (lowest overall mean reaction time)"
                        value={highlights?.fastestName ? `${highlights.fastestName} • ${fmtMs(highlights.fastestOverall)}` : "—"}
                        hint="Overall mean is averaged across hands (when available)."
                    />

                    <MetricRow
                        label="Most accurate tracing"
                        value={highlights?.mostAccName ? `${highlights.mostAccName} • ${fmtPct(highlights.bestAcc)}` : "—"}
                        hint="Accuracy is computed from average deviation versus max allowed deviation."
                    />
                </View>

                {/* Team-level summary */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Team Summary</Text>

                    <MetricRow
                        label="Team mean reaction time"
                        value={fmtMs(leaderboard?.teamMeanReactionTimeMs)}
                        hint="Computed from participants who have reaction data."
                    />

                    <MetricRow
                        label="Tracing accuracy (min / avg)"
                        value={
                            leaderboard
                                ? `${fmtPct(leaderboard.minTracingAccuracyPct)} / ${fmtPct(leaderboard.avgTracingAccuracyPct)}`
                                : "—"
                        }
                        hint="Leaderboard eligibility requires every participant to meet the accuracy threshold."
                    />
                </View>

                {/* Per participant breakdown */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Per Participant Breakdown</Text>
                    <Text style={styles.help}>
                        Mean reaction time ranks speed. Standard deviation ranks consistency (lower = more consistent).
                    </Text>

                    <Divider/>

                    {summaries.length === 0 ? (
                        <Text style={styles.empty}>No results yet. Record reaction trials and tracing first.</Text>
                    ) : (
                        summaries.map((s) => {
                            const name = participantName(draft, s.participantId);

                            const dom = s.dominant;
                            const non = s.nonDominant;

                            const overall = s.overallMeanReactionTimeMs;

                            const betterHand =
                                dom?.meanReactionTimeMs != null && non?.meanReactionTimeMs != null
                                    ? dom.meanReactionTimeMs < non.meanReactionTimeMs
                                        ? "Dominant faster"
                                        : dom.meanReactionTimeMs > non.meanReactionTimeMs
                                            ? "Non-dominant faster"
                                            : "Equal"
                                    : undefined;

                            const minFastest = minDefined([dom?.fastestReactionTimeMs, non?.fastestReactionTimeMs]);

                            return (
                                <View key={s.participantId} style={styles.participantCard}>
                                    <View style={{
                                        flexDirection: "row",
                                        justifyContent: "space-between",
                                        alignItems: "baseline"
                                    }}>
                                        <Text style={styles.participantName}>{name}</Text>
                                        <Text style={styles.participantMeta}>
                                            Overall mean: <Text style={{fontWeight: "900"}}>{fmtMs(overall)}</Text>
                                        </Text>
                                    </View>

                                    {betterHand ? <Text style={styles.participantHint}>{betterHand}</Text> : null}

                                    <View style={styles.grid2}>
                                        <View style={styles.gridBox}>
                                            <Text style={styles.gridTitle}>Dominant hand</Text>
                                            <MetricRow label="Trials (N)" value={fmtN(dom?.n)}/>
                                            <MetricRow label="Mean" value={fmtMs(dom?.meanReactionTimeMs)}/>
                                            <MetricRow label="Std dev" value={fmtMs(dom?.stdDevReactionTimeMs)}/>
                                        </View>

                                        <View style={styles.gridBox}>
                                            <Text style={styles.gridTitle}>Non-dominant hand</Text>
                                            <MetricRow label="Trials (N)" value={fmtN(non?.n)}/>
                                            <MetricRow label="Mean" value={fmtMs(non?.meanReactionTimeMs)}/>
                                            <MetricRow label="Std dev" value={fmtMs(non?.stdDevReactionTimeMs)}/>
                                        </View>
                                    </View>

                                    <View style={{marginTop: 10}}>
                                        <MetricRow
                                            label="Fastest single reaction (either hand)"
                                            value={fmtMs(minFastest)}
                                        />
                                        <MetricRow
                                            label="Tracing accuracy"
                                            value={fmtPct(s.tracingAccuracyPct)}
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
                                Reaction trials and tracing results are present. You can continue to the reflection
                                page.
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.missingBox}>
                            <Text style={styles.missingTitle}>Complete these experiment items first</Text>
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
                        Video evidence is optional.
                    </Text>

                    <Divider/>

                    <Text style={styles.noteText}>
                        You will complete:
                    </Text>
                    <Text style={styles.noteItem}>• Reflection text</Text>
                    <Text style={styles.noteItem}>• Rating (1–5)</Text>
                    <Text style={styles.noteItem}>• GPS permission / coordinate check</Text>
                    <Text style={styles.noteItem}>• Optional session video</Text>
                </View>

                {/* Actions */}
                <View style={{marginTop: 14, flexDirection: "row", gap: 10}}>
                    <Pressable style={styles.secondaryBtn} onPress={goToReaction}>
                        <Text style={styles.secondaryBtnText}>Back to Reaction</Text>
                    </Pressable>

                    <Pressable style={styles.secondaryBtn} onPress={goToTracing}>
                        <Text style={styles.secondaryBtnText}>Back to Tracing</Text>
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
    container: {flexGrow: 1, padding: 20, backgroundColor: "#fff"},
    center: {flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff"},

    title: {fontSize: 24, fontWeight: "900"},
    sub: {marginTop: 8, opacity: 0.7, lineHeight: 20},

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

    cardTitle: {fontSize: 16, fontWeight: "900"},
    help: {marginTop: 6, opacity: 0.75, lineHeight: 18},

    divider: {height: 1, backgroundColor: "#eee", marginVertical: 12},

    pillWrap: {marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10},
    pill: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#ddd",
        backgroundColor: "#fafafa",
    },
    pillText: {fontWeight: "900", opacity: 0.85},

    metricRow: {flexDirection: "row", alignItems: "center", paddingVertical: 6},
    metricLabel: {fontWeight: "800", opacity: 0.8},
    metricHint: {marginTop: 2, opacity: 0.65, fontSize: 12, lineHeight: 16},
    metricValue: {fontWeight: "900", marginLeft: 10},

    participantName: {fontSize: 16, fontWeight: "900"},
    participantMeta: {opacity: 0.75},
    participantHint: {marginTop: 6, opacity: 0.75, fontWeight: "800"},

    grid2: {marginTop: 12, flexDirection: "row", gap: 10},
    gridBox: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 12,
        padding: 12,
        backgroundColor: "white"
    },
    gridTitle: {fontWeight: "900", marginBottom: 6},

    empty: {marginTop: 8, opacity: 0.7},

    readyBox: {padding: 14, borderRadius: 12, backgroundColor: "#f3f4f6"},
    readyTitle: {fontWeight: "900"},
    readyText: {marginTop: 6, opacity: 0.75, lineHeight: 18},

    missingBox: {
        padding: 14,
        borderRadius: 12,
        backgroundColor: "#fff7ed",
        borderWidth: 1,
        borderColor: "#fed7aa"
    },
    missingTitle: {fontWeight: "900"},
    missingItem: {marginTop: 8, opacity: 0.85, lineHeight: 18},

    noteText: {opacity: 0.8, fontWeight: "800"},
    noteItem: {marginTop: 8, opacity: 0.8, lineHeight: 18},

    btnDisabled: {opacity: 0.5},

    primaryBtnWide: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900"},

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

    ghostBtn: {
        borderWidth: 1,
        borderColor: "#ddd",
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: "white",
    },
    ghostBtnText: {fontWeight: "900", opacity: 0.85},
});