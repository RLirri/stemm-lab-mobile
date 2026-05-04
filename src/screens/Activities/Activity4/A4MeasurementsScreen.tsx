// src/screens/Activities/Activity4/A4MeasurementsScreen.tsx

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {
    getActivity4RunDraft,
    upsertActivity4Measurement,
    type Activity4RunDraft,
} from '../../../store/activity4RunDraftStore';
import {startEarthquakeMeasurement} from '../../../services/activity4PhysicsService';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A4Measurements'>;

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

function toNumberOrUndefined(raw: string): number | undefined {
    const t = raw.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
}

function pickFinalScore(args: {
    sensorScore?: number;
    manualDeg?: number;
    manualCm?: number;
}): { finalScore: number; method: 'sensor' | 'manual_deg' | 'manual_cm' } | null {
    const {sensorScore, manualDeg, manualCm} = args;

    if (isFiniteNumber(sensorScore)) return {finalScore: sensorScore, method: 'sensor'};
    if (isFiniteNumber(manualDeg)) return {finalScore: manualDeg, method: 'manual_deg'};
    if (isFiniteNumber(manualCm)) return {finalScore: manualCm, method: 'manual_cm'};

    return null;
}

function formatMethod(method?: string) {
    if (method === 'sensor') return 'Sensor';
    if (method === 'manual_deg') return 'Manual degrees';
    if (method === 'manual_cm') return 'Manual cm';
    return '—';
}

export default function A4MeasurementsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);
    const [runningIndex, setRunningIndex] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [manualDegByDesign, setManualDegByDesign] = useState<Record<number, string>>({});
    const [manualCmByDesign, setManualCmByDesign] = useState<Record<number, string>>({});

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
            Alert.alert('Session expired', 'Please restart Activity 4.');
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

        const nextDeg: Record<number, string> = {};
        const nextCm: Record<number, string> = {};

        for (const m of d.measurements ?? []) {
            if (typeof m.designIndex === 'number') {
                if (isFiniteNumber((m as any).manualOutcomeDeg)) {
                    nextDeg[m.designIndex] = String((m as any).manualOutcomeDeg);
                }

                if (isFiniteNumber((m as any).manualOutcomeCm)) {
                    nextCm[m.designIndex] = String((m as any).manualOutcomeCm);
                }
            }
        }

        setManualDegByDesign(nextDeg);
        setManualCmByDesign(nextCm);
    }, [activityId, navigation, runId, user]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
        };
    }, []);

    const completedCount = useMemo(() => {
        if (!draft) return 0;
        return (draft.measurements ?? []).filter((m) => isFiniteNumber((m as any).finalScore)).length;
    }, [draft]);

    const designCount = draft?.session?.designCount ?? draft?.session?.designs?.length ?? 0;
    const durationSec = draft?.session?.vibrationDurationSec ?? 10;

    function startCountdown(totalSec: number) {
        if (timerRef.current) clearInterval(timerRef.current);

        const endAt = Date.now() + totalSec * 1000;
        setSecondsLeft(totalSec);

        timerRef.current = setInterval(() => {
            const remain = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
            setSecondsLeft(remain);

            if (remain <= 0) {
                if (timerRef.current) clearInterval(timerRef.current);
                timerRef.current = null;
                setSecondsLeft(null);
            }
        }, 200);
    }

    function measurementForDesign(d: Activity4RunDraft, designIndex: number) {
        return (d.measurements ?? []).find((m) => m.designIndex === designIndex) ?? null;
    }

    async function runTestForDesign(designIndex: number) {
        if (!draft) return;

        try {
            setRunningIndex(designIndex);
            setSubmitting(true);
            startCountdown(durationSec);

            const result = await startEarthquakeMeasurement({
                durationMs: durationSec * 1000,
                sampleIntervalMs: 50,
                vibrate: true,
            });

            const sensorScore = result.movementScore;
            const manualDeg = toNumberOrUndefined(manualDegByDesign[designIndex] ?? '');
            const manualCm = toNumberOrUndefined(manualCmByDesign[designIndex] ?? '');

            const final = pickFinalScore({
                sensorScore,
                manualDeg,
                manualCm,
            });

            const validationDelta =
                isFiniteNumber(sensorScore) && isFiniteNumber(manualDeg)
                    ? Math.abs(sensorScore - manualDeg)
                    : undefined;

            const updated = upsertActivity4Measurement(runId, {
                designIndex,
                magnitudeSamples: result.samples.map((s) =>
                    Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z),
                ),
                movementScore: sensorScore,
                manualOutcomeDeg: manualDeg,
                manualOutcomeCm: manualCm,
                finalScore: final?.finalScore,
                finalMethod: final?.method,
                validation:
                    validationDelta != null
                        ? {
                            delta: validationDelta,
                            flagged: validationDelta > 5,
                        }
                        : undefined,
            } as any);

            setDraft(updated);

            showToast(
                'Test completed',
                'success',
                `Final score: ${(final?.finalScore ?? sensorScore).toFixed(2)}. Lower is better.`,
            );
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to run vibration test.';
            Alert.alert('Error', message);
        } finally {
            setRunningIndex(null);
            setSubmitting(false);
            setSecondsLeft(null);

            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }

    function saveManualForDesign(designIndex: number) {
        if (!draft) return;

        const manualDeg = toNumberOrUndefined(manualDegByDesign[designIndex] ?? '');
        const manualCm = toNumberOrUndefined(manualCmByDesign[designIndex] ?? '');

        const existing = measurementForDesign(draft, designIndex);
        const sensorScore = existing ? (existing as any).movementScore : undefined;

        const final = pickFinalScore({
            sensorScore,
            manualDeg,
            manualCm,
        });

        if (!final) {
            Alert.alert(
                'Missing value',
                'Enter a manual outcome in degrees or cm, or run the sensor test to generate a score.',
            );
            return;
        }

        const validationDelta =
            isFiniteNumber(sensorScore) && isFiniteNumber(manualDeg)
                ? Math.abs(sensorScore - manualDeg)
                : undefined;

        const updated = upsertActivity4Measurement(runId, {
            designIndex,
            manualOutcomeDeg: manualDeg,
            manualOutcomeCm: manualCm,
            finalScore: final.finalScore,
            finalMethod: final.method,
            validation:
                validationDelta != null
                    ? {
                        delta: validationDelta,
                        flagged: validationDelta > 5,
                    }
                    : undefined,
        } as any);

        setDraft(updated);

        showToast(
            'Manual outcome saved',
            'success',
            `Final score: ${final.finalScore.toFixed(2)} (${formatMethod(final.method)}).`,
        );
    }

    function goToResults() {
        if (!draft) return;

        if (completedCount < designCount) {
            Alert.alert(
                'Incomplete',
                `You have completed ${completedCount}/${designCount} designs.\n\nA design is completed when it has a final score from sensor or manual input.`,
            );
            return;
        }

        showToast('Measurements complete', 'success', 'Opening results dashboard.');

        setTimeout(() => {
            navigation.navigate('A4Results', {activityId, runId});
        }, 700);
    }

    if (!user) return null;

    if (!draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading measurement draft..."/>
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 4" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    Measurements
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Place the phone at the center of each structure. Each run vibrates for{' '}
                    {durationSec} seconds.
                </AppText>
            </View>

            {secondsLeft != null ? (
                <View style={styles.runningBanner}>
                    <View>
                        <AppText variant="bodyStrong" color="inverseText">
                            Recording vibration
                        </AppText>

                        <AppText variant="caption" color="inverseText" style={styles.runningHint}>
                            Keep the phone still and do not touch the table.
                        </AppText>
                    </View>

                    <AppBadge label={`${secondsLeft}s left`} tone="info"/>
                </View>
            ) : null}

            <InfoBanner
                title="Fair measurement guidance"
                message="Keep phone placement, orientation, table surface, and vibration duration consistent for every design. Lower movement score means better vibration resistance."
                tone="info"
            />

            <AppSectionHeader
                title="Progress"
                subtitle="Each design needs one final score before results."
            />

            <AppCard>
                <View style={styles.progressRow}>
                    <AppText variant="bodyStrong">Completed designs</AppText>

                    <AppBadge
                        label={`${completedCount} / ${designCount}`}
                        tone={completedCount >= designCount ? 'success' : 'warning'}
                    />
                </View>
            </AppCard>

            <AppSectionHeader
                title="Design Tests"
                subtitle="Run sensor tests or save manual fallback scores."
            />

            {(draft.session.designs ?? []).map((design, index) => {
                const m = measurementForDesign(draft, index) as any;

                const sensorScore = m?.movementScore;
                const finalScore = m?.finalScore;
                const method = m?.finalMethod;

                const hasSensor = isFiniteNumber(sensorScore);
                const hasFinal = isFiniteNumber(finalScore);
                const isRunning = runningIndex === index;

                const folds = isFiniteNumber(design?.foldCount) ? design.foldCount : null;
                const pillars = isFiniteNumber(design?.pillarCount) ? design.pillarCount : null;

                const degRaw = manualDegByDesign[index] ?? '';
                const cmRaw = manualCmByDesign[index] ?? '';

                const delta = m?.validation?.delta;
                const flagged = m?.validation?.flagged === true;

                return (
                    <AppCard key={index}>
                        <View style={styles.designHeader}>
                            <View style={styles.designText}>
                                <AppText variant="sectionTitle">
                                    {design?.name ?? `Design ${index + 1}`}
                                </AppText>

                                <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                    {folds != null || pillars != null
                                        ? `Folds: ${folds ?? '—'} • Pillars: ${pillars ?? '—'}`
                                        : 'No design details yet'}
                                </AppText>
                            </View>

                            <AppBadge
                                label={hasFinal ? 'Completed' : 'Pending'}
                                tone={hasFinal ? 'success' : 'warning'}
                            />
                        </View>

                        <View style={styles.metricBox}>
                            <MetricRow
                                label="Sensor score"
                                value={hasSensor ? sensorScore.toFixed(2) : '—'}
                            />

                            <MetricRow
                                label="Final score"
                                value={hasFinal ? `${finalScore.toFixed(2)} (${formatMethod(method)})` : '—'}
                            />
                        </View>

                        {delta != null ? (
                            <InfoBanner
                                title={flagged ? 'Manual/sensor mismatch' : 'Manual/sensor comparison'}
                                message={`Difference: ${Number(delta).toFixed(2)}${
                                    flagged ? '. Check phone placement and retest if needed.' : '.'
                                }`}
                                tone={flagged ? 'warning' : 'info'}
                            />
                        ) : null}

                        <AppSectionHeader
                            title="Manual Outcome"
                            subtitle="Optional validation, required only when sensor score is unavailable."
                        />

                        <View style={styles.manualGrid}>
                            <AppInput
                                label="Outcome degrees"
                                value={degRaw}
                                onChangeText={(t) =>
                                    setManualDegByDesign((p) => ({
                                        ...p,
                                        [index]: t.replace(/[^0-9.\-]/g, ''),
                                    }))
                                }
                                placeholder="e.g. 4"
                                keyboardType="decimal-pad"
                            />

                            <AppInput
                                label="Outcome cm"
                                value={cmRaw}
                                onChangeText={(t) =>
                                    setManualCmByDesign((p) => ({
                                        ...p,
                                        [index]: t.replace(/[^0-9.\-]/g, ''),
                                    }))
                                }
                                placeholder="e.g. 1"
                                keyboardType="decimal-pad"
                            />
                        </View>

                        <View style={styles.actionRow}>
                            <AppButton
                                title="Save Manual"
                                variant="outline"
                                onPress={() => saveManualForDesign(index)}
                                disabled={submitting}
                                style={styles.actionButton}
                            />

                            <AppButton
                                title={isRunning ? 'Running...' : hasSensor ? 'Retest' : 'Start Test'}
                                onPress={() => void runTestForDesign(index)}
                                disabled={submitting}
                                loading={isRunning}
                                style={styles.actionButton}
                            />
                        </View>
                    </AppCard>
                );
            })}

            <AppButton
                title="Continue to Results"
                onPress={goToResults}
                disabled={submitting}
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

    runningBanner: {
        marginBottom: spacing.lg,
        borderRadius: radius.xl,
        backgroundColor: colors.primaryDark,
        padding: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    runningHint: {
        marginTop: spacing.xs,
        opacity: 0.8,
    },

    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    designHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    designText: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    metricBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
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

    manualGrid: {
        gap: spacing.md,
    },

    actionRow: {
        marginTop: spacing.lg,
        flexDirection: 'row',
        gap: spacing.md,
    },

    actionButton: {
        flex: 1,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});