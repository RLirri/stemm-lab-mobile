// src/screens/Activities/Activity7/A7ResultsScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, KeyboardAvoidingView, Platform, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';

import {
    getActivity7RunDraft,
    validateA7Submission,
    isA7LeaderboardEligible,
    getA7LeaderboardMetrics,
    type Activity7RunDraft,
    type A7ParticipantSummary,
} from '../../../store/activity7RunDraftStore';

import ActivityBarChart from '../../../components/charts/ActivityBarChart';
import ResultsInsightCard from '../../../components/insights/ResultsInsightCard';
import {
    buildA7Visualization,
    type A7RecoveryParticipant,
} from '../../../services/resultInsights/activity7VisualizationService';

import PerformanceFeedbackCard from '../../../components/feedback/PerformanceFeedbackCard';
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

type Props = NativeStackScreenProps<AppStackParamList, 'A7Results'>;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function mean(xs: number[]): number | undefined {
    if (!xs.length) return undefined;
    return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

function fmtBpm(v?: number): string {
    if (!isFiniteNumber(v)) return '—';
    return `${v.toFixed(1)} BPM`;
}

function fmtDelta(v?: number): string {
    if (!isFiniteNumber(v)) return '—';
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(1)} BPM`;
}

function fmtScore(v?: number): string {
    if (!isFiniteNumber(v)) return '—';
    return v.toFixed(3);
}

function fmtN(v?: number): string {
    if (!isFiniteNumber(v)) return '—';
    return `${Math.round(v)}`;
}

function participantName(draft: Activity7RunDraft, participantId: string): string {
    return draft.session.participants.find((p) => p.id === participantId)?.name ?? '—';
}

function stripReflectionBlockingItems(missing: string[]): string[] {
    return missing.filter(
        (item) =>
            ![
                'Reflection text',
                'Rating (1–5)',
                'GPS permission granted',
                'GPS coordinates captured',
            ].includes(item),
    );
}

function getPredictionVerdict(errors: Array<number | undefined>): string {
    const values = errors.filter(isFiniteNumber);
    if (!values.length) return 'Not enough data';

    const avg = mean(values);
    if (!isFiniteNumber(avg)) return 'Not enough data';
    if (avg <= 2) return 'Very close';
    if (avg <= 5) return 'Reasonably close';
    if (avg <= 10) return 'Partly correct';

    return 'Not very close';
}

function minDefined(xs: Array<number | undefined>): number | undefined {
    const values = xs.filter(isFiniteNumber);
    return values.length ? Math.min(...values) : undefined;
}

function maxDefined(xs: Array<number | undefined>): number | undefined {
    const values = xs.filter(isFiniteNumber);
    return values.length ? Math.max(...values) : undefined;
}

function getHighestPhaseLabel(summary: A7ParticipantSummary): string {
    const candidates = [
        {label: 'Rest', value: summary.restBpm},
        {label: 'Post-Jog', value: summary.postJogBpm},
        {label: 'Post-Star-Jumps', value: summary.postStarJumpBpm},
    ].filter((item) => isFiniteNumber(item.value));

    if (!candidates.length) return '—';

    candidates.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return candidates[0].label;
}

export default function A7ResultsScreen({
                                            route,
                                            navigation,
                                        }: Props): React.JSX.Element | null {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity7RunDraft | null>(null);

    const [toast, setToast] = useState<ToastState>({
        visible: false,
        title: '',
        message: undefined,
        tone: 'success',
    });

    function showToast(title: string, tone: ToastTone = 'success', message?: string) {
        setToast({visible: true, title, message, tone});
    }

    useEffect(() => {
        if (!user) return;

        const d = getActivity7RunDraft(runId);

        if (!d) {
            Alert.alert('Session expired', 'Please restart Activity 7.', [
                {text: 'OK', onPress: () => navigation.goBack()},
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
        const bestSummary = summaries.find((summary) => summary.participantId === bestId);

        const bestParticipantName = bestId ? participantName(draft, bestId) : undefined;

        const lowestRest = minDefined(summaries.map((summary) => summary.restBpm));

        const highestExercise = maxDefined([
            ...summaries.map((summary) => summary.postJogBpm),
            ...summaries.map((summary) => summary.postStarJumpBpm),
        ]);

        const avgPredictionAbsError = mean(
            summaries.flatMap((summary) =>
                [
                    summary.prediction?.restAbsError,
                    summary.prediction?.postJogAbsError,
                    summary.prediction?.postStarJumpAbsError,
                ].filter(isFiniteNumber),
            ),
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

        const participants: A7RecoveryParticipant[] = metrics.participantSummaries.map(
            (summary) => ({
                label: participantName(draft, summary.participantId),
                recoveryConsistencyScore: summary.recoveryConsistencyScore,
            }),
        );

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

        const trials = metrics.participantSummaries.flatMap((summary) => {
            const arr: Array<{
                label: string;
                restingBpm: number;
                postExerciseBpm: number;
            }> = [];

            if (summary.restBpm != null && summary.postJogBpm != null) {
                arr.push({
                    label: `${summary.participantId}-jog`,
                    restingBpm: summary.restBpm,
                    postExerciseBpm: summary.postJogBpm,
                });
            }

            if (summary.restBpm != null && summary.postStarJumpBpm != null) {
                arr.push({
                    label: `${summary.participantId}-star`,
                    restingBpm: summary.restBpm,
                    postExerciseBpm: summary.postStarJumpBpm,
                });
            }

            return arr;
        });

        return generatePerformanceFeedback('activity7', {trials});
    }, [metrics]);

    function refresh() {
        const d = getActivity7RunDraft(runId);

        if (d) {
            setDraft(d);
            showToast('Results refreshed', 'info', 'Latest breathing metrics loaded.');
        }
    }

    function goToMeasurements() {
        navigation.navigate('A7Measurements', {activityId, runId});
    }

    function goToSubmit() {
        if (!canProceedToReflection) {
            Alert.alert(
                'Experiment data incomplete',
                `Please complete these items first:\n${experimentBlockingMissing.join('\n')}`,
            );
            return;
        }

        showToast('Results ready', 'success', 'Opening reflection and submission.');

        setTimeout(() => {
            navigation.navigate('A7ReflectionSubmit', {activityId, runId});
        }, 700);
    }

    if (!user) return null;

    if (!draft || !metrics) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading results dashboard..."/>
            </AppGradientScreen>
        );
    }

    const summaries: A7ParticipantSummary[] = metrics.participantSummaries ?? [];
    const prediction = draft.prediction;

    return (
        <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <AppGradientScreen>
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <AppBadge label="Activity 7" tone="primary"/>

                        <AppButton
                            title="Refresh"
                            variant="outline"
                            onPress={refresh}
                            style={styles.refreshButton}
                        />
                    </View>

                    <AppText variant="title" style={styles.title}>
                        Results Dashboard
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Review breathing rate at rest and after exercise, compare phase
                        changes, and check recovery consistency before submission.
                    </AppText>
                </View>

                <View style={styles.heroCard}>
                    <View style={styles.heroTop}>
                        <AppText variant="bodyStrong" color="inverseText">
                            Best Recovery Consistency
                        </AppText>

                        <AppBadge
                            label={leaderboardEligible ? 'Eligible' : 'Not eligible'}
                            tone={leaderboardEligible ? 'success' : 'warning'}
                        />
                    </View>

                    <AppText variant="title" color="inverseText" style={styles.heroScore}>
                        {visualization.bestRecovery?.recoveryConsistencyScore != null
                            ? visualization.bestRecovery.recoveryConsistencyScore.toFixed(3)
                            : '—'}
                    </AppText>

                    <AppText variant="body" color="inverseText" style={styles.heroMeta}>
                        {visualization.bestRecovery?.label ??
                            'Complete breathing measurements to calculate this.'}
                    </AppText>

                    <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                        Lower recovery consistency score indicates a more stable breathing
                        recovery pattern.
                    </AppText>
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

                {performanceFeedback ? (
                    <PerformanceFeedbackCard feedback={performanceFeedback}/>
                ) : null}

                <AppSectionHeader
                    title="Highlights"
                    subtitle="Key leaderboard and prediction outcomes."
                />

                <AppCard>
                    <View style={styles.badgeWrap}>
                        <AppBadge
                            label={leaderboardEligible ? 'Leaderboard eligible' : 'Not eligible'}
                            tone={leaderboardEligible ? 'success' : 'warning'}
                        />

                        <AppBadge
                            label={
                                prediction
                                    ? `Prediction: Rest ${fmtN(
                                        prediction.predictedRestBpm,
                                    )} / After ${fmtN(prediction.predictedAfterExerciseBpm)}`
                                    : 'Prediction missing'
                            }
                            tone={prediction ? 'success' : 'warning'}
                        />
                    </View>

                    <MetricRow
                        label="Best recovery consistency"
                        value={
                            highlights?.bestParticipantName
                                ? `${highlights.bestParticipantName} • ${fmtScore(
                                    highlights.bestRecoveryScore,
                                )}`
                                : '—'
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
                        hint="Computed across post-jog and post-star-jumps phases."
                    />

                    <MetricRow
                        label="Average prediction error"
                        value={
                            isFiniteNumber(highlights?.avgPredictionAbsError)
                                ? `${highlights.avgPredictionAbsError.toFixed(1)} BPM`
                                : '—'
                        }
                        hint="Average absolute error across all measured-vs-predicted values."
                    />
                </AppCard>

                <AppSectionHeader
                    title="Team Summary"
                    subtitle="Team-level breathing and recovery metrics."
                />

                <AppCard>
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
                                    leaderboard.bestParticipantRecoveryConsistencyScore,
                                )}`
                                : '—'
                        }
                        hint="Best participant has the lowest recovery consistency score."
                    />
                </AppCard>

                <AppSectionHeader
                    title="Per Participant Breakdown"
                    subtitle="Measured phases, phase deltas, recovery score, and prediction accuracy."
                />

                {summaries.length === 0 ? (
                    <AppCard>
                        <InfoBanner
                            title="No results yet"
                            message="Record all breathing measurements first."
                            tone="warning"
                        />
                    </AppCard>
                ) : (
                    <View style={styles.participantList}>
                        {summaries.map((summary) => {
                            const name = participantName(draft, summary.participantId);

                            const verdict = getPredictionVerdict([
                                summary.prediction?.restAbsError,
                                summary.prediction?.postJogAbsError,
                                summary.prediction?.postStarJumpAbsError,
                            ]);

                            return (
                                <AppCard key={summary.participantId}>
                                    <View style={styles.participantHeader}>
                                        <View style={styles.participantText}>
                                            <AppText variant="sectionTitle">{name}</AppText>

                                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                                Highest measured phase: {getHighestPhaseLabel(summary)}
                                            </AppText>
                                        </View>

                                        <AppBadge
                                            label={fmtScore(summary.recoveryConsistencyScore)}
                                            tone="info"
                                        />
                                    </View>

                                    <View style={styles.sectionBox}>
                                        <AppText variant="bodyStrong">Measured breathing rates</AppText>

                                        <MetricRow label="Rest" value={fmtBpm(summary.restBpm)} compact/>
                                        <MetricRow label="Post-Jog" value={fmtBpm(summary.postJogBpm)} compact/>
                                        <MetricRow
                                            label="Post-Star-Jumps"
                                            value={fmtBpm(summary.postStarJumpBpm)}
                                            compact
                                        />
                                    </View>

                                    <View style={styles.sectionBox}>
                                        <AppText variant="bodyStrong">Phase changes</AppText>

                                        <MetricRow
                                            label="Rest to Jog"
                                            value={fmtDelta(summary.deltaRestToJog)}
                                            compact
                                        />

                                        <MetricRow
                                            label="Rest to Star Jumps"
                                            value={fmtDelta(summary.deltaRestToStarJump)}
                                            compact
                                        />

                                        <MetricRow
                                            label="Jog to Star Jumps"
                                            value={fmtDelta(summary.deltaJogToStarJump)}
                                            compact
                                        />
                                    </View>

                                    <View style={styles.sectionBox}>
                                        <View style={styles.predictionHeader}>
                                            <AppText variant="bodyStrong">Prediction accuracy</AppText>
                                            <AppBadge label={verdict} tone="info"/>
                                        </View>

                                        <MetricRow
                                            label="Rest prediction error"
                                            value={
                                                isFiniteNumber(summary.prediction?.restAbsError)
                                                    ? `${summary.prediction.restAbsError.toFixed(1)} BPM`
                                                    : '—'
                                            }
                                            compact
                                        />

                                        <MetricRow
                                            label="Post-Jog prediction error"
                                            value={
                                                isFiniteNumber(summary.prediction?.postJogAbsError)
                                                    ? `${summary.prediction.postJogAbsError.toFixed(1)} BPM`
                                                    : '—'
                                            }
                                            compact
                                        />

                                        <MetricRow
                                            label="Post-Star-Jumps prediction error"
                                            value={
                                                isFiniteNumber(summary.prediction?.postStarJumpAbsError)
                                                    ? `${summary.prediction.postStarJumpAbsError.toFixed(1)} BPM`
                                                    : '—'
                                            }
                                            compact
                                        />
                                    </View>
                                </AppCard>
                            );
                        })}
                    </View>
                )}

                <AppSectionHeader
                    title="Experiment Readiness"
                    subtitle="You can continue once experiment data is complete."
                />

                <AppCard>
                    {canProceedToReflection ? (
                        <InfoBanner
                            title="Ready for reflection"
                            message="All required breathing measurements and computed datasets are present."
                            tone="success"
                        />
                    ) : (
                        <InfoBanner
                            title="Complete experiment items first"
                            message={experimentBlockingMissing.join(' • ')}
                            tone="warning"
                        />
                    )}
                </AppCard>

                <AppSectionHeader
                    title="Final Submission Notes"
                    subtitle="Reflection, rating, GPS, and optional video are completed on the final screen."
                />

                <AppCard>
                    <View style={styles.stepList}>
                        <StepItem index={1} title="Write reflection text"/>
                        <StepItem index={2} title="Choose rating from 1 to 5"/>
                        <StepItem index={3} title="Confirm GPS permission and coordinate"/>
                        <StepItem index={4} title="Attach optional session video"/>
                    </View>
                </AppCard>

                <View style={styles.actions}>
                    <AppButton
                        title="Back to Measurements"
                        variant="outline"
                        onPress={goToMeasurements}
                    />

                    <AppButton
                        title="Go to Reflection & Submit"
                        onPress={goToSubmit}
                        disabled={!canProceedToReflection}
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

type MetricRowProps = {
    label: string;
    value: string;
    hint?: string;
    compact?: boolean;
};

function MetricRow({label, value, hint, compact = false}: MetricRowProps) {
    return (
        <View style={[styles.metricRow, compact && styles.metricRowCompact]}>
            <View style={styles.metricTextBlock}>
                <AppText variant="bodyStrong">{label}</AppText>

                {hint ? (
                    <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                        {hint}
                    </AppText>
                ) : null}
            </View>

            <AppText variant="bodyStrong" align="right" style={styles.metricValue}>
                {value}
            </AppText>
        </View>
    );
}

type StepItemProps = {
    index: number;
    title: string;
};

function StepItem({index, title}: StepItemProps) {
    return (
        <View style={styles.stepItem}>
            <View style={styles.stepNumber}>
                <AppText variant="caption" color="inverseText">
                    {index}
                </AppText>
            </View>

            <AppText variant="bodyStrong" style={styles.stepText}>
                {title}
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

    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    refreshButton: {
        minWidth: 108,
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
        alignItems: 'center',
        justifyContent: 'space-between',
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

    badgeWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },

    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingVertical: spacing.sm,
    },

    metricRowCompact: {
        paddingVertical: spacing.xs,
    },

    metricTextBlock: {
        flex: 1,
    },

    metricValue: {
        flex: 1,
    },

    participantList: {
        gap: spacing.md,
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

    sectionBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },

    predictionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        marginBottom: spacing.sm,
    },

    stepList: {
        gap: spacing.md,
    },

    stepItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },

    stepNumber: {
        width: 28,
        height: 28,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },

    stepText: {
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