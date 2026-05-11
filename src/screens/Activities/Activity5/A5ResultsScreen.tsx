// src/screens/Activities/Activity5/A5ResultsScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, KeyboardAvoidingView, Platform, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';

import {
    type A5MovementSpec,
    type A5MovementType,
    type A5TrialDraft,
    type A5TrialMode,
    type Activity5RunDraft,
    getActivity5RunDraft,
} from '../../../store/activity5RunDraftStore';

import A5SmoothnessComparisonChart, {
    type A5SmoothnessComparisonPoint,
} from '../../../components/charts/A5SmoothnessComparisonChart';
import ResultsInsightCard from '../../../components/insights/ResultsInsightCard';
import PerformanceFeedbackCard from '../../../components/feedback/PerformanceFeedbackCard';
import type {ResultInsight} from '../../../types/visualization';
import {generatePerformanceFeedback} from '../../../services/performanceFeedback/performanceFeedbackService';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppSectionHeader,
    AppStatusToast,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A5Results'>;

const SMOOTHNESS_SCALE = 100;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function isFiniteNumber(x: unknown): x is number {
    return typeof x === 'number' && Number.isFinite(x);
}

function clampNum(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, n));
}

function fmt(n: number | undefined, digits = 1): string {
    if (!isFiniteNumber(n)) return '—';
    return n.toFixed(digits);
}

function fmtScaledSmooth(n: number | undefined, digits = 1): string {
    if (!isFiniteNumber(n)) return '—';
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
            (trial) =>
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

    const [toast, setToast] = useState<ToastState>({
        visible: false,
        title: '',
        message: undefined,
        tone: 'success',
    });

    function showToast(title: string, tone: ToastTone = 'success', message?: string) {
        setToast({
            visible: true,
            title,
            message,
            tone,
        });
    }

    useEffect(() => {
        if (!user) return;

        const d = getActivity5RunDraft(runId);

        if (!d) {
            Alert.alert('Session not found', 'Please restart Activity 5.', [
                {
                    text: 'OK',
                    onPress: () => navigation.replace('A5SessionSetup', {activityId}),
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
                const baseline = latestTrial(trials, participant.id, movement.type, 'baseline');
                const feedback = latestTrial(trials, participant.id, movement.type, 'feedback');

                const baselineSmooth = baseline?.metrics?.smoothnessIndex;
                const feedbackSmooth = feedback?.metrics?.smoothnessIndex;

                rows.push({
                    participantId: participant.id,
                    participantName: participant.name,
                    movementType: movement.type,
                    movementTitle: movement.title,
                    baselineSmooth,
                    feedbackSmooth,
                    improvementScore: improvementScoreScaled(baselineSmooth, feedbackSmooth),
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
                participants.find((p) => p.id === top.participantId)?.name ?? '—';

            const movementTitle =
                movements.find((m) => m.type === top.movementType)?.title ?? top.movementType;

            return {
                score,
                participantName,
                movementTitle,
            };
        }

        let bestScore = 0;
        let bestParticipantId = '';
        let bestMovementTitle = '';

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
            participantName: participants.find((p) => p.id === bestParticipantId)?.name ?? '—',
            movementTitle: bestMovementTitle || '—',
        };
    }, [draft?.improvements, movements, participants, table]);

    const smoothnessComparisonData = useMemo<A5SmoothnessComparisonPoint[]>(() => {
        return table
            .filter(
                (row) =>
                    isFiniteNumber(row.baselineSmooth) &&
                    isFiniteNumber(row.feedbackSmooth) &&
                    isFiniteNumber(row.improvementScore),
            )
            .map((row) => ({
                label: `${row.participantName}\n${row.movementTitle.replace('Movement ', 'M')}`,
                baselineValue: Number(((row.baselineSmooth ?? 0) * SMOOTHNESS_SCALE).toFixed(1)),
                feedbackValue: Number(((row.feedbackSmooth ?? 0) * SMOOTHNESS_SCALE).toFixed(1)),
                improvementScore: Number((row.improvementScore ?? 0).toFixed(1)),
            }));
    }, [table]);

    const insight = useMemo<ResultInsight>(() => {
        const improvedRows = table
            .filter((row) => isFiniteNumber(row.improvementScore))
            .sort((a, b) => (b.improvementScore ?? 0) - (a.improvementScore ?? 0));

        const bestRow = improvedRows[0];

        if (!bestRow) {
            return {
                title: 'Not enough data',
                message: 'Complete baseline and feedback trials to generate smoothness insights.',
                severity: 'neutral',
            };
        }

        const hasImproved = (bestRow.improvementScore ?? 0) > 0;

        return {
            title: hasImproved
                ? `Best improvement: ${bestRow.participantName}`
                : 'No smoothness improvement detected',
            message: hasImproved
                ? `${bestRow.participantName} improved most in ${bestRow.movementTitle}. The feedback trial reduced the smoothness index by ${fmt(
                    bestRow.improvementScore,
                    1,
                )} points, indicating smoother movement after feedback.`
                : 'The feedback trials did not produce a lower smoothness index than baseline in the completed trials. This is still useful because it shows where technique or instruction may need adjustment.',
            severity: hasImproved ? 'positive' : 'neutral',
        };
    }, [table]);

    const performanceFeedback = useMemo(() => {
        const feedbackTrials = table
            .filter(
                (row) =>
                    isFiniteNumber(row.feedbackSmooth) &&
                    isFiniteNumber(row.feedbackDuration) &&
                    isFiniteNumber(row.feedbackDisp),
            )
            .map((row) => ({
                label: `${row.participantName} • ${row.movementTitle}`,
                duration: row.feedbackDuration as number,
                displacement: row.feedbackDisp as number,
                smoothness: row.feedbackSmooth as number,
            }));

        return generatePerformanceFeedback('activity5', {
            trials: feedbackTrials,
        });
    }, [table]);

    const completedPairs = useMemo(
        () => table.filter((row) => isFiniteNumber(row.improvementScore)).length,
        [table],
    );

    const totalPairs = useMemo(
        () => participants.length * movements.length,
        [movements.length, participants.length],
    );

    function goToTrials() {
        navigation.navigate('A5GuidedTrials', {activityId, runId});
    }

    function goToCompare() {
        showToast('Opening comparison', 'success', 'Preparing baseline versus feedback view.');

        setTimeout(() => {
            navigation.navigate('A5Comparison', {activityId, runId});
        }, 600);
    }

    function goToSubmit() {
        showToast('Results ready', 'success', 'Opening reflection and submission.');

        setTimeout(() => {
            navigation.navigate('A5ReflectionSubmit', {activityId, runId});
        }, 600);
    }

    if (!user) return null;

    if (!draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading results dashboard..."/>
            </AppGradientScreen>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <AppGradientScreen>
                <View style={styles.header}>
                    <AppBadge label="Activity 5" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Results Dashboard
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Smoothness index is scaled ×{SMOOTHNESS_SCALE}. Score = max(0,
                        Baseline − Feedback) × {SMOOTHNESS_SCALE}. Higher score means better
                        improvement.
                    </AppText>
                </View>

                <View style={styles.heroCard}>
                    <View style={styles.heroTop}>
                        <AppText variant="bodyStrong" color="inverseText">
                            Best Improvement Session
                        </AppText>

                        <AppBadge
                            label={`${completedPairs} / ${totalPairs}`}
                            tone={completedPairs > 0 ? 'success' : 'warning'}
                        />
                    </View>

                    <AppText variant="title" color="inverseText" style={styles.heroScore}>
                        {fmt(best.score, 1)}
                    </AppText>

                    <AppText variant="body" color="inverseText" style={styles.heroMeta}>
                        {best.participantName} • {best.movementTitle}
                    </AppText>

                    <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                        Leaderboard uses the highest improvement score recorded within the
                        session.
                    </AppText>
                </View>

                <A5SmoothnessComparisonChart
                    title="Baseline vs Feedback Smoothness"
                    subtitle="Each movement compares baseline smoothness with feedback smoothness. Lower feedback bars indicate smoother movement."
                    data={smoothnessComparisonData}
                />

                <ResultsInsightCard insight={insight}/>

                <PerformanceFeedbackCard feedback={performanceFeedback}/>

                <AppSectionHeader
                    title="Summary Table"
                    subtitle="Participant-level movement results and improvement scores."
                />

                <AppCard>
                    <InfoBanner
                        title="Scoring interpretation"
                        message="Smoothness index lower means smoother. Improvement score is positive when feedback is smoother than baseline. Scores are clipped to zero when feedback is less smooth."
                        tone="info"
                    />

                    {participants.length === 0 || movements.length === 0 ? (
                        <AppText variant="body" color="textMuted" style={styles.emptyText}>
                            No participants or movements found.
                        </AppText>
                    ) : (
                        <View style={styles.participantList}>
                            {participants.map((participant) => {
                                const rows = table.filter((row) => row.participantId === participant.id);

                                const bestRow = rows
                                    .filter((row) => isFiniteNumber(row.improvementScore))
                                    .sort((a, b) => (b.improvementScore ?? 0) - (a.improvementScore ?? 0))[0];

                                return (
                                    <View key={participant.id} style={styles.participantBlock}>
                                        <View style={styles.participantHeader}>
                                            <View style={styles.participantText}>
                                                <AppText variant="sectionTitle">{participant.name}</AppText>

                                                <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                                    Best improvement:{' '}
                                                    {bestRow?.improvementScore != null
                                                        ? fmt(bestRow.improvementScore, 1)
                                                        : '—'}
                                                    {bestRow?.movementTitle ? ` • ${bestRow.movementTitle}` : ''}
                                                </AppText>
                                            </View>

                                            <AppBadge
                                                label={`${rows.filter((r) => isFiniteNumber(r.improvementScore)).length} complete`}
                                                tone={
                                                    rows.some((r) => isFiniteNumber(r.improvementScore))
                                                        ? 'success'
                                                        : 'warning'
                                                }
                                            />
                                        </View>

                                        <View style={styles.rowList}>
                                            {rows.map((row) => {
                                                const worsened =
                                                    isFiniteNumber(row.baselineSmooth) &&
                                                    isFiniteNumber(row.feedbackSmooth) &&
                                                    row.baselineSmooth - row.feedbackSmooth < 0;

                                                const improved =
                                                    isFiniteNumber(row.improvementScore) &&
                                                    row.improvementScore > 0;

                                                return (
                                                    <View
                                                        key={`${row.participantId}_${row.movementType}`}
                                                        style={styles.rowCard}
                                                    >
                                                        <View style={styles.rowHeader}>
                                                            <View style={styles.rowTitleArea}>
                                                                <AppText variant="bodyStrong">
                                                                    {row.movementTitle}
                                                                </AppText>

                                                                <AppText variant="caption" color="textMuted"
                                                                         style={styles.smallGap}>
                                                                    Baseline vs feedback comparison
                                                                </AppText>
                                                            </View>

                                                            <AppBadge
                                                                label={
                                                                    isFiniteNumber(row.improvementScore)
                                                                        ? improved
                                                                            ? 'Improved'
                                                                            : 'No gain'
                                                                        : 'Missing'
                                                                }
                                                                tone={
                                                                    isFiniteNumber(row.improvementScore)
                                                                        ? improved
                                                                            ? 'success'
                                                                            : 'info'
                                                                        : 'warning'
                                                                }
                                                            />
                                                        </View>

                                                        <View style={styles.metricGrid}>
                                                            <MetricTile
                                                                label={`Baseline smoothness ×${SMOOTHNESS_SCALE}`}
                                                                value={fmtScaledSmooth(row.baselineSmooth, 1)}
                                                            />

                                                            <MetricTile
                                                                label={`Feedback smoothness ×${SMOOTHNESS_SCALE}`}
                                                                value={fmtScaledSmooth(row.feedbackSmooth, 1)}
                                                            />

                                                            <MetricTile
                                                                label="Baseline duration"
                                                                value={
                                                                    row.baselineDuration != null
                                                                        ? `${fmt(row.baselineDuration, 1)} s`
                                                                        : '—'
                                                                }
                                                            />

                                                            <MetricTile
                                                                label="Feedback duration"
                                                                value={
                                                                    row.feedbackDuration != null
                                                                        ? `${fmt(row.feedbackDuration, 1)} s`
                                                                        : '—'
                                                                }
                                                            />

                                                            <MetricTile
                                                                label="Baseline displacement"
                                                                value={
                                                                    row.baselineDisp != null
                                                                        ? `${fmt(row.baselineDisp, 1)} cm`
                                                                        : '—'
                                                                }
                                                            />

                                                            <MetricTile
                                                                label="Feedback displacement"
                                                                value={
                                                                    row.feedbackDisp != null
                                                                        ? `${fmt(row.feedbackDisp, 1)} cm`
                                                                        : '—'
                                                                }
                                                            />
                                                        </View>

                                                        <View style={styles.improvementBox}>
                                                            <View style={styles.improvementText}>
                                                                <AppText variant="bodyStrong">
                                                                    Improvement score
                                                                </AppText>

                                                                <AppText variant="caption" color="textMuted"
                                                                         style={styles.smallGap}>
                                                                    max(0, baseline − feedback) × {SMOOTHNESS_SCALE}
                                                                </AppText>
                                                            </View>

                                                            <AppText
                                                                variant="subtitle"
                                                                color={improved ? 'success' : 'text'}
                                                            >
                                                                {isFiniteNumber(row.improvementScore)
                                                                    ? fmt(row.improvementScore, 1)
                                                                    : '—'}
                                                            </AppText>
                                                        </View>

                                                        {worsened ? (
                                                            <InfoBanner
                                                                title="Feedback was less smooth"
                                                                message="Feedback was less smooth than baseline in this trial, so the score is clipped to 0."
                                                                tone="warning"
                                                            />
                                                        ) : null}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </AppCard>

                <View style={styles.actions}>
                    <AppButton
                        title="Back to Trials"
                        variant="outline"
                        onPress={goToTrials}
                    />

                    <AppButton
                        title="Compare"
                        variant="outline"
                        onPress={goToCompare}
                    />

                    <AppButton
                        title="Reflection & Submit"
                        onPress={goToSubmit}
                    />
                </View>

                <AppStatusToast
                    visible={toast.visible}
                    title={toast.title}
                    message={toast.message}
                    tone={toast.tone}
                    onHide={() =>
                        setToast((prev) => ({
                            ...prev,
                            visible: false,
                        }))
                    }
                />

                <View style={styles.bottomSpace}/>
            </AppGradientScreen>
        </KeyboardAvoidingView>
    );
}

type MetricTileProps = {
    label: string;
    value: string;
};

function MetricTile({label, value}: MetricTileProps): React.JSX.Element {
    return (
        <View style={styles.metricTile}>
            <AppText variant="caption" color="textMuted">
                {label}
            </AppText>

            <AppText variant="bodyStrong" style={styles.metricValue}>
                {value}
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    keyboard: {
        flex: 1,
    },

    header: {
        marginBottom: spacing.lg,
    },

    title: {
        marginTop: spacing.md,
    },

    subtitle: {
        marginTop: spacing.sm,
    },

    heroCard: {
        borderRadius: radius.xl,
        backgroundColor: colors.primaryDark,
        padding: spacing.xl,
        marginBottom: spacing.lg,
    },

    heroTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.md,
    },

    heroScore: {
        marginTop: spacing.md,
    },

    heroMeta: {
        marginTop: spacing.xs,
        opacity: 0.9,
    },

    heroHint: {
        marginTop: spacing.md,
        opacity: 0.75,
    },

    emptyText: {
        marginTop: spacing.md,
    },

    participantList: {
        marginTop: spacing.lg,
        gap: spacing.md,
    },

    participantBlock: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.md,
    },

    participantHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    participantText: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    rowList: {
        marginTop: spacing.md,
        gap: spacing.md,
    },

    rowCard: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceMuted,
        borderRadius: radius.lg,
        padding: spacing.md,
    },

    rowHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    rowTitleArea: {
        flex: 1,
    },

    metricGrid: {
        marginTop: spacing.md,
        gap: spacing.sm,
    },

    metricTile: {
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        padding: spacing.md,
    },

    metricValue: {
        marginTop: spacing.xs,
    },

    improvementBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    improvementText: {
        flex: 1,
    },

    actions: {
        marginTop: spacing.lg,
        gap: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});