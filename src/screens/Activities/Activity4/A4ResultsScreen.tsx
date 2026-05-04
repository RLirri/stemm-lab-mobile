// src/screens/Activities/Activity4/A4ResultsScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {
    getActivity4RunDraft,
    type Activity4RunDraft,
} from '../../../store/activity4RunDraftStore';

import ActivityBarChart from '../../../components/charts/ActivityBarChart';
import ResultsInsightCard from '../../../components/insights/ResultsInsightCard';
import PerformanceFeedbackCard from '../../../components/feedback/PerformanceFeedbackCard';
import {
    buildA4Visualization,
    type A4VisualizationTrial,
} from '../../../services/resultInsights/activity4VisualizationService';
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

type Props = NativeStackScreenProps<AppStackParamList, 'A4Results'>;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

type MeasuredRow = {
    designIndex: number;
    name: string;
    score: number | null;
    hasScore: boolean;
};

function rankLabel(rank: number): string {
    return `#${rank}`;
}

function hasValidScore(row: MeasuredRow): row is MeasuredRow & { score: number } {
    return row.hasScore && typeof row.score === 'number' && Number.isFinite(row.score);
}

function formatScore(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return value.toFixed(2);
}

export default function A4ResultsScreen({
                                            route,
                                            navigation,
                                        }: Props): React.JSX.Element | null {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);

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

        const d = getActivity4RunDraft(runId);

        if (!d) {
            Alert.alert('Session expired', 'Please restart Activity 4.', [
                {
                    text: 'OK',
                    onPress: () => navigation.replace('A4SessionSetup', {activityId}),
                },
            ]);
            return;
        }

        if (typeof d.prediction?.predictedBestDesignIndex !== 'number') {
            Alert.alert('Prediction required', 'Please complete prediction first.', [
                {
                    text: 'Go to Prediction',
                    onPress: () => navigation.replace('A4Prediction', {activityId, runId}),
                },
            ]);
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const measuredRows = useMemo<MeasuredRow[]>(() => {
        if (!draft) return [];

        const rows: MeasuredRow[] = draft.session.designs.map((design, index) => {
            const measurement = draft.measurements.find(
                (item) => item.designIndex === index,
            );

            const score =
                typeof measurement?.movementScore === 'number' &&
                Number.isFinite(measurement.movementScore)
                    ? measurement.movementScore
                    : null;

            return {
                designIndex: index,
                name: design.name ?? `Design ${index + 1}`,
                score,
                hasScore: typeof score === 'number',
            };
        });

        rows.sort((a, b) => {
            if (a.score == null && b.score == null) return a.designIndex - b.designIndex;
            if (a.score == null) return 1;
            if (b.score == null) return -1;
            return a.score - b.score;
        });

        return rows;
    }, [draft]);

    const measuredCount = useMemo(
        () => measuredRows.filter((row) => row.hasScore).length,
        [measuredRows],
    );

    const best = useMemo(
        () => measuredRows.find((row) => row.hasScore) ?? null,
        [measuredRows],
    );

    const averageMovementScore = useMemo(() => {
        const scoredRows = measuredRows.filter(hasValidScore);

        if (scoredRows.length === 0) return null;

        const total = scoredRows.reduce((sum, row) => sum + row.score, 0);
        return total / scoredRows.length;
    }, [measuredRows]);

    const visualization = useMemo(() => {
        const trials: A4VisualizationTrial[] = measuredRows
            .filter(hasValidScore)
            .map((row) => ({
                label: row.name,
                movementScore: row.score,
            }));

        return buildA4Visualization(trials);
    }, [measuredRows]);

    const predictionInfo = useMemo(() => {
        if (!draft) return null;

        const predicted = draft.prediction?.predictedBestDesignIndex;
        const predictedIndex = typeof predicted === 'number' ? predicted : null;

        const predictedName =
            predictedIndex != null
                ? draft.session.designs[predictedIndex]?.name ?? `Design ${predictedIndex + 1}`
                : '—';

        const bestIndex = best?.designIndex ?? null;

        const correct =
            predictedIndex != null && bestIndex != null ? predictedIndex === bestIndex : null;

        return {
            predictedIndex,
            predictedName,
            bestIndex,
            correct,
        };
    }, [best, draft]);

    const performanceFeedback = useMemo(() => {
        return generatePerformanceFeedback('activity4', {
            trials: measuredRows.filter(hasValidScore).map((row) => ({
                label: row.name,
                movementScore: row.score,
            })),
            predictedBestDesign: predictionInfo?.predictedName,
            measuredBestDesign: best?.name,
            wasPredictionCorrect: predictionInfo?.correct,
            averageMovementScore,
        });
    }, [averageMovementScore, best?.name, measuredRows, predictionInfo]);

    function onBackToMeasurements() {
        navigation.navigate('A4Measurements', {activityId, runId});
    }

    function onContinueToComparison() {
        if (!draft) return;

        if (draft.session.designCount < 3) {
            Alert.alert('Setup issue', 'Activity 4 requires at least 3 designs.');
            return;
        }

        if (measuredCount < draft.session.designCount) {
            Alert.alert(
                'Not complete',
                `You tested ${measuredCount}/${draft.session.designCount} designs.\nPlease test all designs before submitting.`,
            );
            return;
        }

        showToast(
            'Results ready',
            'success',
            'Opening comparison dashboard.',
        );

        setTimeout(() => {
            navigation.navigate('A4Comparison', {activityId, runId});
        }, 700);
    }

    if (!user) return null;

    if (!draft || !predictionInfo) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading results dashboard..."/>
            </AppGradientScreen>
        );
    }

    const ready = measuredCount >= draft.session.designCount;

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 4" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    Results Dashboard
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Lower movement score means the structure absorbed vibration better.
                </AppText>
            </View>

            <View style={styles.heroCard}>
                <View style={styles.heroTop}>
                    <AppText variant="bodyStrong" color="inverseText">
                        Most Stable Design
                    </AppText>

                    <AppBadge
                        label={ready ? 'Ready' : 'Needs data'}
                        tone={ready ? 'success' : 'warning'}
                    />
                </View>

                <AppText variant="title" color="inverseText" style={styles.heroScore}>
                    {best && hasValidScore(best) ? best.name : '—'}
                </AppText>

                <AppText variant="subtitle" color="inverseText" style={styles.heroMeta}>
                    {best && hasValidScore(best)
                        ? `${best.score.toFixed(2)} movement score`
                        : 'No measured designs yet'}
                </AppText>

                <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                    The most stable design has the lowest movement score.
                </AppText>
            </View>

            <AppSectionHeader
                title="Overall Summary"
                subtitle="Validated structure test results."
            />

            <AppCard>
                <MetricRow
                    label="Tested designs"
                    value={`${measuredCount} / ${draft.session.designCount}`}
                />

                <MetricRow
                    label="Average movement score"
                    value={averageMovementScore != null ? averageMovementScore.toFixed(2) : '—'}
                />

                <MetricRow
                    label="Best movement score"
                    value={best && hasValidScore(best) ? best.score.toFixed(2) : '—'}
                />
            </AppCard>

            <ActivityBarChart
                title="Structural Stability Chart"
                subtitle="Movement score comparison across structure designs"
                data={visualization.chartData}
                unitLabel="movement score"
            />

            <ResultsInsightCard insight={visualization.insight}/>

            <PerformanceFeedbackCard feedback={performanceFeedback}/>

            <AppSectionHeader
                title="Prediction Evaluation"
                subtitle="Compare your predicted most stable design with the measured result."
            />

            <AppCard>
                <MetricRow label="Your prediction" value={predictionInfo.predictedName}/>
                <MetricRow label="Most stable design" value={best?.name ?? '—'}/>

                <View style={styles.predictionBox}>
                    <View style={styles.predictionText}>
                        <AppText variant="bodyStrong">Prediction result</AppText>

                        <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                            This checks whether your predicted best design matched the lowest
                            movement score.
                        </AppText>
                    </View>

                    <AppBadge
                        label={
                            predictionInfo.correct == null
                                ? 'Not available'
                                : predictionInfo.correct
                                    ? 'Correct'
                                    : 'Different'
                        }
                        tone={
                            predictionInfo.correct == null
                                ? 'warning'
                                : predictionInfo.correct
                                    ? 'success'
                                    : 'info'
                        }
                    />
                </View>
            </AppCard>

            <AppSectionHeader
                title="Design Ranking"
                subtitle="Sorted by movement score. Lower score means better stability."
            />

            <View style={styles.rankList}>
                {measuredRows.map((row, index) => (
                    <AppCard key={row.designIndex}>
                        <View style={styles.rankRow}>
                            <View style={styles.rankBadge}>
                                <AppText variant="caption" color="inverseText">
                                    {rankLabel(index + 1)}
                                </AppText>
                            </View>

                            <View style={styles.rankContent}>
                                <AppText variant="bodyStrong" numberOfLines={1}>
                                    {row.name}
                                </AppText>

                                <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                    {hasValidScore(row)
                                        ? `Movement score: ${row.score.toFixed(2)}`
                                        : 'Not tested yet'}
                                </AppText>
                            </View>

                            <AppBadge
                                label={row.hasScore ? 'Done' : 'Missing'}
                                tone={row.hasScore ? 'success' : 'warning'}
                            />
                        </View>
                    </AppCard>
                ))}
            </View>

            <AppSectionHeader
                title="Submission Readiness"
                subtitle="Final check before comparison and reflection."
            />

            <AppCard>
                {ready ? (
                    <InfoBanner
                        title="Ready to continue"
                        message="All structure designs have been tested."
                        tone="success"
                    />
                ) : (
                    <InfoBanner
                        title="More testing needed"
                        message={`You still need to test ${
                            draft.session.designCount - measuredCount
                        } design(s).`}
                        tone="warning"
                    />
                )}

                <AppText variant="caption" color="textMuted" style={styles.note}>
                    Note: GPS and video evidence may be enforced during final submission.
                </AppText>
            </AppCard>

            <View style={styles.actions}>
                <AppButton
                    title="Back to Measurements"
                    variant="outline"
                    onPress={onBackToMeasurements}
                />

                <AppButton
                    title="Continue to Comparison"
                    onPress={onContinueToComparison}
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
    );
}

type MetricRowProps = {
    label: string;
    value: string;
};

function MetricRow({label, value}: MetricRowProps): React.JSX.Element {
    return (
        <View style={styles.metricRow}>
            <AppText variant="bodyStrong" style={styles.metricLabel}>
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

    smallGap: {
        marginTop: spacing.xs,
    },

    rankList: {
        gap: spacing.md,
    },

    rankRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
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

    note: {
        marginTop: spacing.md,
    },

    actions: {
        marginTop: spacing.lg,
        gap: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});