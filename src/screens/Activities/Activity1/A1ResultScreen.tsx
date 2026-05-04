// src/screens/Activities/Activity1/A1ResultScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {
    getRunDraft,
    updateAttempt,
    type ActivityRunDraft,
    type AttemptComputedDraft,
    type AttemptDraft,
} from '../../../store/activityRunDraftStore';

import A1PredictedActualChart from '../../../components/charts/A1PredictedActualChart';
import ResultsInsightCard from '../../../components/insights/ResultsInsightCard';
import PerformanceFeedbackCard from '../../../components/feedback/PerformanceFeedbackCard';
import {
    buildA1Visualization,
    theoreticalDropTimeSec,
    type A1PredictionPoint,
} from '../../../services/resultInsights/activity1VisualizationService';
import {generatePerformanceFeedback} from '../../../services/performanceFeedback/performanceFeedbackService';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppSectionHeader,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A1Result'>;

const G = 9.8;

function attemptLabel(index: number): string {
    return index === 0 ? 'Baseline' : `Prototype ${index}`;
}

function attemptFullLabel(index: number): string {
    return index === 0 ? 'Baseline (No parachute)' : `Prototype ${index}`;
}

function round(n: number | undefined, dp = 2): number | undefined {
    if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
    const f = Math.pow(10, dp);
    return Math.round(f * n) / f;
}

function isPosNumber(x: unknown): x is number {
    return typeof x === 'number' && Number.isFinite(x) && x > 0;
}

function isNonNegNumber(x: unknown): x is number {
    return typeof x === 'number' && Number.isFinite(x) && x >= 0;
}

function formatNumber(value: number | undefined, digits = 2, unit = ''): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

export default function A1ResultScreen({
                                           route,
                                           navigation,
                                       }: Props): React.JSX.Element | null {
    const user = auth.currentUser;
    const {activityId, runId, attemptIndex} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);
    const [attempt, setAttempt] = useState<AttemptDraft | null>(null);

    useEffect(() => {
        if (!user) return;

        const d = getRunDraft(runId);

        if (!d) {
            Alert.alert(
                'Session expired',
                'Your draft session was reset. Please start again.',
                [
                    {
                        text: 'OK',
                        onPress: () => navigation.replace('A1SessionSetup', {activityId}),
                    },
                ],
            );
            return;
        }

        const a = d.attempts?.[attemptIndex];

        if (!a) {
            Alert.alert('Attempt missing', 'This attempt slot does not exist.', [
                {text: 'OK', onPress: () => navigation.goBack()},
            ]);
            return;
        }

        setDraft(d);
        setAttempt(a);
    }, [activityId, attemptIndex, navigation, runId, user]);

    const computed = useMemo<AttemptComputedDraft>(() => {
        if (!draft || !attempt) return {};

        const session = draft.session;
        const plan = attempt.plan;
        const meas = attempt.measurements;

        const tHit = meas?.tHitSec;
        const tStop = meas?.tStopSec;
        const dropHeightM = plan.dropHeightM ?? session.dropHeightM;

        const massUnknown =
            plan.payloadMassUnknown ?? session.payloadMassUnknown ?? false;
        const massG = plan.payloadMassG ?? session.payloadMassG;
        const massKg = !massUnknown && isPosNumber(massG) ? massG / 1000 : undefined;

        const velocity =
            isPosNumber(dropHeightM) && isPosNumber(tHit) ? dropHeightM / tHit : undefined;

        const acceleration =
            velocity != null && isPosNumber(tHit) ? velocity / tHit : undefined;

        const netForce =
            massKg != null && acceleration != null ? massKg * acceleration : undefined;

        const weight = massKg != null ? massKg * G : undefined;

        const dragForce =
            weight != null && netForce != null ? weight - netForce : undefined;

        let gForce: number | undefined;

        if (velocity != null && isPosNumber(tStop)) {
            const bounce = Boolean(meas?.bounceOccurred);

            if (bounce && isPosNumber(meas?.bounceTimeToPeakSec)) {
                const vUp = G * meas.bounceTimeToPeakSec;
                gForce = (velocity + vUp) / tStop / G;
            } else {
                gForce = velocity / tStop / G;
            }
        }

        return {
            velocity,
            acceleration,
            netForce,
            weight,
            dragForce,
            gForce,
        };
    }, [attempt, draft]);

    const visualization = useMemo(() => {
        if (!draft) return buildA1Visualization([]);

        const points: A1PredictionPoint[] = Object.entries(draft.attempts ?? {})
            .map(([key, item]) => {
                const index = Number(key);
                const itemHeight = item.plan.dropHeightM ?? draft.session.dropHeightM;

                if (!isPosNumber(itemHeight)) return null;

                const predictedTimeSec = theoreticalDropTimeSec(itemHeight);
                const actualTimeSec = item.measurements?.tHitSec;

                if (!isPosNumber(predictedTimeSec) || !isPosNumber(actualTimeSec)) {
                    return null;
                }

                const errorPercent =
                    (Math.abs(actualTimeSec - predictedTimeSec) / actualTimeSec) * 100;

                return {
                    label: attemptLabel(index),
                    predictedTimeSec,
                    actualTimeSec,
                    errorPercent,
                };
            })
            .filter((point): point is A1PredictionPoint => point !== null);

        return buildA1Visualization(points);
    }, [draft]);

    const performanceFeedback = useMemo(
        () => generatePerformanceFeedback('activity1', visualization.points),
        [visualization.points],
    );

    function persistComputed() {
        const updated = updateAttempt(runId, attemptIndex, {computed});
        setDraft(updated);
        setAttempt(updated.attempts[attemptIndex]);
    }

    function onSaveAttempt() {
        if (!attempt?.measurements?.tHitSec) {
            Alert.alert('Missing data', 'Please complete measurements first.');
            return;
        }

        persistComputed();
        Alert.alert('Saved', 'Attempt saved to the session draft.');
    }

    const canAddNextPrototype = useMemo(() => {
        if (!draft) return false;

        const s = draft.session;
        const timerOk = !s.endsAt || Date.now() < s.endsAt;

        return attemptIndex < 3 && timerOk;
    }, [attemptIndex, draft]);

    function onAddNextPrototype() {
        persistComputed();

        navigation.navigate('A1AttemptPlan', {
            activityId,
            runId,
            attemptIndex: attemptIndex + 1,
        });
    }

    function onFinish() {
        persistComputed();
        navigation.navigate('A1Comparison', {activityId, runId});
    }

    if (!user) return null;

    if (!draft || !attempt) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading result dashboard..."/>
            </AppGradientScreen>
        );
    }

    const meas = attempt.measurements;
    const session = draft.session;
    const plan = attempt.plan;

    const dropHeightM = plan.dropHeightM ?? session.dropHeightM;
    const massUnknown =
        plan.payloadMassUnknown ?? session.payloadMassUnknown ?? false;
    const massG = plan.payloadMassG ?? session.payloadMassG;

    const theoreticalTime = isPosNumber(dropHeightM)
        ? theoreticalDropTimeSec(dropHeightM)
        : undefined;
    const currentActualTime = meas?.tHitSec;

    const currentErrorPercent =
        isPosNumber(theoreticalTime) && isPosNumber(currentActualTime)
            ? (Math.abs(currentActualTime - theoreticalTime) / currentActualTime) * 100
            : undefined;

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge
                    label={attemptIndex === 0 ? 'Baseline' : `Prototype ${attemptIndex}`}
                    tone={attemptIndex === 0 ? 'info' : 'primary'}
                />

                <AppText variant="title" style={styles.title}>
                    Results Dashboard
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    {attemptFullLabel(attemptIndex)} · Review computed physics values,
                    prediction accuracy, and performance feedback.
                </AppText>
            </View>

            <View style={styles.heroCard}>
                <AppText variant="bodyStrong" color="inverseText">
                    Closest to Free-Fall Model
                </AppText>

                <AppText variant="title" color="inverseText" style={styles.heroScore}>
                    {visualization.best
                        ? `${visualization.best.errorPercent.toFixed(1)}%`
                        : '—'}
                </AppText>

                <AppText variant="body" color="inverseText" style={styles.heroMeta}>
                    {visualization.best
                        ? visualization.best.label
                        : 'Complete a measured attempt to calculate accuracy.'}
                </AppText>

                <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                    Accuracy compares theoretical drop time with actual measured flight
                    time.
                </AppText>
            </View>

            <A1PredictedActualChart
                title="Free-Fall Model vs Actual Drop Time"
                subtitle="Theoretical time is calculated from drop height, then compared with measured flight time."
                data={visualization.points}
            />

            <ResultsInsightCard insight={visualization.insight}/>

            <PerformanceFeedbackCard feedback={performanceFeedback}/>

            <AppSectionHeader
                title="Physics Formula"
                subtitle="The reference model used for theoretical drop time."
            />

            <AppCard>
                <View style={styles.formulaBox}>
                    <AppText variant="title" align="center">
                        t = √(2h / g)
                    </AppText>
                </View>

                <AppText variant="body" color="textMuted" style={styles.note}>
                    t is theoretical drop time, h is drop height, and g is gravitational
                    acceleration. This model gives a baseline prediction before parachute
                    and drag effects are considered.
                </AppText>
            </AppCard>

            <AppSectionHeader
                title="Current Attempt Accuracy"
                subtitle="How this measured attempt compares with the theoretical model."
            />

            <AppCard>
                <MetricRow
                    label="Theoretical drop time"
                    value={formatNumber(theoreticalTime, 2, 's')}
                />

                <MetricRow
                    label="Actual flight time"
                    value={formatNumber(currentActualTime, 2, 's')}
                />

                <MetricRow
                    label="Difference from free-fall model"
                    value={formatNumber(currentErrorPercent, 1, '%')}
                />

                <InfoBanner
                    title="Interpretation"
                    message="A lower error percentage means the measured result is closer to the theoretical physics model."
                    tone="info"
                />
            </AppCard>

            <AppSectionHeader
                title="Primary School View"
                subtitle="Simple values suitable for younger learners."
            />

            <AppCard>
                <MetricRow label="Flight time (t_hit)" value={formatNumber(meas?.tHitSec, 2, 's')}/>

                <MetricRow
                    label="Stopping time (t_stop)"
                    value={formatNumber(meas?.tStopSec, 2, 's')}
                />

                {session.targetZoneEnabled ? (
                    <>
                        <MetricRow
                            label="In target zone?"
                            value={
                                typeof meas?.inTargetZone === 'boolean'
                                    ? meas.inTargetZone
                                        ? 'Yes'
                                        : 'No'
                                    : '—'
                            }
                        />

                        <MetricRow
                            label="Distance from center"
                            value={
                                isNonNegNumber(meas?.distanceFromCenterCm)
                                    ? `${round(meas.distanceFromCenterCm, 0)} cm`
                                    : '—'
                            }
                        />
                    </>
                ) : (
                    <AppText variant="body" color="textMuted" style={styles.note}>
                        Target zone was not used in this session.
                    </AppText>
                )}
            </AppCard>

            <AppSectionHeader
                title="High School View"
                subtitle="Computed motion and force values."
            />

            <AppCard>
                <AppText variant="body" color="textMuted" style={styles.introText}>
                    Computations depend on known height and mass. If mass is unknown,
                    force-related values are not computed.
                </AppText>

                <MetricRow label="Drop height" value={formatNumber(dropHeightM, 2, 'm')}/>

                <MetricRow
                    label="Payload mass"
                    value={
                        massUnknown
                            ? 'Unknown'
                            : isPosNumber(massG)
                                ? `${round(massG, 0)} g`
                                : '—'
                    }
                />

                <View style={styles.divider}/>

                <MetricRow
                    label="Final velocity (v = d / t_hit)"
                    value={formatNumber(computed.velocity, 2, 'm/s')}
                />

                <MetricRow
                    label="Acceleration (a = v / t_hit)"
                    value={formatNumber(computed.acceleration, 2, 'm/s²')}
                />

                <MetricRow
                    label="Net force (F_net = m × a)"
                    value={formatNumber(computed.netForce, 2, 'N')}
                />

                <MetricRow
                    label="Weight (W = m × g)"
                    value={formatNumber(computed.weight, 2, 'N')}
                />

                <MetricRow
                    label="Drag force (F_drag = W − F_net)"
                    value={formatNumber(computed.dragForce, 2, 'N')}
                />

                <View style={styles.divider}/>

                <MetricRow
                    label="G-force impact"
                    value={formatNumber(computed.gForce, 1, 'g')}
                />

                <InfoBanner
                    title="Impact interpretation"
                    message={
                        computed.gForce != null
                            ? computed.gForce < 5
                                ? 'Likely safe range (1–5 g).'
                                : computed.gForce < 10
                                    ? 'Moderate impact (5–10 g).'
                                    : computed.gForce < 30
                                        ? 'High impact (10–30 g). Improve cushioning or parachute design.'
                                        : 'Very high impact. Consider better cushioning and parachute design.'
                            : 'G-force needs velocity and a positive stopping time.'
                    }
                    tone={computed.gForce != null && computed.gForce >= 10 ? 'warning' : 'info'}
                />
            </AppCard>

            <AppButton title="Save Attempt" onPress={onSaveAttempt}/>

            {canAddNextPrototype ? (
                <AppButton
                    title="Add Next Prototype"
                    variant="outline"
                    onPress={onAddNextPrototype}
                    style={styles.actionSpacing}
                />
            ) : null}

            <AppButton
                title="Finish & Compare"
                variant="ghost"
                onPress={onFinish}
                style={styles.actionSpacing}
            />

            <View style={styles.bottomSpace}/>
        </AppGradientScreen>
    );
}

type MetricRowProps = {
    label: string;
    value: string;
};

function MetricRow({label, value}: MetricRowProps) {
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

    heroScore: {
        marginTop: spacing.sm,
    },

    heroMeta: {
        marginTop: spacing.xs,
        opacity: 0.9,
    },

    heroHint: {
        marginTop: spacing.md,
        opacity: 0.75,
    },

    formulaBox: {
        borderRadius: radius.xl,
        backgroundColor: colors.accentSoft,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.md,
    },

    note: {
        marginTop: spacing.md,
    },

    introText: {
        marginBottom: spacing.md,
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
        minWidth: 90,
    },

    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.divider,
        marginVertical: spacing.md,
    },

    actionSpacing: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});