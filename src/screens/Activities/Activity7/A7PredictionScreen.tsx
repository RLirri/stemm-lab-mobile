// src/screens/Activities/Activity7/A7PredictionScreen.tsx

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {
    type A7MeasurementPhase,
    type Activity7RunDraft,
    getActivity7RunDraft,
    setActivity7Prediction,
    validateA7Prediction,
} from '../../../store/activity7RunDraftStore';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A7Prediction'>;
type HighestPhasePick = A7MeasurementPhase;
type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function isFiniteNumber(x: unknown): x is number {
    return typeof x === 'number' && Number.isFinite(x);
}

function digitsOnly(s: string) {
    return s.replace(/[^\d]/g, '');
}

function parseBpm(input: string): number | null {
    const cleaned = digitsOnly(input);
    if (!cleaned) return null;

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

export default function A7PredictionScreen({route, navigation}: Props) {
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity7RunDraft | null>(null);

    const [restBpmText, setRestBpmText] = useState('');
    const [afterExerciseBpmText, setAfterExerciseBpmText] = useState('');
    const [highestPhasePick, setHighestPhasePick] = useState<HighestPhasePick | null>(null);

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

    const refresh = useCallback(() => {
        const d = getActivity7RunDraft(runId);
        setDraft(d);

        if (d?.prediction) {
            const rest = d.prediction.predictedRestBpm;
            const after = d.prediction.predictedAfterExerciseBpm;

            setRestBpmText(isFiniteNumber(rest) ? String(Math.round(rest)) : '');
            setAfterExerciseBpmText(isFiniteNumber(after) ? String(Math.round(after)) : '');
            setHighestPhasePick(d.prediction.expectedHighestPhase ?? null);
        }
    }, [runId]);

    useEffect(() => {
        const d = getActivity7RunDraft(runId);

        if (!d) {
            Alert.alert(
                'Session expired',
                'Your Activity 7 session draft was not found. Please start again.',
                [
                    {
                        text: 'OK',
                        onPress: () => navigation.replace('A7SessionSetup', {activityId}),
                    },
                ],
            );
            return;
        }

        setDraft(d);

        const rest = d.prediction?.predictedRestBpm;
        const after = d.prediction?.predictedAfterExerciseBpm;

        setRestBpmText(isFiniteNumber(rest) ? String(Math.round(rest)) : '');
        setAfterExerciseBpmText(isFiniteNumber(after) ? String(Math.round(after)) : '');
        setHighestPhasePick(d.prediction?.expectedHighestPhase ?? null);
    }, [activityId, navigation, runId]);

    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh]),
    );

    const view = useMemo(() => {
        if (!draft) return null;

        const restParsed = parseBpm(restBpmText);
        const afterParsed = parseBpm(afterExerciseBpmText);

        const restOk = restParsed != null && restParsed >= 1 && restParsed <= 80;
        const afterOk = afterParsed != null && afterParsed >= 1 && afterParsed <= 120;

        return {
            participantCount: draft.session.participantCount ?? 1,
            measurementDurationSec: clampInt(
                draft.session.measurementDurationSec ?? 30,
                10,
                120,
            ),
            targetSamplingHz: draft.session.targetSamplingHz ?? 25,

            restParsed,
            afterParsed,

            restOk,
            afterOk,
            highestPhaseOptional: true,

            ready: restOk && afterOk,
        };
    }, [draft, restBpmText, afterExerciseBpmText]);

    function persistPrediction() {
        if (!draft) return null;

        const restParsed = parseBpm(restBpmText);
        const afterParsed = parseBpm(afterExerciseBpmText);

        const next = setActivity7Prediction(runId, {
            predictedRestBpm: restParsed != null ? clampInt(restParsed, 1, 80) : undefined,
            predictedAfterExerciseBpm:
                afterParsed != null ? clampInt(afterParsed, 1, 120) : undefined,
            expectedHighestPhase: highestPhasePick ?? undefined,
        });

        setDraft(next);
        return next;
    }

    function onSave() {
        if (!draft || !view) return;

        if (!view.restOk) {
            Alert.alert(
                'Missing prediction',
                'Please enter your predicted breathing rate at rest between 1 and 80 breaths/min.',
            );
            return;
        }

        if (!view.afterOk) {
            Alert.alert(
                'Missing prediction',
                'Please enter your predicted breathing rate after exercise between 1 and 120 breaths/min.',
            );
            return;
        }

        const next = persistPrediction();
        if (!next) return;

        const err = validateA7Prediction(next);

        if (err) {
            Alert.alert('Prediction required', err);
            return;
        }

        showToast(
            'Prediction saved',
            'success',
            'You can start the breathing measurements now.',
        );
    }

    function onContinue() {
        if (!draft || !view) return;

        if (!view.restOk || !view.afterOk) {
            Alert.alert(
                'Complete prediction first',
                'Please enter predicted breathing rate at rest and after exercise before continuing.',
            );
            return;
        }

        const next = persistPrediction();
        if (!next) return;

        const err = validateA7Prediction(next);

        if (err) {
            Alert.alert('Prediction required', err);
            return;
        }

        showToast(
            'Prediction saved',
            'success',
            'Opening breathing measurements.',
        );

        setTimeout(() => {
            navigation.navigate('A7Measurements', {activityId, runId});
        }, 700);
    }

    if (!draft || !view) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading prediction draft..."/>
            </AppGradientScreen>
        );
    }

    const participants = draft.session.participants ?? [];

    return (
        <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <AppGradientScreen>
                <View style={styles.header}>
                    <AppBadge label="Activity 7" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Prediction
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Predict breathing rate at rest and after exercise before starting
                        measurements.
                    </AppText>
                </View>

                <InfoBanner
                    title="Prediction task"
                    message="Make a hypothesis before measuring. The result screen will compare your predicted breathing rate with measured breathing phases."
                    tone="info"
                />

                <AppSectionHeader
                    title="Session Settings"
                    subtitle="Review the breathing measurement requirements."
                />

                <AppCard>
                    <MetricRow label="Participants" value={String(view.participantCount)}/>
                    <MetricRow label="Measurement duration" value={`${view.measurementDurationSec}s`}/>
                    <MetricRow label="Target sampling rate" value={`${Math.round(view.targetSamplingHz)} Hz`}/>

                    <InfoBanner
                        title="Completion requirement"
                        message="Each participant should complete three phases: Rest, Post-Jog, and Post-Star-Jumps."
                        tone="info"
                    />
                </AppCard>

                <AppSectionHeader
                    title="Participants"
                    subtitle="Rotate through each participant during the measurement flow."
                />

                <AppCard>
                    <View style={styles.participantList}>
                        {participants.map((p, index) => (
                            <View key={p.id} style={styles.participantCard}>
                                <View style={styles.participantText}>
                                    <AppText variant="bodyStrong">
                                        {p.name ?? `Participant ${index + 1}`}
                                    </AppText>

                                    <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                        Required phases: 3
                                    </AppText>
                                </View>

                                <AppBadge label={`P${index + 1}`} tone="info"/>
                            </View>
                        ))}
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Your Predictions"
                    subtitle="Enter breathing-rate estimates in breaths per minute."
                />

                <AppCard>
                    <AppInput
                        label="Predicted breathing rate at rest"
                        value={restBpmText}
                        onChangeText={(text) => setRestBpmText(digitsOnly(text))}
                        placeholder="e.g. 12"
                        keyboardType="number-pad"
                        maxLength={3}
                    />

                    <AppText variant="caption" color="textMuted" style={styles.helpText}>
                        Enter 1–80 breaths/min. A typical resting breathing rate is often
                        around 10–20 breaths/min.
                    </AppText>

                    <AppInput
                        label="Predicted breathing rate after exercise"
                        value={afterExerciseBpmText}
                        onChangeText={(text) => setAfterExerciseBpmText(digitsOnly(text))}
                        placeholder="e.g. 24"
                        keyboardType="number-pad"
                        maxLength={3}
                    />

                    <AppText variant="caption" color="textMuted" style={styles.helpText}>
                        Enter 1–120 breaths/min. This prediction will be compared against
                        post-exercise phases.
                    </AppText>

                    <View style={styles.previewBox}>
                        <AppText variant="bodyStrong" color="primary">
                            Prediction preview
                        </AppText>

                        <AppText variant="body" style={styles.smallGap}>
                            Rest: {view.restParsed != null ? `${clampInt(view.restParsed, 1, 80)} BPM` : '—'} ·
                            After exercise:{' '}
                            {view.afterParsed != null
                                ? `${clampInt(view.afterParsed, 1, 120)} BPM`
                                : '—'}
                        </AppText>
                    </View>

                    <AppText variant="bodyStrong" style={styles.choiceTitle}>
                        Which phase will have the highest breathing rate? Optional
                    </AppText>

                    <View style={styles.choiceColumn}>
                        <ChoiceButton
                            label="Rest"
                            selected={highestPhasePick === 'rest'}
                            onPress={() => setHighestPhasePick('rest')}
                        />

                        <ChoiceButton
                            label="Post-Jog"
                            selected={highestPhasePick === 'post_jog_1min'}
                            onPress={() => setHighestPhasePick('post_jog_1min')}
                        />

                        <ChoiceButton
                            label="Post-Star-Jumps"
                            selected={highestPhasePick === 'post_star_jumps_100'}
                            onPress={() => setHighestPhasePick('post_star_jumps_100')}
                        />
                    </View>

                    <View style={styles.checkList}>
                        <ChecklistRow label="Rest prediction entered" ok={view.restOk}/>
                        <ChecklistRow label="After-exercise prediction entered" ok={view.afterOk}/>
                        <ChecklistRow label="Highest-phase prediction optional" ok/>
                    </View>

                    <AppButton
                        title="Save Prediction"
                        variant="outline"
                        onPress={onSave}
                        style={styles.saveButton}
                    />
                </AppCard>

                <AppSectionHeader title="What Happens Next"/>

                <AppCard>
                    <View style={styles.stepList}>
                        <StepItem index={1} title="Measure breathing at rest"/>
                        <StepItem index={2} title="Measure breathing after jogging"/>
                        <StepItem index={3} title="Measure breathing after star jumps"/>
                        <StepItem index={4} title="Review results, reflect, and submit"/>
                    </View>
                </AppCard>

                {!view.ready ? (
                    <InfoBanner
                        title="Prediction incomplete"
                        message="Enter valid rest and after-exercise breathing predictions before continuing."
                        tone="warning"
                    />
                ) : null}

                <AppButton
                    title="Continue to Measurements"
                    onPress={onContinue}
                    disabled={!view.ready}
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
        </KeyboardAvoidingView>
    );
}

type ChoiceButtonProps = {
    label: string;
    selected: boolean;
    onPress: () => void;
};

function ChoiceButton({label, selected, onPress}: ChoiceButtonProps) {
    return (
        <Pressable
            onPress={onPress}
            style={[styles.choiceButton, selected && styles.choiceButtonOn]}
        >
            <AppText
                variant="bodyStrong"
                color={selected ? 'inverseText' : 'text'}
                align="center"
            >
                {label}
            </AppText>
        </Pressable>
    );
}

type ChecklistRowProps = {
    label: string;
    ok: boolean;
};

function ChecklistRow({label, ok}: ChecklistRowProps) {
    return (
        <View style={styles.checkRow}>
            <AppText variant="bodyStrong" style={styles.checkText}>
                {label}
            </AppText>

            <AppBadge label={ok ? 'OK' : 'Missing'} tone={ok ? 'success' : 'warning'}/>
        </View>
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

    title: {
        marginTop: spacing.md,
    },

    subtitle: {
        marginTop: spacing.sm,
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

    participantList: {
        gap: spacing.md,
    },

    participantCard: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceMuted,
        borderRadius: radius.lg,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    participantText: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    helpText: {
        marginTop: spacing.sm,
        marginBottom: spacing.md,
    },

    previewBox: {
        marginTop: spacing.lg,
        borderWidth: 1,
        borderColor: colors.primarySoft,
        backgroundColor: colors.accentSoft,
        borderRadius: radius.lg,
        padding: spacing.md,
    },

    choiceTitle: {
        marginTop: spacing.lg,
    },

    choiceColumn: {
        marginTop: spacing.md,
        gap: spacing.sm,
    },

    choiceButton: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingVertical: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
    },

    choiceButtonOn: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },

    checkList: {
        marginTop: spacing.lg,
        gap: spacing.md,
    },

    checkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    checkText: {
        flex: 1,
    },

    saveButton: {
        marginTop: spacing.lg,
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

    bottomSpace: {
        height: spacing.xxl,
    },
});