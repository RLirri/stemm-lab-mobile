// src/screens/Activities/Activity2/A2ResultsScreen.tsx

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';

import {type Activity2RunDraft, getActivity2RunDraft, setA2Computed,} from '../../../store/activity2RunDraftStore';

import {
    classifySoundRisk,
    scoreActivity2AverageDb,
    SOUND_RISK_BANDS,
    type SoundRiskCategory,
} from '../../../services/scoringService';

import ActivityBarChart from '../../../components/charts/ActivityBarChart';
import ResultsInsightCard from '../../../components/insights/ResultsInsightCard';
import PerformanceFeedbackCard from '../../../components/feedback/PerformanceFeedbackCard';
import {
    type A2VisualizationTrial,
    buildA2Visualization,
} from '../../../services/resultInsights/activity2VisualizationService';
import {generatePerformanceFeedback} from '../../../services/performanceFeedback/performanceFeedbackService';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppInput,
    AppSectionHeader,
    AppStatusToast,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A2Results'>;

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

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

function normalize(s: string): string {
    return s.trim().toLowerCase();
}

function maxOrUndefined(nums: number[]): number | undefined {
    if (!nums.length) return undefined;
    return nums.reduce((m, v) => (v > m ? v : m), nums[0]);
}

function pickEarmuffRecommendation(avgDb: number, maxDb?: number) {
    const peak = isFiniteNumber(maxDb) ? maxDb : avgDb;

    if (peak >= 110) {
        return {
            level: 'Strongly recommended',
            reason: 'Levels near sirens or horns can damage hearing immediately.',
            tone: 'danger' as const,
        };
    }

    if (peak >= 100) {
        return {
            level: 'Recommended',
            reason: 'Very loud levels can cause serious hearing damage in minutes.',
            tone: 'danger' as const,
        };
    }

    if (peak >= 85) {
        return {
            level: 'Consider for long exposure',
            reason: 'Sustained exposure around 85–90 dB can lead to hearing damage.',
            tone: 'warning' as const,
        };
    }

    if (peak >= 60) {
        return {
            level: 'Not needed for short activities',
            reason: 'Generally safe, but long exposure can cause fatigue.',
            tone: 'info' as const,
        };
    }

    return {
        level: 'Not needed',
        reason: 'Quiet levels pose no hearing risk.',
        tone: 'success' as const,
    };
}

function formatRiskLabel(cat?: SoundRiskCategory): string {
    if (!cat) return '—';
    const found = SOUND_RISK_BANDS.find((b) => b.category === cat);
    return found?.label ?? String(cat);
}

export default function A2ResultsScreen({
                                            route,
                                            navigation,
                                        }: Props): React.JSX.Element | null {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity2RunDraft | null>(null);
    const [surprises, setSurprises] = useState<string>('');
    const [earmuffsThought, setEarmuffsThought] = useState<string>('');

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

    const refreshDraft = useCallback(() => {
        const d = getActivity2RunDraft(runId);
        setDraft(d ?? null);
    }, [runId]);

    useEffect(() => {
        if (!user) return;

        const d = getActivity2RunDraft(runId);

        if (!d) {
            Alert.alert('Session expired', 'Please restart the activity.');
            navigation.replace('A2SessionSetup', {activityId});
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            refreshDraft();
        }, [refreshDraft, user]),
    );

    const computed = useMemo(() => {
        if (!draft) return null;

        const {score, validCount} = scoreActivity2AverageDb(draft.actions);

        const valid = draft.actions.filter(
            (action) => action.isValid === true && isFiniteNumber(action.dbAvg),
        );

        const maxDb = maxOrUndefined(
            valid
                .map((action) =>
                    isFiniteNumber(action.dbMax) ? action.dbMax : action.dbAvg,
                )
                .filter((x): x is number => isFiniteNumber(x)),
        );

        const sorted = valid
            .slice()
            .sort((a, b) => (b.dbAvg as number) - (a.dbAvg as number));

        const loudest = sorted[0];
        const top3 = sorted.slice(0, 3);

        const predicted = (draft.session.predictedLoudestAction ?? '').trim();
        const loudestLabel = (loudest?.actionLabel ?? '').trim();

        const hasPrediction = predicted.length > 0;
        const hasOutcome = loudestLabel.length > 0;

        const predictionCorrect =
            hasPrediction && hasOutcome
                ? normalize(predicted) === normalize(loudestLabel)
                : undefined;

        return {
            validCount,
            avgDb: score,
            score,
            maxDb,
            loudestActionLabel: hasOutcome ? loudestLabel : undefined,
            loudestAvgDb: loudest?.dbAvg,
            loudestRisk: loudest?.riskCategory,
            top3,
            validActions: valid,
            predicted: hasPrediction ? predicted : undefined,
            wasPredictionCorrect: predictionCorrect,
        };
    }, [draft]);

    const visualization = useMemo(() => {
        if (!computed) return buildA2Visualization([]);

        const trials: A2VisualizationTrial[] = computed.validActions.map((action) => ({
            label: action.actionLabel?.trim() || 'Action',
            avgDb: action.dbAvg as number,
        }));

        return buildA2Visualization(trials);
    }, [computed]);

    const performanceFeedback = useMemo(() => {
        const trials = computed
            ? computed.validActions.map((action) => ({
                label: action.actionLabel?.trim() || 'Action',
                avgDb: action.dbAvg as number,
                maxDb: isFiniteNumber(action.dbMax)
                    ? action.dbMax
                    : (action.dbAvg as number),
                riskLabel: action.riskLabel ?? formatRiskLabel(action.riskCategory),
            }))
            : [];

        return generatePerformanceFeedback('activity2', {
            trials,
            predictedLoudestAction: computed?.predicted,
            loudestActionLabel: computed?.loudestActionLabel,
            wasPredictionCorrect: computed?.wasPredictionCorrect,
            averageDb: computed?.avgDb,
            maxDb: computed?.maxDb,
        });
    }, [computed]);

    const predictionSummary = useMemo(() => {
        const predicted = computed?.predicted;
        const loudest = computed?.loudestActionLabel;

        if (!predicted) {
            return {
                status: 'missing' as const,
                text: 'No prediction recorded',
                tone: 'warning' as const,
            };
        }

        if (!loudest) {
            return {
                status: 'missing' as const,
                text: 'No loudest action yet',
                tone: 'warning' as const,
            };
        }

        const correct = computed?.wasPredictionCorrect === true;

        return {
            status: correct ? 'correct' as const : 'wrong' as const,
            text: correct ? 'Prediction matched' : 'Prediction differed',
            tone: correct ? 'success' as const : 'info' as const,
        };
    }, [
        computed?.loudestActionLabel,
        computed?.predicted,
        computed?.wasPredictionCorrect,
    ]);

    function persistComputedForSubmission() {
        if (!computed) return;

        setA2Computed(runId, {
            validCount: computed.validCount,
            avgDb: computed.avgDb,
            score: computed.score,
            loudestActionLabel: computed.loudestActionLabel,
            wasPredictionCorrect: computed.wasPredictionCorrect,
            updatedAt: Date.now(),
        });
    }

    function onContinueToSubmit() {
        if (!draft || !computed) return;

        if (computed.validCount < 3) {
            Alert.alert(
                'Minimum requirement',
                'You must have at least 3 valid measurements to continue.',
                [
                    {
                        text: 'Back to Measurements',
                        onPress: () =>
                            navigation.navigate('A2Measurement', {
                                activityId,
                                runId,
                            }),
                    },
                    {text: 'OK', style: 'cancel'},
                ],
            );
            return;
        }

        persistComputedForSubmission();

        showToast(
            'Results saved',
            'success',
            'Opening reflection and submission.',
        );

        setTimeout(() => {
            navigation.navigate('A2ReflectionSubmit', {activityId, runId});
        }, 700);
    }

    if (!user) return null;

    if (!draft || !computed) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading results dashboard..."/>
            </AppGradientScreen>
        );
    }

    const avgRisk = classifySoundRisk(computed.avgDb);
    const earmuffs = pickEarmuffRecommendation(computed.avgDb, computed.maxDb);
    const canContinue = computed.validCount >= 3;

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 2" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    Results Dashboard
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Review sound measurements, compare noise levels, and interpret
                    hearing-risk exposure.
                </AppText>
            </View>

            <View style={styles.heroCard}>
                <View style={styles.heroTop}>
                    <AppText variant="bodyStrong" color="inverseText">
                        Noisiest Action
                    </AppText>

                    <AppBadge
                        label={avgRisk?.label ?? 'Risk unknown'}
                        tone={computed.avgDb >= 85 ? 'warning' : 'success'}
                    />
                </View>

                <AppText variant="title" color="inverseText" style={styles.heroScore}>
                    {visualization.noisiest
                        ? `${visualization.noisiest.avgDb.toFixed(1)} dB`
                        : '—'}
                </AppText>

                <AppText variant="body" color="inverseText" style={styles.heroMeta}>
                    {visualization.noisiest?.label ??
                        'Record valid measurements to calculate this.'}
                </AppText>

                <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                    Higher dB values represent louder environments and greater potential
                    exposure risk.
                </AppText>
            </View>

            <ActivityBarChart
                title="Noise Level Comparison"
                subtitle="Average decibel level across recorded actions"
                data={visualization.chartData}
                unitLabel="dB"
            />

            <ResultsInsightCard insight={visualization.insight}/>

            <PerformanceFeedbackCard feedback={performanceFeedback}/>

            <AppSectionHeader
                title="Noise Level Guide"
                subtitle="A simple interpretation scale for classroom sound exposure."
            />

            <AppCard>
                <GuideRow color={colors.success} label="Below 60 dB" value="Generally comfortable"/>
                <GuideRow color={colors.warning} label="60–84 dB" value="Moderate to loud"/>
                <GuideRow color={colors.danger} label="85 dB and above" value="Risky for long exposure"/>
            </AppCard>

            <AppSectionHeader
                title="Prediction vs Outcome"
                subtitle="Compare your hypothesis with the measured loudest action."
            />

            <AppCard>
                <MetricRow
                    label="Predicted loudest action"
                    value={draft.session.predictedLoudestAction?.trim() || '—'}
                />

                <MetricRow
                    label="Measured loudest action"
                    value={computed.loudestActionLabel ?? '—'}
                />

                <View style={styles.predictionBox}>
                    <View style={styles.predictionText}>
                        <AppText variant="bodyStrong">Prediction result</AppText>

                        <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                            This is based on exact label matching between prediction and result.
                        </AppText>
                    </View>

                    <AppBadge label={predictionSummary.text} tone={predictionSummary.tone}/>
                </View>

                <InfoBanner
                    title="Measurement reminder"
                    message="Phone dB estimates are approximate. Keep distance and device position consistent for fair comparison."
                    tone="info"
                />
            </AppCard>

            <AppSectionHeader
                title="Session Summary"
                subtitle="Key values computed from valid sound measurements."
            />

            <AppCard>
                <MetricRow label="Valid measurements" value={String(computed.validCount)}/>
                <MetricRow label="Average score" value={`${round1(computed.avgDb)} dB`}/>
                <MetricRow label="Average risk category" value={avgRisk?.label ?? '—'}/>

                <MetricRow
                    label="Max peak"
                    value={
                        isFiniteNumber(computed.maxDb)
                            ? `${round1(computed.maxDb)} dB`
                            : '—'
                    }
                />

                <View style={styles.divider}/>

                <AppText variant="sectionTitle">Top 3 loudest actions</AppText>

                {computed.top3.length ? (
                    <View style={styles.topList}>
                        {computed.top3.map((action, index) => (
                            <View key={action.id} style={styles.topRow}>
                                <View style={styles.topIndex}>
                                    <AppText variant="caption" color="inverseText">
                                        #{index + 1}
                                    </AppText>
                                </View>

                                <View style={styles.topContent}>
                                    <AppText variant="bodyStrong">
                                        {action.actionLabel || 'Action'}
                                    </AppText>

                                    <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                        {isFiniteNumber(action.dbAvg)
                                            ? `${round1(action.dbAvg)} dB`
                                            : '—'}{' '}
                                        • {action.riskLabel ?? formatRiskLabel(action.riskCategory)}
                                    </AppText>
                                </View>
                            </View>
                        ))}
                    </View>
                ) : (
                    <AppText variant="body" color="textMuted" style={styles.emptyText}>
                        No valid actions yet. Go back and record at least 3 valid measurements.
                    </AppText>
                )}
            </AppCard>

            <AppSectionHeader
                title="Should We Wear Earmuffs?"
                subtitle="A safety recommendation based on average and peak dB."
            />

            <AppCard>
                <View style={styles.recoBox}>
                    <AppBadge label={earmuffs.level} tone={earmuffs.tone}/>

                    <AppText variant="body" style={styles.recoText}>
                        {earmuffs.reason}
                    </AppText>
                </View>

                <AppInput
                    label="Your reasoning (optional notes)"
                    value={earmuffsThought}
                    onChangeText={setEarmuffsThought}
                    placeholder="e.g. If our classroom often exceeds 85 dB, we should reduce exposure or use protection..."
                    multiline
                    style={styles.multiInput}
                />
            </AppCard>

            <AppSectionHeader
                title="Any Surprises?"
                subtitle="Reflect on why some actions were louder than expected."
            />

            <AppCard>
                <AppText variant="body" color="textMuted">
                    Sound intensity varies with energy, surfaces, distance, and duration.
                </AppText>

                <AppInput
                    label="Write-up notes (optional)"
                    value={surprises}
                    onChangeText={setSurprises}
                    placeholder="e.g. Talking near the wall was louder than expected because sound reflected..."
                    multiline
                    style={styles.largeInput}
                />
            </AppCard>

            <AppSectionHeader
                title="Sound Levels & Hearing Damage Risk"
                subtitle="Reference table required by the activity specification."
            />

            <AppCard>
                <View style={styles.tableHeader}>
                    <AppText variant="caption" style={styles.dbCell}>
                        dB
                    </AppText>
                    <AppText variant="caption" style={styles.exampleCell}>
                        Examples
                    </AppText>
                    <AppText variant="caption" style={styles.riskCell}>
                        Risk
                    </AppText>
                </View>

                {SOUND_RISK_BANDS.map((band) => (
                    <View key={band.rangeLabel} style={styles.tableRow}>
                        <AppText variant="caption" style={styles.dbCell}>
                            {band.rangeLabel}
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.exampleCell}>
                            {band.examples}
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.riskCell}>
                            {band.riskText}
                        </AppText>
                    </View>
                ))}
            </AppCard>

            {!canContinue ? (
                <InfoBanner
                    title="Not ready to submit"
                    message={`You currently have ${computed.validCount} valid measurement(s). Record at least 3 valid measurements to continue.`}
                    tone="warning"
                />
            ) : null}

            <AppButton
                title="Continue to Submission"
                onPress={onContinueToSubmit}
                disabled={!canContinue}
            />

            <AppButton
                title="Back to Measurements"
                variant="outline"
                onPress={() =>
                    navigation.navigate('A2Measurement', {
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

type GuideRowProps = {
    color: string;
    label: string;
    value: string;
};

function GuideRow({color, label, value}: GuideRowProps) {
    return (
        <View style={styles.guideRow}>
            <View style={[styles.guideDot, {backgroundColor: color}]}/>

            <View style={styles.guideText}>
                <AppText variant="bodyStrong">{label}</AppText>
                <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                    {value}
                </AppText>
            </View>
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
        justifyContent: 'space-between',
        gap: spacing.md,
        alignItems: 'center',
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

    guideRow: {
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'center',
        paddingVertical: spacing.sm,
    },

    guideDot: {
        width: 14,
        height: 14,
        borderRadius: radius.pill,
    },

    guideText: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
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
        marginBottom: spacing.md,
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

    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.divider,
        marginVertical: spacing.md,
    },

    topList: {
        marginTop: spacing.md,
        gap: spacing.md,
    },

    topRow: {
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'flex-start',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.md,
    },

    topIndex: {
        width: 42,
        height: 34,
        borderRadius: radius.md,
        backgroundColor: colors.primaryDark,
        alignItems: 'center',
        justifyContent: 'center',
    },

    topContent: {
        flex: 1,
    },

    emptyText: {
        marginTop: spacing.md,
    },

    recoBox: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceMuted,
        borderRadius: radius.lg,
        padding: spacing.md,
        marginBottom: spacing.lg,
    },

    recoText: {
        marginTop: spacing.md,
    },

    multiInput: {
        minHeight: 90,
        textAlignVertical: 'top',
    },

    largeInput: {
        minHeight: 110,
        textAlignVertical: 'top',
    },

    tableHeader: {
        flexDirection: 'row',
        gap: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.divider,
        paddingBottom: spacing.sm,
    },

    tableRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.divider,
    },

    dbCell: {
        flex: 1.1,
    },

    exampleCell: {
        flex: 2.2,
    },

    riskCell: {
        flex: 1.7,
    },

    backButton: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});