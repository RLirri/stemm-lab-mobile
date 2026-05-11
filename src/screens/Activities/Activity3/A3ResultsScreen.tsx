// src/screens/Activities/Activity3/A3ResultsScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {type Activity3RunDraft, getActivity3RunDraft,} from '../../../store/activity3RunDraftStore';

import {
    A3_DISTANCES,
    A3_MATERIALS,
    computeSummary,
    getSubmissionGate,
    validateAllMeasurements,
} from '../../../services/activity3PhysicsService';

import ActivityBarChart from '../../../components/charts/ActivityBarChart';
import ResultsInsightCard from '../../../components/insights/ResultsInsightCard';
import PerformanceFeedbackCard from '../../../components/feedback/PerformanceFeedbackCard';
import {
    type A3VisualizationTrial,
    buildA3Visualization,
} from '../../../services/resultInsights/activity3VisualizationService';
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

type Props = NativeStackScreenProps<AppStackParamList, 'A3Results'>;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function formatDeg(value: number | undefined, digits = 1): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return `${value.toFixed(digits)}°`;
}

function formatText(value: string | undefined): string {
    const trimmed = value?.trim();
    return trimmed ? trimmed : '—';
}

export default function A3ResultsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);

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

        const d = getActivity3RunDraft(runId);

        if (!d) {
            Alert.alert('Session expired', 'Please restart Activity 3.', [
                {
                    text: 'OK',
                    onPress: () =>
                        navigation.replace('A3SessionSetup', {
                            activityId,
                        }),
                },
            ]);
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const validatedDraft = useMemo(() => {
        if (!draft) return null;
        return validateAllMeasurements(draft);
    }, [draft]);

    const summary = useMemo(() => {
        if (!validatedDraft) return null;
        return computeSummary(validatedDraft);
    }, [validatedDraft]);

    const submissionGate = useMemo(() => {
        if (!validatedDraft) return null;
        return getSubmissionGate(validatedDraft);
    }, [validatedDraft]);

    const designAverages = useMemo(() => {
        if (!validatedDraft) return [];

        const byDesign = new Map<number, { sum: number; count: number }>();

        for (const m of validatedDraft.measurements) {
            if (!m.isValid || m.bendAngleDeg == null) continue;

            const current = byDesign.get(m.designIndex) ?? {
                sum: 0,
                count: 0,
            };

            current.sum += m.bendAngleDeg;
            current.count += 1;

            byDesign.set(m.designIndex, current);
        }

        const rows = Array.from(byDesign.entries()).map(([designIndex, value]) => ({
            designIndex,
            avg: value.count > 0 ? value.sum / value.count : 0,
            count: value.count,
        }));

        rows.sort((a, b) => b.avg - a.avg);

        return rows;
    }, [validatedDraft]);

    const visualization = useMemo(() => {
        const trials: A3VisualizationTrial[] = designAverages.map((item) => ({
            label: `Design ${item.designIndex + 1}`,
            averageBendAngleDeg: item.avg,
        }));

        return buildA3Visualization(trials);
    }, [designAverages]);

    const performanceFeedback = useMemo(() => {
        const best = designAverages[0];
        const worst = designAverages[designAverages.length - 1];

        return generatePerformanceFeedback('activity3', {
            trials: designAverages.map((item) => ({
                label: `Design ${item.designIndex + 1}`,
                value: item.avg,
            })),
            bestValue: best?.avg,
            worstValue: worst?.avg,
        });
    }, [designAverages]);

    const leaderboardScore = useMemo(() => {
        if (!summary?.bestDesignAvgDeg) return 0;
        return Number(summary.bestDesignAvgDeg.toFixed(2));
    }, [summary]);

    const predictedDesignLabel =
        typeof validatedDraft?.prediction?.predictedBestDesignIndex === 'number'
            ? `Design ${validatedDraft.prediction.predictedBestDesignIndex + 1}`
            : undefined;

    const predictedDistanceLabel =
        typeof validatedDraft?.prediction?.predictedBestDistanceCm === 'number'
            ? `${validatedDraft.prediction.predictedBestDistanceCm} cm`
            : undefined;

    const bestDesignLabel =
        summary?.bestDesignIndex != null
            ? `Design ${Number(summary.bestDesignIndex) + 1}`
            : '—';

    const isReadyToSubmit = Boolean(
        submissionGate && !submissionGate.reasons?.length,
    );

    function onContinueToReflection() {
        if (!validatedDraft || !submissionGate) return;

        const blocking: string[] = [];

        if (!submissionGate.hasPrediction) {
            blocking.push('Prediction is missing.');
        }

        if (
            submissionGate.validCount <
            Math.max(3, validatedDraft.session.fanDesignCount)
        ) {
            blocking.push('Not enough valid measurements.');
        }

        const perDesign = new Map<number, number>();

        for (const m of validatedDraft.measurements) {
            if (!m.isValid) continue;

            perDesign.set(
                m.designIndex,
                (perDesign.get(m.designIndex) ?? 0) + 1,
            );
        }

        for (let i = 0; i < validatedDraft.session.fanDesignCount; i += 1) {
            if ((perDesign.get(i) ?? 0) < 1) {
                blocking.push(`Design ${i + 1} needs at least 1 valid measurement.`);
            }
        }

        if (blocking.length > 0) {
            Alert.alert('Incomplete data', blocking.join('\n'));
            return;
        }

        showToast(
            'Results ready',
            'success',
            'Opening reflection and submission.',
        );

        setTimeout(() => {
            navigation.navigate('A3ReflectionSubmit', {activityId, runId});
        }, 700);
    }

    if (!user) return null;

    if (!validatedDraft || !summary) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading results dashboard..."/>
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 3" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    Results Dashboard
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Review fan design performance, prediction accuracy, and submission
                    readiness.
                </AppText>
            </View>

            <View style={styles.heroCard}>
                <View style={styles.heroTop}>
                    <AppText variant="bodyStrong" color="inverseText">
                        Best Performing Design
                    </AppText>

                    <AppBadge
                        label={isReadyToSubmit ? 'Ready' : 'Needs review'}
                        tone={isReadyToSubmit ? 'success' : 'warning'}
                    />
                </View>

                <AppText variant="title" color="inverseText" style={styles.heroScore}>
                    {bestDesignLabel}
                </AppText>

                <AppText variant="subtitle" color="inverseText" style={styles.heroMeta}>
                    {summary.bestDesignAvgDeg != null
                        ? `${leaderboardScore}° average`
                        : 'No valid best design yet'}
                </AppText>

                <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                    Leaderboard score is based on the highest average bend angle from valid
                    measurements only.
                </AppText>
            </View>

            <AppSectionHeader
                title="Overall Summary"
                subtitle="Validated measurement statistics."
            />

            <AppCard>
                <MetricRow label="Valid measurements" value={String(summary.validCount)}/>

                <MetricRow
                    label="Average angle overall"
                    value={formatDeg(summary.avgAngleDeg, 2)}
                />

                <MetricRow
                    label="Leaderboard score"
                    value={summary.bestDesignAvgDeg != null ? `${leaderboardScore}°` : '—'}
                />
            </AppCard>

            <ActivityBarChart
                title="Design Performance Chart"
                subtitle="Average bend angle for each fan design"
                data={visualization.chartData}
                unitLabel="degrees"
            />

            <ResultsInsightCard insight={visualization.insight}/>

            <PerformanceFeedbackCard feedback={performanceFeedback}/>

            <AppSectionHeader
                title="Design Ranking"
                subtitle="Ranked by average valid bend angle."
            />

            <AppCard>
                {designAverages.length === 0 ? (
                    <AppText variant="body" color="textMuted">
                        No valid measurements recorded.
                    </AppText>
                ) : (
                    <View style={styles.rankList}>
                        {designAverages.map((item, index) => (
                            <View key={item.designIndex} style={styles.rankRow}>
                                <View style={styles.rankBadge}>
                                    <AppText variant="caption" color="inverseText">
                                        #{index + 1}
                                    </AppText>
                                </View>

                                <View style={styles.rankContent}>
                                    <AppText variant="bodyStrong">
                                        Design {item.designIndex + 1}
                                    </AppText>

                                    <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                        {item.count} valid measurement{item.count > 1 ? 's' : ''}
                                    </AppText>
                                </View>

                                <AppText variant="subtitle">{formatDeg(item.avg, 1)}</AppText>
                            </View>
                        ))}
                    </View>
                )}
            </AppCard>

            {summary.bestDesignIndex != null && summary.bestDesignAvgDeg != null ? (
                <>
                    <AppSectionHeader
                        title="Leaderboard Result"
                        subtitle="The score that will be used for team ranking."
                    />

                    <AppCard>
                        <View style={styles.scoreBox}>
                            <AppBadge label="Best design" tone="success"/>

                            <AppText variant="title" style={styles.scoreTitle}>
                                Design {Number(summary.bestDesignIndex) + 1}
                            </AppText>

                            <AppText variant="subtitle" color="primary">
                                {leaderboardScore}° average
                            </AppText>

                            <AppText variant="body" color="textMuted" style={styles.note}>
                                This value is calculated from valid measurements only.
                            </AppText>
                        </View>
                    </AppCard>
                </>
            ) : null}

            <AppSectionHeader
                title="Breakdown"
                subtitle="Average bend angle by distance and material."
            />

            <AppCard>
                <AppText variant="sectionTitle">By distance</AppText>

                <View style={styles.breakdownList}>
                    {A3_DISTANCES.map((distance) => (
                        <MetricRow
                            key={distance}
                            label={`${distance} cm`}
                            value={
                                summary.byDistance[distance] != null
                                    ? formatDeg(summary.byDistance[distance], 2)
                                    : '—'
                            }
                        />
                    ))}
                </View>

                <View style={styles.divider}/>

                <AppText variant="sectionTitle">By material</AppText>

                <View style={styles.breakdownList}>
                    {A3_MATERIALS.map((material) => (
                        <MetricRow
                            key={material}
                            label={material}
                            value={
                                summary.byMaterial[material] != null
                                    ? formatDeg(summary.byMaterial[material], 2)
                                    : '—'
                            }
                            capitalizeLabel
                        />
                    ))}
                </View>
            </AppCard>

            <AppSectionHeader
                title="Prediction Evaluation"
                subtitle="Compare your hypothesis with the measured best result."
            />

            <AppCard>
                <MetricRow
                    label="Predicted design"
                    value={formatText(predictedDesignLabel)}
                />

                <MetricRow
                    label="Predicted distance"
                    value={formatText(predictedDistanceLabel)}
                />

                <View style={styles.predictionBox}>
                    <View style={styles.predictionText}>
                        <AppText variant="bodyStrong">Prediction result</AppText>

                        <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                            The result checks whether your predicted best design matched the
                            measured best design.
                        </AppText>
                    </View>

                    <AppBadge
                        label={
                            summary.wasPredictionCorrect == null
                                ? 'Not recorded'
                                : summary.wasPredictionCorrect
                                    ? 'Correct'
                                    : 'Different'
                        }
                        tone={
                            summary.wasPredictionCorrect == null
                                ? 'warning'
                                : summary.wasPredictionCorrect
                                    ? 'success'
                                    : 'info'
                        }
                    />
                </View>
            </AppCard>

            <AppSectionHeader
                title="Submission Readiness"
                subtitle="Final checks before reflection and submission."
            />

            <AppCard>
                {submissionGate?.reasons?.length ? (
                    <>
                        <InfoBanner
                            title="Incomplete data"
                            message="Some requirements still need attention before submission."
                            tone="warning"
                        />

                        <View style={styles.reasonList}>
                            {submissionGate.reasons.map((reason, index) => (
                                <View key={`${reason}-${index}`} style={styles.reasonRow}>
                                    <View style={styles.reasonDot}/>

                                    <AppText variant="body" color="textMuted" style={styles.reasonText}>
                                        {reason}
                                    </AppText>
                                </View>
                            ))}
                        </View>
                    </>
                ) : (
                    <InfoBanner
                        title="Ready to submit"
                        message="Your data is ready for reflection and final submission."
                        tone="success"
                    />
                )}

                <AppText variant="caption" color="textMuted" style={styles.note}>
                    Note: GPS and video evidence may still be checked during final
                    submission.
                </AppText>
            </AppCard>

            <AppButton
                title="Continue to Reflection & Submit"
                onPress={onContinueToReflection}
            />

            <AppButton
                title="Back to Measurements"
                variant="outline"
                onPress={() =>
                    navigation.navigate('A3Measurements', {
                        activityId,
                        runId,
                    })
                }
                style={styles.backButton}
            />

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
    );
}

type MetricRowProps = {
    label: string;
    value: string;
    capitalizeLabel?: boolean;
};

function MetricRow({label, value, capitalizeLabel = false}: MetricRowProps) {
    return (
        <View style={styles.metricRow}>
            <AppText
                variant="bodyStrong"
                style={[styles.metricLabel, capitalizeLabel && styles.capitalize]}
            >
                {label}
            </AppText>

            <AppText variant="bodyStrong" align="right" style={styles.metricValue}>
                {value}
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
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

    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingVertical: spacing.sm,
    },

    metricLabel: {
        flex: 1,
    },

    metricValue: {
        flex: 1,
    },

    rankList: {
        gap: spacing.md,
    },

    rankRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.md,
    },

    rankBadge: {
        width: 42,
        height: 34,
        borderRadius: radius.md,
        backgroundColor: colors.primaryDark,
        alignItems: 'center',
        justifyContent: 'center',
    },

    rankContent: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    scoreBox: {
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.lg,
    },

    scoreTitle: {
        marginTop: spacing.md,
    },

    note: {
        marginTop: spacing.md,
    },

    breakdownList: {
        marginTop: spacing.sm,
    },

    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.divider,
        marginVertical: spacing.md,
    },

    capitalize: {
        textTransform: 'capitalize',
    },

    predictionBox: {
        marginTop: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    predictionText: {
        flex: 1,
    },

    reasonList: {
        marginTop: spacing.md,
        gap: spacing.sm,
    },

    reasonRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
    },

    reasonDot: {
        width: 7,
        height: 7,
        borderRadius: radius.pill,
        backgroundColor: colors.warning,
        marginTop: 7,
    },

    reasonText: {
        flex: 1,
    },

    backButton: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});