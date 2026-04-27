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

import A5SmoothnessComparisonChart, {
    type A5SmoothnessComparisonPoint,
} from "../../../components/charts/A5SmoothnessComparisonChart";
import ResultsInsightCard from "../../../components/insights/ResultsInsightCard";
import PerformanceFeedbackCard from "../../../components/feedback/PerformanceFeedbackCard";
import type {ResultInsight} from "../../../types/visualization";
import {generatePerformanceFeedback} from "../../../services/performanceFeedback/performanceFeedbackService";

type Props = NativeStackScreenProps<AppStackParamList, "A5Results">;

const SMOOTHNESS_SCALE = 100;

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function clampNum(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function fmt(n: number | undefined, digits = 1): string {
    if (!isFiniteNumber(n)) return "—";
    return n.toFixed(digits);
}

function fmtScaledSmooth(n: number | undefined, digits = 1): string {
    if (!isFiniteNumber(n)) return "—";
    return (n * SMOOTHNESS_SCALE).toFixed(digits);
}

function improvementScoreScaled(
    baselineSmooth?: number,
    feedbackSmooth?: number,
): number | undefined {
    if (!isFiniteNumber(baselineSmooth) || !isFiniteNumber(feedbackSmooth)) {
        return undefined;
    }

    const raw = baselineSmooth - feedbackSmooth;
    const clipped = Math.max(0, raw);
    const scaled = clipped * SMOOTHNESS_SCALE;

    return clampNum(scaled, 0, 1e12);
}

function latestTrial(
    trials: A5TrialDraft[],
    participantId: string,
    movementType: A5MovementType,
    mode: A5TrialMode,
): A5TrialDraft | undefined {
    return trials
        .filter(
            trial =>
                trial.participantId === participantId &&
                trial.movementType === movementType &&
                trial.mode === mode,
        )
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
}

export default function A5ResultsScreen({
                                            route,
                                            navigation,
                                        }: Props): React.JSX.Element | null {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity5RunDraft | null>(null);

    useEffect(() => {
        if (!user) return;

        const d = getActivity5RunDraft(runId);

        if (!d) {
            Alert.alert("Session not found", "Please restart Activity 5.", [
                {
                    text: "OK",
                    onPress: () =>
                        navigation.replace("A5SessionSetup", {activityId}),
                },
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
            baselineSmooth?: number;
            feedbackSmooth?: number;
            improvementScore?: number;
            baselineDuration?: number;
            baselineDisp?: number;
            feedbackDuration?: number;
            feedbackDisp?: number;
        }> = [];

        for (const participant of participants) {
            for (const movement of movements) {
                const baseline = latestTrial(
                    trials,
                    participant.id,
                    movement.type,
                    "baseline",
                );

                const feedback = latestTrial(
                    trials,
                    participant.id,
                    movement.type,
                    "feedback",
                );

                const baselineSmooth = baseline?.metrics?.smoothnessIndex;
                const feedbackSmooth = feedback?.metrics?.smoothnessIndex;

                rows.push({
                    participantId: participant.id,
                    participantName: participant.name,
                    movementType: movement.type,
                    movementTitle: movement.title,
                    baselineSmooth,
                    feedbackSmooth,
                    improvementScore: improvementScoreScaled(
                        baselineSmooth,
                        feedbackSmooth,
                    ),
                    baselineDuration: baseline?.metrics?.durationSec,
                    baselineDisp: baseline?.metrics?.displacementMagnitudeCm,
                    feedbackDuration: feedback?.metrics?.durationSec,
                    feedbackDisp: feedback?.metrics?.displacementMagnitudeCm,
                });
            }
        }

        return rows;
    }, [draft, movements, participants, trials]);

    const best = useMemo(() => {
        const cached = draft?.improvements ?? [];

        if (cached.length > 0) {
            const top = cached[0];
            const rawScore = top.improvementScore;

            const score = isFiniteNumber(rawScore)
                ? rawScore < 5
                    ? Math.max(0, rawScore) * SMOOTHNESS_SCALE
                    : Math.max(0, rawScore)
                : 0;

            const participantName =
                participants.find(p => p.id === top.participantId)?.name ??
                "—";

            const movementTitle =
                movements.find(m => m.type === top.movementType)?.title ??
                top.movementType;

            return {
                score,
                participantName,
                movementTitle,
            };
        }

        let bestScore = 0;
        let bestParticipantId = "";
        let bestMovementTitle = "";

        for (const row of table) {
            if (!isFiniteNumber(row.improvementScore)) continue;

            if (row.improvementScore > bestScore) {
                bestScore = row.improvementScore;
                bestParticipantId = row.participantId;
                bestMovementTitle = row.movementTitle;
            }
        }

        return {
            score: bestScore,
            participantName:
                participants.find(p => p.id === bestParticipantId)?.name ??
                "—",
            movementTitle: bestMovementTitle || "—",
        };
    }, [draft?.improvements, movements, participants, table]);

    const smoothnessComparisonData =
        useMemo<A5SmoothnessComparisonPoint[]>(() => {
            return table
                .filter(
                    row =>
                        isFiniteNumber(row.baselineSmooth) &&
                        isFiniteNumber(row.feedbackSmooth) &&
                        isFiniteNumber(row.improvementScore),
                )
                .map(row => ({
                    label: `${row.participantName}\n${row.movementTitle.replace(
                        "Movement ",
                        "M",
                    )}`,
                    baselineValue: Number(
                        ((row.baselineSmooth ?? 0) * SMOOTHNESS_SCALE).toFixed(
                            1,
                        ),
                    ),
                    feedbackValue: Number(
                        ((row.feedbackSmooth ?? 0) * SMOOTHNESS_SCALE).toFixed(
                            1,
                        ),
                    ),
                    improvementScore: Number(
                        (row.improvementScore ?? 0).toFixed(1),
                    ),
                }));
        }, [table]);

    const insight = useMemo<ResultInsight>(() => {
        const improvedRows = table
            .filter(row => isFiniteNumber(row.improvementScore))
            .sort(
                (a, b) =>
                    (b.improvementScore ?? 0) - (a.improvementScore ?? 0),
            );

        const bestRow = improvedRows[0];

        if (!bestRow) {
            return {
                title: "Not enough data",
                message:
                    "Complete baseline and feedback trials to generate smoothness insights.",
                severity: "neutral",
            };
        }

        const hasImproved = (bestRow.improvementScore ?? 0) > 0;

        return {
            title: hasImproved
                ? `Best improvement: ${bestRow.participantName}`
                : "No smoothness improvement detected",
            message: hasImproved
                ? `${bestRow.participantName} improved most in ${
                    bestRow.movementTitle
                }. The feedback trial reduced the smoothness index by ${fmt(
                    bestRow.improvementScore,
                    1,
                )} points, indicating smoother movement after feedback.`
                : "The feedback trials did not produce a lower smoothness index than baseline in the completed trials. This is still useful because it shows where technique or instruction may need adjustment.",
            severity: hasImproved ? "positive" : "neutral",
        };
    }, [table]);

    const performanceFeedback = useMemo(() => {
        const feedbackTrials = table
            .filter(
                row =>
                    isFiniteNumber(row.feedbackSmooth) &&
                    isFiniteNumber(row.feedbackDuration) &&
                    isFiniteNumber(row.feedbackDisp),
            )
            .map(row => ({
                label: `${row.participantName} • ${row.movementTitle}`,
                duration: row.feedbackDuration as number,
                displacement: row.feedbackDisp as number,
                smoothness: row.feedbackSmooth as number,
            }));

        return generatePerformanceFeedback("activity5", {
            trials: feedbackTrials,
        });
    }, [table]);

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
                <Text style={styles.loadingText}>Loading…</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.title}>Results Dashboard</Text>
                <Text style={styles.sub}>
                    Smoothness index is scaled ×{SMOOTHNESS_SCALE} for
                    readability. Score = max(0, Baseline − Feedback) ×{" "}
                    {SMOOTHNESS_SCALE}. Higher score = better improvement.
                </Text>

                <View style={styles.hero}>
                    <Text style={styles.heroTitle}>
                        Best Improvement Session
                    </Text>
                    <Text style={styles.heroScore}>{fmt(best.score, 1)}</Text>
                    <Text style={styles.heroMeta}>
                        {best.participantName} • {best.movementTitle}
                    </Text>
                    <Text style={styles.heroHint}>
                        Leaderboard uses the highest improvement score recorded
                        within the session.
                    </Text>
                </View>

                <A5SmoothnessComparisonChart
                    title="Baseline vs Feedback Smoothness"
                    subtitle="Each movement compares baseline smoothness with feedback smoothness. Lower feedback bars indicate smoother movement."
                    data={smoothnessComparisonData}
                />

                <ResultsInsightCard insight={insight}/>

                <PerformanceFeedbackCard feedback={performanceFeedback}/>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Summary Table</Text>
                    <Text style={styles.help}>
                        Smoothness index lower = smoother. Improvement score is
                        positive when feedback is smoother than baseline. Scores
                        are clipped to zero when feedback is less smooth.
                    </Text>

                    {participants.length === 0 || movements.length === 0 ? (
                        <Text style={styles.muted}>
                            No participants or movements found.
                        </Text>
                    ) : (
                        <View style={styles.participantList}>
                            {participants.map(participant => {
                                const rows = table.filter(
                                    row =>
                                        row.participantId === participant.id,
                                );

                                const bestRow = rows
                                    .filter(row =>
                                        isFiniteNumber(row.improvementScore),
                                    )
                                    .sort(
                                        (a, b) =>
                                            (b.improvementScore ?? 0) -
                                            (a.improvementScore ?? 0),
                                    )[0];

                                return (
                                    <View
                                        key={participant.id}
                                        style={styles.participantBlock}
                                    >
                                        <Text style={styles.participantName}>
                                            {participant.name}
                                        </Text>

                                        <Text style={styles.participantMeta}>
                                            Best improvement:{" "}
                                            <Text style={styles.bold}>
                                                {bestRow?.improvementScore !=
                                                null
                                                    ? fmt(
                                                        bestRow.improvementScore,
                                                        1,
                                                    )
                                                    : "—"}
                                            </Text>
                                            {bestRow?.movementTitle
                                                ? ` • ${bestRow.movementTitle}`
                                                : ""}
                                        </Text>

                                        {rows.map(row => (
                                            <View
                                                key={`${row.participantId}_${row.movementType}`}
                                                style={styles.rowCard}
                                            >
                                                <Text style={styles.rowTitle}>
                                                    {row.movementTitle}
                                                </Text>

                                                <TwoCol
                                                    leftLabel={`Baseline smoothness (×${SMOOTHNESS_SCALE})`}
                                                    leftValue={fmtScaledSmooth(
                                                        row.baselineSmooth,
                                                        1,
                                                    )}
                                                    rightLabel={`Feedback smoothness (×${SMOOTHNESS_SCALE})`}
                                                    rightValue={fmtScaledSmooth(
                                                        row.feedbackSmooth,
                                                        1,
                                                    )}
                                                />

                                                <TwoCol
                                                    leftLabel="Baseline duration"
                                                    leftValue={
                                                        row.baselineDuration !=
                                                        null
                                                            ? `${fmt(
                                                                row.baselineDuration,
                                                                1,
                                                            )} s`
                                                            : "—"
                                                    }
                                                    rightLabel="Feedback duration"
                                                    rightValue={
                                                        row.feedbackDuration !=
                                                        null
                                                            ? `${fmt(
                                                                row.feedbackDuration,
                                                                1,
                                                            )} s`
                                                            : "—"
                                                    }
                                                />

                                                <TwoCol
                                                    leftLabel="Baseline displacement"
                                                    leftValue={
                                                        row.baselineDisp != null
                                                            ? `${fmt(
                                                                row.baselineDisp,
                                                                1,
                                                            )} cm`
                                                            : "—"
                                                    }
                                                    rightLabel="Feedback displacement"
                                                    rightValue={
                                                        row.feedbackDisp != null
                                                            ? `${fmt(
                                                                row.feedbackDisp,
                                                                1,
                                                            )} cm`
                                                            : "—"
                                                    }
                                                />

                                                <View style={styles.improveRow}>
                                                    <Text
                                                        style={
                                                            styles.improveLabel
                                                        }
                                                    >
                                                        Improvement score
                                                    </Text>
                                                    <Text
                                                        style={[
                                                            styles.improveValue,
                                                            isFiniteNumber(
                                                                row.improvementScore,
                                                            ) &&
                                                            row.improvementScore >
                                                            0
                                                                ? styles.improvePositive
                                                                : styles.improveNeutral,
                                                        ]}
                                                    >
                                                        {isFiniteNumber(
                                                            row.improvementScore,
                                                        )
                                                            ? fmt(
                                                                row.improvementScore,
                                                                1,
                                                            )
                                                            : "—"}
                                                    </Text>
                                                </View>

                                                {isFiniteNumber(
                                                    row.baselineSmooth,
                                                ) &&
                                                isFiniteNumber(
                                                    row.feedbackSmooth,
                                                ) &&
                                                row.baselineSmooth -
                                                row.feedbackSmooth <
                                                0 ? (
                                                    <Text style={styles.tinyNote}>
                                                        Note: feedback was less
                                                        smooth than baseline in
                                                        this trial, so the score
                                                        is clipped to 0.
                                                    </Text>
                                                ) : null}
                                            </View>
                                        ))}
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>

                <View style={styles.btnRow}>
                    <Pressable
                        style={styles.secondaryBtn}
                        onPress={goToTrials}
                    >
                        <Text style={styles.secondaryBtnText}>
                            Back to Trials
                        </Text>
                    </Pressable>

                    <Pressable
                        style={styles.secondaryBtn}
                        onPress={goToCompare}
                    >
                        <Text style={styles.secondaryBtnText}>Compare</Text>
                    </Pressable>

                    <Pressable style={styles.primaryBtn} onPress={goToSubmit}>
                        <Text style={styles.primaryBtnText}>
                            Reflection & Submit
                        </Text>
                    </Pressable>
                </View>

                <View style={styles.bottomSpace}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function TwoCol(props: {
    leftLabel: string;
    leftValue: string;
    rightLabel: string;
    rightValue: string;
}): React.JSX.Element {
    return (
        <View style={styles.twoCol}>
            <View style={styles.twoColItem}>
                <Text style={styles.smallLabel}>{props.leftLabel}</Text>
                <Text style={styles.smallValue}>{props.leftValue}</Text>
            </View>
            <View style={styles.twoColItem}>
                <Text style={styles.smallLabel}>{props.rightLabel}</Text>
                <Text style={styles.smallValue}>{props.rightValue}</Text>
            </View>
        </View>
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
    title: {
        fontSize: 26,
        fontWeight: "900",
        marginTop: 6,
        color: "#172033",
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
    cardTitle: {
        fontSize: 16,
        fontWeight: "900",
        marginBottom: 8,
        color: "#172033",
    },
    help: {
        opacity: 0.75,
        lineHeight: 18,
        color: "#344054",
    },
    muted: {
        marginTop: 10,
        opacity: 0.6,
        color: "#344054",
    },
    tinyNote: {
        marginTop: 8,
        opacity: 0.65,
        fontSize: 12,
        lineHeight: 16,
        color: "#344054",
    },
    participantList: {
        marginTop: 10,
        gap: 12,
    },
    participantBlock: {
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 14,
    },
    participantName: {
        fontWeight: "900",
        fontSize: 16,
        color: "#172033",
    },
    participantMeta: {
        marginTop: 6,
        opacity: 0.75,
        color: "#344054",
    },
    bold: {
        fontWeight: "900",
        color: "#172033",
    },
    rowCard: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#FAFAFA",
        borderRadius: 14,
        padding: 12,
    },
    rowTitle: {
        fontWeight: "900",
        color: "#172033",
    },
    twoCol: {
        marginTop: 10,
        flexDirection: "row",
        gap: 12,
    },
    twoColItem: {
        flex: 1,
    },
    smallLabel: {
        opacity: 0.7,
        fontSize: 12,
        color: "#344054",
    },
    smallValue: {
        fontWeight: "900",
        marginTop: 2,
        color: "#172033",
    },
    improveRow: {
        marginTop: 12,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
    },
    improveLabel: {
        opacity: 0.75,
        color: "#344054",
        flex: 1,
    },
    improveValue: {
        fontWeight: "900",
    },
    improvePositive: {
        color: "#16A34A",
    },
    improveNeutral: {
        color: "#111827",
    },
    btnRow: {
        marginTop: 18,
        gap: 10,
    },
    secondaryBtn: {
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
    primaryBtn: {
        backgroundColor: "#111827",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    primaryBtnText: {
        color: "#FFFFFF",
        fontWeight: "900",
    },
    bottomSpace: {
        height: 40,
    },
});