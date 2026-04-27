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

import ActivityBarChart from "../../../components/charts/ActivityBarChart";
import ResultsInsightCard from "../../../components/insights/ResultsInsightCard";
import {
    buildA7Visualization,
    type A7RecoveryParticipant,
} from "../../../services/resultInsights/activity7VisualizationService";

import PerformanceFeedbackCard from "../../../components/feedback/PerformanceFeedbackCard";
import {generatePerformanceFeedback} from "../../../services/performanceFeedback/performanceFeedbackService";


type Props = NativeStackScreenProps<AppStackParamList, "A7Results">;

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
}

function mean(xs: number[]): number | undefined {
    if (!xs.length) return undefined;
    return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function fmtBpm(v?: number): string {
    if (!isFiniteNumber(v)) return "—";
    return `${v.toFixed(1)} BPM`;
}

function fmtDelta(v?: number): string {
    if (!isFiniteNumber(v)) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(1)} BPM`;
}

function fmtScore(v?: number): string {
    if (!isFiniteNumber(v)) return "—";
    return v.toFixed(3);
}

function fmtN(v?: number): string {
    if (!isFiniteNumber(v)) return "—";
    return `${Math.round(v)}`;
}

function participantName(d: Activity7RunDraft, participantId: string): string {
    return d.session.participants.find(p => p.id === participantId)?.name ?? "—";
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

function getPredictionVerdict(errors: Array<number | undefined>): string {
    const vals = errors.filter(isFiniteNumber);
    if (!vals.length) return "Not enough data";

    const avg = mean(vals);
    if (!isFiniteNumber(avg)) return "Not enough data";
    if (avg <= 2) return "Very close";
    if (avg <= 5) return "Reasonably close";
    if (avg <= 10) return "Partly correct";

    return "Not very close";
}

function minDefined(xs: Array<number | undefined>): number | undefined {
    const vals = xs.filter(isFiniteNumber);
    return vals.length ? Math.min(...vals) : undefined;
}

function maxDefined(xs: Array<number | undefined>): number | undefined {
    const vals = xs.filter(isFiniteNumber);
    return vals.length ? Math.max(...vals) : undefined;
}

function getHighestPhaseLabel(s: A7ParticipantSummary): string {
    const candidates = [
        {label: "Rest", value: s.restBpm},
        {label: "Post-Jog", value: s.postJogBpm},
        {label: "Post-Star-Jumps", value: s.postStarJumpBpm},
    ].filter(item => isFiniteNumber(item.value));

    if (!candidates.length) return "—";

    candidates.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return candidates[0].label;
}

function Pill({label}: { label: string }): React.JSX.Element {
    return (
        <View style={styles.pill}>
            <Text style={styles.pillText}>{label}</Text>
        </View>
    );
}

function Divider(): React.JSX.Element {
    return <View style={styles.divider}/>;
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

export default function A7ResultsScreen({
                                            route,
                                            navigation,
                                        }: Props): React.JSX.Element | null {
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
        const bestSummary = summaries.find(
            summary => summary.participantId === bestId
        );

        const bestParticipantName = bestId
            ? participantName(draft, bestId)
            : undefined;

        const lowestRest = minDefined(summaries.map(s => s.restBpm));

        const highestExercise = maxDefined([
            ...summaries.map(s => s.postJogBpm),
            ...summaries.map(s => s.postStarJumpBpm),
        ]);

        const avgPredictionAbsError = mean(
            summaries.flatMap(summary =>
                [
                    summary.prediction?.restAbsError,
                    summary.prediction?.postJogAbsError,
                    summary.prediction?.postStarJumpAbsError,
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

    const visualization = useMemo(() => {
        if (!draft || !metrics) {
            return buildA7Visualization({
                phaseAverages: {},
                participants: [],
            });
        }

        const participants: A7RecoveryParticipant[] =
            metrics.participantSummaries.map(summary => ({
                label: participantName(draft, summary.participantId),
                recoveryConsistencyScore: summary.recoveryConsistencyScore,
            }));

        return buildA7Visualization({
            phaseAverages: {
                restBpm: metrics.avgRestBpm,
                postJogBpm: metrics.avgPostJogBpm,
                postStarJumpBpm: metrics.avgPostStarJumpBpm,
            },
            participants,
        });
    }, [draft, metrics]);

    const performanceFeedback = useMemo(() => {
        if (!metrics) return null;

        const trials = metrics.participantSummaries.flatMap(summary => {
            const arr: Array<{
                label: string;
                restingBpm: number;
                postExerciseBpm: number;
            }> = [];

            if (
                summary.restBpm != null &&
                summary.postJogBpm != null
            ) {
                arr.push({
                    label: `${summary.participantId}-jog`,
                    restingBpm: summary.restBpm,
                    postExerciseBpm: summary.postJogBpm,
                });
            }

            if (
                summary.restBpm != null &&
                summary.postStarJumpBpm != null
            ) {
                arr.push({
                    label: `${summary.participantId}-star`,
                    restingBpm: summary.restBpm,
                    postExerciseBpm: summary.postStarJumpBpm,
                });
            }

            return arr;
        });

        return generatePerformanceFeedback("activity7", {trials});
    }, [metrics]);

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
                <Text style={styles.loadingText}>Loading…</Text>
            </View>
        );
    }

    const summaries: A7ParticipantSummary[] =
        metrics.participantSummaries ?? [];
    const prediction = draft.prediction;

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
                    Review breathing rate at rest and after exercise, compare
                    changes between phases, and check recovery consistency.
                    Lower recovery consistency score is better for leaderboard
                    ranking.
                </Text>

                <View style={styles.hero}>
                    <Text style={styles.heroTitle}>
                        Best Recovery Consistency
                    </Text>
                    <Text style={styles.heroScore}>
                        {visualization.bestRecovery?.recoveryConsistencyScore !=
                        null
                            ? visualization.bestRecovery.recoveryConsistencyScore.toFixed(
                                3
                            )
                            : "—"}
                    </Text>
                    <Text style={styles.heroMeta}>
                        {visualization.bestRecovery?.label ??
                            "Complete breathing measurements to calculate this."}
                    </Text>
                    <Text style={styles.heroHint}>
                        Lower recovery consistency score indicates a more stable
                        breathing recovery pattern.
                    </Text>
                </View>

                <ActivityBarChart
                    title="Average Breathing Rate by Phase"
                    subtitle="Team average BPM at rest and after exercise"
                    data={visualization.phaseChartData}
                    unitLabel="BPM"
                />

                <ActivityBarChart
                    title="Recovery Consistency Comparison"
                    subtitle="Lower scores indicate more stable recovery patterns"
                    data={visualization.recoveryChartData}
                    unitLabel="score"
                />

                <ResultsInsightCard insight={visualization.insight}/>

                {performanceFeedback && (
                    <PerformanceFeedbackCard feedback={performanceFeedback}/>
                )}

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Highlights</Text>

                    <View style={styles.pillWrap}>
                        <Pill
                            label={
                                leaderboardEligible
                                    ? "Leaderboard: Eligible"
                                    : "Leaderboard: Not eligible"
                            }
                        />
                        <Pill
                            label={
                                prediction
                                    ? `Prediction entered: Rest ${fmtN(
                                        prediction.predictedRestBpm
                                    )} / After exercise ${fmtN(
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
                                ? `${highlights.bestParticipantName} • ${fmtScore(
                                    highlights.bestRecoveryScore
                                )}`
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
                                ? `${highlights!.avgPredictionAbsError!.toFixed(
                                    1
                                )} BPM`
                                : "—"
                        }
                        hint="Average absolute error across all available measured-vs-predicted values."
                    />
                </View>

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
                        value={fmtScore(
                            leaderboard?.teamRecoveryConsistencyScore
                        )}
                        hint="Lower team score indicates more consistent recovery patterns across participants."
                    />

                    <MetricRow
                        label="Best participant result"
                        value={
                            leaderboard?.bestParticipantId
                                ? `${participantName(
                                    draft,
                                    leaderboard.bestParticipantId
                                )} • ${fmtScore(
                                    leaderboard.bestParticipantRecoveryConsistencyScore
                                )}`
                                : "—"
                        }
                        hint="Best participant is the one with the lowest recovery consistency score."
                    />
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>
                        Per Participant Breakdown
                    </Text>
                    <Text style={styles.help}>
                        Compare each participant’s breathing rate at rest and
                        after exercise, then review deltas, recovery
                        consistency, and prediction accuracy.
                    </Text>

                    <Divider/>

                    {summaries.length === 0 ? (
                        <Text style={styles.empty}>
                            No results yet. Record all breathing measurements
                            first.
                        </Text>
                    ) : (
                        summaries.map(summary => {
                            const name = participantName(
                                draft,
                                summary.participantId
                            );

                            const verdict = getPredictionVerdict([
                                summary.prediction?.restAbsError,
                                summary.prediction?.postJogAbsError,
                                summary.prediction?.postStarJumpAbsError,
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
                                            Recovery score:{" "}
                                            <Text style={styles.bold}>
                                                {fmtScore(
                                                    summary.recoveryConsistencyScore
                                                )}
                                            </Text>
                                        </Text>
                                    </View>

                                    <Text style={styles.participantHint}>
                                        Highest measured phase:{" "}
                                        {getHighestPhaseLabel(summary)}
                                    </Text>

                                    <View style={styles.grid2}>
                                        <View style={styles.gridBox}>
                                            <Text style={styles.gridTitle}>
                                                Measured breathing rates
                                            </Text>
                                            <MetricRow
                                                label="Rest"
                                                value={fmtBpm(summary.restBpm)}
                                            />
                                            <MetricRow
                                                label="Post-Jog"
                                                value={fmtBpm(
                                                    summary.postJogBpm
                                                )}
                                            />
                                            <MetricRow
                                                label="Post-Star-Jumps"
                                                value={fmtBpm(
                                                    summary.postStarJumpBpm
                                                )}
                                            />
                                        </View>

                                        <View style={styles.gridBox}>
                                            <Text style={styles.gridTitle}>
                                                Phase changes
                                            </Text>
                                            <MetricRow
                                                label="Rest → Jog"
                                                value={fmtDelta(
                                                    summary.deltaRestToJog
                                                )}
                                            />
                                            <MetricRow
                                                label="Rest → Star Jumps"
                                                value={fmtDelta(
                                                    summary.deltaRestToStarJump
                                                )}
                                            />
                                            <MetricRow
                                                label="Jog → Star Jumps"
                                                value={fmtDelta(
                                                    summary.deltaJogToStarJump
                                                )}
                                            />
                                        </View>
                                    </View>

                                    <View style={styles.predictionBlock}>
                                        <MetricRow
                                            label="Prediction verdict"
                                            value={verdict}
                                            hint="Judged from available absolute error values."
                                        />

                                        <MetricRow
                                            label="Rest prediction error"
                                            value={
                                                isFiniteNumber(
                                                    summary.prediction
                                                        ?.restAbsError
                                                )
                                                    ? `${summary.prediction!.restAbsError!.toFixed(
                                                        1
                                                    )} BPM`
                                                    : "—"
                                            }
                                        />

                                        <MetricRow
                                            label="Post-Jog prediction error"
                                            value={
                                                isFiniteNumber(
                                                    summary.prediction
                                                        ?.postJogAbsError
                                                )
                                                    ? `${summary.prediction!.postJogAbsError!.toFixed(
                                                        1
                                                    )} BPM`
                                                    : "—"
                                            }
                                        />

                                        <MetricRow
                                            label="Post-Star-Jumps prediction error"
                                            value={
                                                isFiniteNumber(
                                                    summary.prediction
                                                        ?.postStarJumpAbsError
                                                )
                                                    ? `${summary.prediction!.postStarJumpAbsError!.toFixed(
                                                        1
                                                    )} BPM`
                                                    : "—"
                                            }
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
                                All required breathing measurements and computed
                                datasets are present. You can continue to the
                                reflection page.
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
                        Reflection & Submit screen. Video evidence remains
                        optional.
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
                        onPress={goToMeasurements}
                    >
                        <Text style={styles.secondaryBtnText}>
                            Back to Measurements
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
    predictionBlock: {
        marginTop: 10,
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
    btnDisabled: {
        opacity: 0.5,
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