// src/screens/Activities/Activity6/A6ResultsScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, KeyboardAvoidingView, Platform, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';

import {
    getActivity6RunDraft,
    validateA6Submission,
    isA6LeaderboardEligible,
    getA6LeaderboardMetrics,
    type Activity6RunDraft,
    type A6ParticipantSummary,
} from '../../../store/activity6RunDraftStore';

import ActivityBarChart from '../../../components/charts/ActivityBarChart';
import ResultsInsightCard from '../../../components/insights/ResultsInsightCard';
import {
    buildA6Visualization,
    type A6VisualizationParticipant,
} from '../../../services/resultInsights/activity6VisualizationService';
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

type Props = NativeStackScreenProps<AppStackParamList, 'A6Results'>;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function fmtMs(v?: number): string {
    if (v == null || !Number.isFinite(v)) return '—';
    return `${Math.round(v)} ms`;
}

function fmtPct(v?: number): string {
    if (v == null || !Number.isFinite(v)) return '—';
    return `${Math.round(v)}%`;
}

function fmtN(v?: number): string {
    if (v == null || !Number.isFinite(v)) return '—';
    return `${Math.round(v)}`;
}

function participantName(d: Activity6RunDraft, pid: string): string {
    return d.session.participants.find((p) => p.id === pid)?.name ?? '—';
}

function isFiniteNum(x: unknown): x is number {
    return typeof x === 'number' && Number.isFinite(x);
}

function minDefined(xs: Array<number | undefined>): number | undefined {
    const values = xs.filter(isFiniteNum);
    return values.length ? Math.min(...values) : undefined;
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

export default function A6ResultsScreen({
                                            route,
                                            navigation,
                                        }: Props): React.JSX.Element | null {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity6RunDraft | null>(null);

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

        const d = getActivity6RunDraft(runId);

        if (!d) {
            Alert.alert('Session expired', 'Please restart Activity 6.', [
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

    const canProceedToReflection = experimentBlockingMissing.length === 0;

    const highlights = useMemo(() => {
        if (!draft || !metrics) return null;

        const fastestId = metrics.fastestParticipantId;
        const mostAccurateId = metrics.mostAccurateParticipantId;

        const fastestSummary = metrics.participantSummaries.find(
            (summary) => summary.participantId === fastestId,
        );

        const accSummary = metrics.participantSummaries.find(
            (summary) => summary.participantId === mostAccurateId,
        );

        return {
            fastestName: fastestId ? participantName(draft, fastestId) : undefined,
            fastestOverall: fastestSummary?.overallMeanReactionTimeMs,
            mostAccName: mostAccurateId ? participantName(draft, mostAccurateId) : undefined,
            bestAcc: accSummary?.tracingAccuracyPct,
        };
    }, [draft, metrics]);

    const visualization = useMemo(() => {
        if (!draft || !metrics) return buildA6Visualization([]);

        const participants: A6VisualizationParticipant[] = metrics.participantSummaries.map(
            (summary) => ({
                label: participantName(draft, summary.participantId),
                reactionTimeMs: summary.overallMeanReactionTimeMs,
                tracingAccuracyPct: summary.tracingAccuracyPct,
            }),
        );

        return buildA6Visualization(participants);
    }, [draft, metrics]);

    const performanceFeedback = useMemo(() => {
        if (!metrics) return null;

        const trials = metrics.participantSummaries.flatMap((summary) => {
            const arr: Array<{
                label: string;
                reactionTime: number;
                hand: 'dominant' | 'non-dominant';
            }> = [];

            if (summary.dominant?.meanReactionTimeMs != null) {
                arr.push({
                    label: `${summary.participantId}-dominant`,
                    reactionTime: summary.dominant.meanReactionTimeMs,
                    hand: 'dominant',
                });
            }

            if (summary.nonDominant?.meanReactionTimeMs != null) {
                arr.push({
                    label: `${summary.participantId}-non-dominant`,
                    reactionTime: summary.nonDominant.meanReactionTimeMs,
                    hand: 'non-dominant',
                });
            }

            return arr;
        });

        return generatePerformanceFeedback('activity6', {trials});
    }, [metrics]);

    function refresh() {
        const d = getActivity6RunDraft(runId);
        if (d) {
            setDraft(d);
            showToast('Results refreshed', 'info', 'Latest draft metrics loaded.');
        }
    }

    function goToReaction() {
        navigation.navigate('A6ReactionTrial', {activityId, runId});
    }

    function goToTracing() {
        navigation.navigate('A6TracingChallenge', {activityId, runId});
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
            navigation.navigate('A6ReflectionSubmit', {activityId, runId});
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

    const summaries: A6ParticipantSummary[] = metrics.participantSummaries ?? [];

    return (
        <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <AppGradientScreen>
                <View style={styles.header}>
                    <View style={styles.headerTop}>
                        <AppBadge label="Activity 6" tone="primary"/>

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
                        Review reaction speed, hand comparison, consistency, and tracing
                        accuracy before reflection.
                    </AppText>
                </View>

                <View style={styles.heroCard}>
                    <View style={styles.heroTop}>
                        <AppText variant="bodyStrong" color="inverseText">
                            Fastest Reaction
                        </AppText>

                        <AppBadge
                            label={eligibility.eligible ? 'Eligible' : 'Not eligible'}
                            tone={eligibility.eligible ? 'success' : 'warning'}
                        />
                    </View>

                    <AppText variant="title" color="inverseText" style={styles.heroScore}>
                        {visualization.fastest?.reactionTimeMs != null
                            ? fmtMs(visualization.fastest.reactionTimeMs)
                            : '—'}
                    </AppText>

                    <AppText variant="body" color="inverseText" style={styles.heroMeta}>
                        {visualization.fastest?.label ??
                            'Complete reaction trials to calculate this.'}
                    </AppText>

                    <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                        Lower reaction time means faster response performance. Leaderboard
                        eligibility also depends on tracing accuracy.
                    </AppText>
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

                <AppSectionHeader
                    title="Highlights"
                    subtitle="Fastest reaction and strongest tracing accuracy."
                />

                <AppCard>
                    <View style={styles.badgeWrap}>
                        <AppBadge
                            label={`Accuracy threshold: ${fmtPct(eligibility.threshold)}`}
                            tone="info"
                        />

                        <AppBadge
                            label={eligibility.eligible ? 'Leaderboard eligible' : 'Not eligible'}
                            tone={eligibility.eligible ? 'success' : 'warning'}
                        />
                    </View>

                    <MetricRow
                        label="Fastest participant"
                        value={
                            highlights?.fastestName
                                ? `${highlights.fastestName} • ${fmtMs(highlights.fastestOverall)}`
                                : '—'
                        }
                        hint="Lowest overall mean reaction time."
                    />

                    <MetricRow
                        label="Most accurate tracing"
                        value={
                            highlights?.mostAccName
                                ? `${highlights.mostAccName} • ${fmtPct(highlights.bestAcc)}`
                                : '—'
                        }
                        hint="Computed from average deviation against the allowed threshold."
                    />
                </AppCard>

                <AppSectionHeader
                    title="Team Summary"
                    subtitle="Leaderboard-facing performance metrics."
                />

                <AppCard>
                    <MetricRow
                        label="Team mean reaction time"
                        value={fmtMs(leaderboard?.teamMeanReactionTimeMs)}
                        hint="Computed from participants with reaction data."
                    />

                    <MetricRow
                        label="Tracing accuracy min / avg"
                        value={
                            leaderboard
                                ? `${fmtPct(leaderboard.minTracingAccuracyPct)} / ${fmtPct(
                                    leaderboard.avgTracingAccuracyPct,
                                )}`
                                : '—'
                        }
                        hint="Every participant must meet the threshold for leaderboard eligibility."
                    />
                </AppCard>

                <AppSectionHeader
                    title="Per Participant Breakdown"
                    subtitle="Mean reaction time ranks speed. Standard deviation ranks consistency."
                />

                {summaries.length === 0 ? (
                    <AppCard>
                        <InfoBanner
                            title="No results yet"
                            message="Record reaction trials and tracing results first."
                            tone="warning"
                        />
                    </AppCard>
                ) : (
                    <View style={styles.participantList}>
                        {summaries.map((summary) => {
                            const name = participantName(draft, summary.participantId);

                            const dominant = summary.dominant;
                            const nonDominant = summary.nonDominant;
                            const overall = summary.overallMeanReactionTimeMs;

                            const betterHand =
                                dominant?.meanReactionTimeMs != null &&
                                nonDominant?.meanReactionTimeMs != null
                                    ? dominant.meanReactionTimeMs < nonDominant.meanReactionTimeMs
                                        ? 'Dominant faster'
                                        : dominant.meanReactionTimeMs > nonDominant.meanReactionTimeMs
                                            ? 'Non-dominant faster'
                                            : 'Equal'
                                    : undefined;

                            const minFastest = minDefined([
                                dominant?.fastestReactionTimeMs,
                                nonDominant?.fastestReactionTimeMs,
                            ]);

                            return (
                                <AppCard key={summary.participantId}>
                                    <View style={styles.participantHeader}>
                                        <View style={styles.participantText}>
                                            <AppText variant="sectionTitle">{name}</AppText>

                                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                                Overall mean: {fmtMs(overall)}
                                            </AppText>
                                        </View>

                                        <AppBadge
                                            label={betterHand ?? 'Incomplete'}
                                            tone={betterHand ? 'info' : 'warning'}
                                        />
                                    </View>

                                    <View style={styles.handGrid}>
                                        <View style={styles.handBox}>
                                            <AppText variant="bodyStrong">Dominant hand</AppText>

                                            <MetricRow label="Trials" value={fmtN(dominant?.n)} compact/>
                                            <MetricRow
                                                label="Mean"
                                                value={fmtMs(dominant?.meanReactionTimeMs)}
                                                compact
                                            />
                                            <MetricRow
                                                label="Std dev"
                                                value={fmtMs(dominant?.stdDevReactionTimeMs)}
                                                compact
                                            />
                                        </View>

                                        <View style={styles.handBox}>
                                            <AppText variant="bodyStrong">Non-dominant hand</AppText>

                                            <MetricRow label="Trials" value={fmtN(nonDominant?.n)} compact/>
                                            <MetricRow
                                                label="Mean"
                                                value={fmtMs(nonDominant?.meanReactionTimeMs)}
                                                compact
                                            />
                                            <MetricRow
                                                label="Std dev"
                                                value={fmtMs(nonDominant?.stdDevReactionTimeMs)}
                                                compact
                                            />
                                        </View>
                                    </View>

                                    <View style={styles.summaryBox}>
                                        <MetricRow
                                            label="Fastest single reaction"
                                            value={fmtMs(minFastest)}
                                        />

                                        <MetricRow
                                            label="Tracing accuracy"
                                            value={fmtPct(summary.tracingAccuracyPct)}
                                        />
                                    </View>
                                </AppCard>
                            );
                        })}
                    </View>
                )}

                <AppSectionHeader
                    title="Experiment Readiness"
                    subtitle="You can continue once reaction and tracing data are complete."
                />

                <AppCard>
                    {canProceedToReflection ? (
                        <InfoBanner
                            title="Ready for reflection"
                            message="Reaction trials and tracing results are present. Continue to reflection and final submission."
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
                        title="Back to Reaction"
                        variant="outline"
                        onPress={goToReaction}
                    />

                    <AppButton
                        title="Back to Tracing"
                        variant="outline"
                        onPress={goToTracing}
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

    handGrid: {
        marginTop: spacing.md,
        gap: spacing.md,
    },

    handBox: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceMuted,
        borderRadius: radius.lg,
        padding: spacing.md,
    },

    summaryBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
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