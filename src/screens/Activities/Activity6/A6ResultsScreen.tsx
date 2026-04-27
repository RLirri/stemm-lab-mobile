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

import ActivityBarChart from "../../../components/charts/ActivityBarChart";
import ResultsInsightCard from "../../../components/insights/ResultsInsightCard";
import {
    buildA6Visualization,
    type A6VisualizationParticipant,
} from "../../../services/resultInsights/activity6VisualizationService";

import PerformanceFeedbackCard from "../../../components/feedback/PerformanceFeedbackCard";
import {generatePerformanceFeedback} from "../../../services/performanceFeedback/performanceFeedbackService";

type Props = NativeStackScreenProps<AppStackParamList, "A6Results">;

function fmtMs(v?: number): string {
    if (v == null || !Number.isFinite(v)) return "—";
    return `${Math.round(v)} ms`;
}

function fmtPct(v?: number): string {
    if (v == null || !Number.isFinite(v)) return "—";
    return `${Math.round(v)}%`;
}

function fmtN(v?: number): string {
    if (v == null || !Number.isFinite(v)) return "—";
    return `${Math.round(v)}`;
}

function participantName(d: Activity6RunDraft, pid: string): string {
    return d.session.participants.find(p => p.id === pid)?.name ?? "—";
}

function isFiniteNum(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function minDefined(xs: Array<number | undefined>): number | undefined {
    const values = xs.filter(isFiniteNum);
    return values.length ? Math.min(...values) : undefined;
}

function stripReflectionBlockingItems(missing: string[]): string[] {
    return missing.filter(
        item =>
            ![
                "Reflection text",
                "Rating (1–5)",
                "GPS permission granted",
                "GPS coordinates captured",
            ].includes(item)
    );
}

function Pill({label}: { label: string }): React.JSX.Element {
    return (
        <View style={styles.pill}>
            <Text style={styles.pillText}>{label}</Text>
        </View>
    );
}

function MetricRow(props: {
    label: string;
    value: string;
    hint?: string;
}): React.JSX.Element {
    return (
        <View style={styles.metricRow}>
            <View style={styles.metricTextBlock}>
                <Text style={styles.metricLabel}>{props.label}</Text>
                {props.hint ? (
                    <Text style={styles.metricHint}>{props.hint}</Text>
                ) : null}
            </View>
            <Text style={styles.metricValue}>{props.value}</Text>
        </View>
    );
}

function Divider(): React.JSX.Element {
    return <View style={styles.divider}/>;
}

export default function A6ResultsScreen({
                                            route,
                                            navigation,
                                        }: Props): React.JSX.Element | null {
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

        const fastestName = fastestId
            ? participantName(draft, fastestId)
            : undefined;
        const mostAccName = mostAccurateId
            ? participantName(draft, mostAccurateId)
            : undefined;

        const fastestSummary = metrics.participantSummaries.find(
            summary => summary.participantId === fastestId
        );

        const accSummary = metrics.participantSummaries.find(
            summary => summary.participantId === mostAccurateId
        );

        return {
            fastestName,
            fastestOverall: fastestSummary?.overallMeanReactionTimeMs,
            mostAccName,
            bestAcc: accSummary?.tracingAccuracyPct,
        };
    }, [draft, metrics]);

    const visualization = useMemo(() => {
        if (!draft || !metrics) {
            return buildA6Visualization([]);
        }


        const participants: A6VisualizationParticipant[] =
            metrics.participantSummaries.map(summary => ({
                label: participantName(draft, summary.participantId),
                reactionTimeMs: summary.overallMeanReactionTimeMs,
                tracingAccuracyPct: summary.tracingAccuracyPct,
            }));

        return buildA6Visualization(participants);
    }, [draft, metrics]);

    const performanceFeedback = useMemo(() => {
        if (!metrics) return null;

        const trials = metrics.participantSummaries.flatMap(summary => {
            const arr: Array<{
                label: string;
                reactionTime: number;
                hand: "dominant" | "non-dominant";
            }> = [];

            if (summary.dominant?.meanReactionTimeMs != null) {
                arr.push({
                    label: `${summary.participantId}-dominant`,
                    reactionTime: summary.dominant.meanReactionTimeMs,
                    hand: "dominant",
                });
            }

            if (summary.nonDominant?.meanReactionTimeMs != null) {
                arr.push({
                    label: `${summary.participantId}-non-dominant`,
                    reactionTime: summary.nonDominant.meanReactionTimeMs,
                    hand: "non-dominant",
                });
            }

            return arr;
        });

        return generatePerformanceFeedback("activity6", {trials});
    }, [metrics]);

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
                <Text style={styles.loadingText}>Loading…</Text>
            </View>
        );
    }

    const summaries: A6ParticipantSummary[] =
        metrics.participantSummaries ?? [];

    return (
        <KeyboardAvoidingView
            style={styles.flex}
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
                    Review reaction speed, consistency, and tracing accuracy.
                    Leaderboard eligibility requires meeting the accuracy
                    threshold.
                </Text>

                <View style={styles.hero}>
                    <Text style={styles.heroTitle}>Fastest Reaction</Text>
                    <Text style={styles.heroScore}>
                        {visualization.fastest?.reactionTimeMs != null
                            ? fmtMs(visualization.fastest.reactionTimeMs)
                            : "—"}
                    </Text>
                    <Text style={styles.heroMeta}>
                        {visualization.fastest?.label ??
                            "Complete reaction trials to calculate this."}
                    </Text>
                    <Text style={styles.heroHint}>
                        Lower reaction time means faster response performance.
                    </Text>
                </View>

                <ActivityBarChart
                    title="Reaction Time Comparison"
                    subtitle="Overall mean reaction time by participant. Lower bars are better."
                    data={visualization.reactionChartData}
                    unitLabel="ms"
                />

                <ActivityBarChart
                    title="Tracing Accuracy Comparison"
                    subtitle="Tracing accuracy by participant. Higher bars are better."
                    data={visualization.accuracyChartData}
                    unitLabel="%"
                />

                <ResultsInsightCard insight={visualization.insight}/>
                
                {performanceFeedback ? (
                    <PerformanceFeedbackCard feedback={performanceFeedback}/>
                ) : null}

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Highlights</Text>

                    <View style={styles.pillWrap}>
                        <Pill
                            label={`Accuracy threshold: ${fmtPct(
                                eligibility.threshold
                            )}`}
                        />
                        <Pill
                            label={
                                eligibility.eligible
                                    ? "Leaderboard: Eligible"
                                    : "Leaderboard: Not eligible"
                            }
                        />
                    </View>

                    <Divider/>

                    <MetricRow
                        label="Fastest participant"
                        value={
                            highlights?.fastestName
                                ? `${highlights.fastestName} • ${fmtMs(
                                    highlights.fastestOverall
                                )}`
                                : "—"
                        }
                        hint="Lowest overall mean reaction time."
                    />

                    <MetricRow
                        label="Most accurate tracing"
                        value={
                            highlights?.mostAccName
                                ? `${highlights.mostAccName} • ${fmtPct(
                                    highlights.bestAcc
                                )}`
                                : "—"
                        }
                        hint="Accuracy is computed from average deviation versus max allowed deviation."
                    />
                </View>

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
                                ? `${fmtPct(
                                    leaderboard.minTracingAccuracyPct
                                )} / ${fmtPct(
                                    leaderboard.avgTracingAccuracyPct
                                )}`
                                : "—"
                        }
                        hint="Leaderboard eligibility requires every participant to meet the accuracy threshold."
                    />
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                        Per Participant Breakdown
                    </Text>
                    <Text style={styles.help}>
                        Mean reaction time ranks speed. Standard deviation
                        ranks consistency. Lower values are better for both.
                    </Text>

                    <Divider/>

                    {summaries.length === 0 ? (
                        <Text style={styles.empty}>
                            No results yet. Record reaction trials and tracing
                            first.
                        </Text>
                    ) : (
                        summaries.map(summary => {
                            const name = participantName(
                                draft,
                                summary.participantId
                            );

                            const dominant = summary.dominant;
                            const nonDominant = summary.nonDominant;
                            const overall =
                                summary.overallMeanReactionTimeMs;

                            const betterHand =
                                dominant?.meanReactionTimeMs != null &&
                                nonDominant?.meanReactionTimeMs != null
                                    ? dominant.meanReactionTimeMs <
                                    nonDominant.meanReactionTimeMs
                                        ? "Dominant faster"
                                        : dominant.meanReactionTimeMs >
                                        nonDominant.meanReactionTimeMs
                                            ? "Non-dominant faster"
                                            : "Equal"
                                    : undefined;

                            const minFastest = minDefined([
                                dominant?.fastestReactionTimeMs,
                                nonDominant?.fastestReactionTimeMs,
                            ]);

                            return (
                                <View
                                    key={summary.participantId}
                                    style={styles.participantCard}
                                >
                                    <View style={styles.participantHeader}>
                                        <Text style={styles.participantName}>
                                            {name}
                                        </Text>
                                        <Text style={styles.participantMeta}>
                                            Overall mean:{" "}
                                            <Text style={styles.bold}>
                                                {fmtMs(overall)}
                                            </Text>
                                        </Text>
                                    </View>

                                    {betterHand ? (
                                        <Text style={styles.participantHint}>
                                            {betterHand}
                                        </Text>
                                    ) : null}

                                    <View style={styles.grid2}>
                                        <View style={styles.gridBox}>
                                            <Text style={styles.gridTitle}>
                                                Dominant hand
                                            </Text>
                                            <MetricRow
                                                label="Trials"
                                                value={fmtN(dominant?.n)}
                                            />
                                            <MetricRow
                                                label="Mean"
                                                value={fmtMs(
                                                    dominant?.meanReactionTimeMs
                                                )}
                                            />
                                            <MetricRow
                                                label="Std dev"
                                                value={fmtMs(
                                                    dominant?.stdDevReactionTimeMs
                                                )}
                                            />
                                        </View>

                                        <View style={styles.gridBox}>
                                            <Text style={styles.gridTitle}>
                                                Non-dominant hand
                                            </Text>
                                            <MetricRow
                                                label="Trials"
                                                value={fmtN(nonDominant?.n)}
                                            />
                                            <MetricRow
                                                label="Mean"
                                                value={fmtMs(
                                                    nonDominant?.meanReactionTimeMs
                                                )}
                                            />
                                            <MetricRow
                                                label="Std dev"
                                                value={fmtMs(
                                                    nonDominant?.stdDevReactionTimeMs
                                                )}
                                            />
                                        </View>
                                    </View>

                                    <View style={styles.participantFooter}>
                                        <MetricRow
                                            label="Fastest single reaction"
                                            value={fmtMs(minFastest)}
                                        />
                                        <MetricRow
                                            label="Tracing accuracy"
                                            value={fmtPct(
                                                summary.tracingAccuracyPct
                                            )}
                                        />
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Experiment Readiness</Text>
                    <Text style={styles.help}>
                        You can continue to Reflection & Submit once the
                        experiment data is complete.
                    </Text>

                    <Divider/>

                    {experimentBlockingMissing.length === 0 ? (
                        <View style={styles.readyBox}>
                            <Text style={styles.readyTitle}>
                                Ready for Reflection
                            </Text>
                            <Text style={styles.readyText}>
                                Reaction trials and tracing results are present.
                                You can continue to the reflection page.
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.missingBox}>
                            <Text style={styles.missingTitle}>
                                Complete these experiment items first
                            </Text>
                            {experimentBlockingMissing.map((item, index) => (
                                <Text
                                    key={`${item}_${index}`}
                                    style={styles.missingItem}
                                >
                                    • {item}
                                </Text>
                            ))}
                        </View>
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Final Submission Notes</Text>
                    <Text style={styles.help}>
                        Reflection, rating, and GPS are completed in the
                        Reflection & Submit screen. Video evidence is optional.
                    </Text>

                    <Divider/>

                    <Text style={styles.noteText}>You will complete:</Text>
                    <Text style={styles.noteItem}>• Reflection text</Text>
                    <Text style={styles.noteItem}>• Rating (1–5)</Text>
                    <Text style={styles.noteItem}>
                        • GPS permission / coordinate check
                    </Text>
                    <Text style={styles.noteItem}>• Optional session video</Text>
                </View>

                <View style={styles.actionRow}>
                    <Pressable
                        style={styles.secondaryBtn}
                        onPress={goToReaction}
                    >
                        <Text style={styles.secondaryBtnText}>
                            Back to Reaction
                        </Text>
                    </Pressable>

                    <Pressable
                        style={styles.secondaryBtn}
                        onPress={goToTracing}
                    >
                        <Text style={styles.secondaryBtnText}>
                            Back to Tracing
                        </Text>
                    </Pressable>
                </View>

                <Pressable
                    style={[
                        styles.primaryBtnWide,
                        !canProceedToReflection && styles.btnDisabled,
                    ]}
                    disabled={!canProceedToReflection}
                    onPress={goToSubmit}
                >
                    <Text style={styles.primaryBtnText}>
                        Go to Reflection & Submit
                    </Text>
                </Pressable>

                <View style={styles.bottomSpace}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
    container: {
        flexGrow: 1,
        padding: 20,
        backgroundColor: "#FFFFFF",
    },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
    },
    loadingText: {
        marginTop: 10,
        opacity: 0.7,
        color: "#344054",
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    title: {
        fontSize: 26,
        fontWeight: "900",
        color: "#172033",
        flex: 1,
    },
    sub: {
        marginTop: 8,
        opacity: 0.75,
        lineHeight: 20,
        color: "#344054",
    },
    hero: {
        marginTop: 16,
        borderRadius: 16,
        backgroundColor: "#111827",
        padding: 16,
    },
    heroTitle: {
        color: "#FFFFFF",
        fontWeight: "900",
        opacity: 0.9,
    },
    heroScore: {
        color: "#FFFFFF",
        fontWeight: "900",
        fontSize: 36,
        marginTop: 6,
    },
    heroMeta: {
        color: "#FFFFFF",
        opacity: 0.9,
        marginTop: 4,
    },
    heroHint: {
        color: "#FFFFFF",
        opacity: 0.65,
        marginTop: 8,
        lineHeight: 18,
    },
    card: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#FAFAFA",
        borderRadius: 14,
        padding: 14,
    },
    participantCard: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: "900",
        color: "#172033",
    },
    help: {
        marginTop: 6,
        opacity: 0.75,
        lineHeight: 18,
        color: "#344054",
    },
    divider: {
        height: 1,
        backgroundColor: "#E5E7EB",
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
        borderColor: "#E5E7EB",
        backgroundColor: "#FFFFFF",
    },
    pillText: {
        fontWeight: "900",
        color: "#172033",
    },
    metricRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
        gap: 10,
    },
    metricTextBlock: {
        flex: 1,
    },
    metricLabel: {
        fontWeight: "800",
        opacity: 0.85,
        color: "#172033",
    },
    metricHint: {
        marginTop: 2,
        opacity: 0.65,
        fontSize: 12,
        lineHeight: 16,
        color: "#344054",
    },
    metricValue: {
        fontWeight: "900",
        color: "#172033",
        textAlign: "right",
    },
    participantHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 10,
    },
    participantName: {
        fontSize: 16,
        fontWeight: "900",
        color: "#172033",
    },
    participantMeta: {
        opacity: 0.75,
        color: "#344054",
        textAlign: "right",
        flexShrink: 1,
    },
    participantHint: {
        marginTop: 6,
        opacity: 0.75,
        fontWeight: "800",
        color: "#344054",
    },
    participantFooter: {
        marginTop: 10,
    },
    bold: {
        fontWeight: "900",
        color: "#172033",
    },
    grid2: {
        marginTop: 12,
        flexDirection: "row",
        gap: 10,
    },
    gridBox: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        borderRadius: 12,
        padding: 12,
        backgroundColor: "#FAFAFA",
    },
    gridTitle: {
        fontWeight: "900",
        marginBottom: 6,
        color: "#172033",
    },
    empty: {
        marginTop: 8,
        opacity: 0.7,
        color: "#344054",
    },
    readyBox: {
        padding: 14,
        borderRadius: 12,
        backgroundColor: "#F3F4F6",
    },
    readyTitle: {
        fontWeight: "900",
        color: "#172033",
    },
    readyText: {
        marginTop: 6,
        opacity: 0.75,
        lineHeight: 18,
        color: "#344054",
    },
    missingBox: {
        padding: 14,
        borderRadius: 12,
        backgroundColor: "#FFF7ED",
        borderWidth: 1,
        borderColor: "#FED7AA",
    },
    missingTitle: {
        fontWeight: "900",
        color: "#172033",
    },
    missingItem: {
        marginTop: 8,
        opacity: 0.85,
        lineHeight: 18,
        color: "#344054",
    },
    noteText: {
        opacity: 0.8,
        fontWeight: "800",
        color: "#172033",
    },
    noteItem: {
        marginTop: 8,
        opacity: 0.8,
        lineHeight: 18,
        color: "#344054",
    },
    actionRow: {
        marginTop: 14,
        flexDirection: "row",
        gap: 10,
    },
    btnDisabled: {
        opacity: 0.5,
    },
    primaryBtnWide: {
        marginTop: 14,
        backgroundColor: "#111827",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {
        color: "#FFFFFF",
        fontWeight: "900",
    },
    secondaryBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#111827",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor: "#FFFFFF",
    },
    secondaryBtnText: {
        fontWeight: "900",
        color: "#111827",
    },
    ghostBtn: {
        borderWidth: 1,
        borderColor: "#E5E7EB",
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: "#FFFFFF",
    },
    ghostBtnText: {
        fontWeight: "900",
        color: "#172033",
    },
    bottomSpace: {
        height: 40,
    },
});