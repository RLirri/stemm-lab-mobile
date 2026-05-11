// src/screens/Activities/Activity2/A2PredictionScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View,} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {
    type Activity2RunDraft,
    getActivity2RunDraft,
    updateActivity2Session,
} from '../../../store/activity2RunDraftStore';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A2Prediction'>;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function normalizeLabel(x: string): string | undefined {
    const s = x.trim();
    return s.length ? s : undefined;
}

const QUICK_ACTIONS = [
    'Drop a pen',
    'Drop a book',
    'Talking',
    'Walking',
    'Stamp feet',
] as const;

export default function A2PredictionScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity2RunDraft | null>(null);

    const [selectedQuick, setSelectedQuick] = useState<string | null>(null);
    const [customRaw, setCustomRaw] = useState<string>('');

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

        const d = getActivity2RunDraft(runId);

        if (!d) {
            Alert.alert(
                'Session expired',
                'Your draft session was reset. Please start again.',
                [
                    {
                        text: 'OK',
                        onPress: () => navigation.replace('A2SessionSetup', {activityId}),
                    },
                ],
            );
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    useEffect(() => {
        if (!draft) return;

        const predicted = draft.session.predictedLoudestAction ?? '';
        const match = QUICK_ACTIONS.find(
            (q) => q.toLowerCase() === predicted.toLowerCase(),
        );

        if (match) {
            setSelectedQuick(match);
            setCustomRaw('');
        } else {
            setSelectedQuick(null);
            setCustomRaw(predicted);
        }
    }, [draft]);

    const chosen = useMemo(() => {
        const fromQuick = selectedQuick ? selectedQuick.trim() : '';
        if (fromQuick) return fromQuick;
        return customRaw.trim();
    }, [customRaw, selectedQuick]);

    function persistPrediction() {
        const next = updateActivity2Session(runId, {
            predictedLoudestAction: normalizeLabel(chosen),
        });

        setDraft(next);
    }

    function validate(): string | null {
        if (!chosen.trim()) {
            return 'Please choose or type your predicted loudest action.';
        }

        if (chosen.trim().length > 60) {
            return 'Prediction is too long. Keep it under 60 characters.';
        }

        return null;
    }

    function onContinue() {
        if (!user) return;
        if (!draft) return;

        const err = validate();

        if (err) {
            Alert.alert('Check prediction', err);
            return;
        }

        persistPrediction();

        showToast(
            'Prediction saved',
            'success',
            'You can now start collecting sound measurements.',
        );

        setTimeout(() => {
            navigation.navigate('A2Measurement', {activityId, runId});
        }, 700);
    }

    function onSelectQuick(v: string) {
        setSelectedQuick(v);
        setCustomRaw('');
    }

    function onUseCustom() {
        setSelectedQuick(null);
    }

    if (!user) return null;

    if (!draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading prediction draft..."/>
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
                    <AppBadge label="Activity 2" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Prediction
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Predict which classroom action will produce the loudest sound. You
                        will compare this prediction after collecting measurements.
                    </AppText>
                </View>

                <InfoBanner
                    title="Prediction task"
                    message="Choose one expected loudest action before measurement. This keeps the activity inquiry-based rather than just data collection."
                    tone="info"
                />

                <AppSectionHeader
                    title="Quick Picks"
                    subtitle="Select a common classroom action."
                />

                <AppCard>
                    <View style={styles.segmentWrap}>
                        {QUICK_ACTIONS.map((v) => {
                            const on = selectedQuick === v;

                            return (
                                <PredictionChip
                                    key={v}
                                    label={v}
                                    active={on}
                                    onPress={() => onSelectQuick(v)}
                                />
                            );
                        })}
                    </View>

                    <AppButton
                        title="Use Custom Action Instead"
                        variant="ghost"
                        onPress={onUseCustom}
                        style={styles.customButton}
                    />
                </AppCard>

                <AppSectionHeader
                    title="Custom Prediction"
                    subtitle="Use this if your predicted action is not listed above."
                />

                <AppCard>
                    <AppInput
                        label="Predicted loudest action"
                        value={customRaw}
                        onChangeText={(t) => {
                            setCustomRaw(t);

                            if (t.trim().length) {
                                setSelectedQuick(null);
                            }
                        }}
                        placeholder='e.g. "Drop a metal water bottle"'
                        maxLength={60}
                    />

                    <View style={styles.previewBox}>
                        <AppText variant="caption" color="textMuted">
                            Current selection
                        </AppText>

                        <AppText variant="bodyStrong" style={styles.previewValue}>
                            {chosen.trim() ? chosen.trim() : 'No prediction selected'}
                        </AppText>
                    </View>
                </AppCard>

                <AppSectionHeader title="What Happens Next"/>

                <AppCard>
                    <AppText variant="body" color="textMuted">
                        You will record at least three measurements with decibel values and
                        optional GPS data. Then you will view a map and results dashboard to
                        check whether your prediction was correct.
                    </AppText>

                    <View style={styles.stepList}>
                        <StepItem index={1} title="Measurement loop"/>
                        <StepItem index={2} title="Map review"/>
                        <StepItem index={3} title="Results dashboard"/>
                        <StepItem index={4} title="Reflection and submit"/>
                    </View>
                </AppCard>

                <AppButton title="Continue" onPress={onContinue}/>

                <AppText variant="caption" color="textMuted" style={styles.footerHint}>
                    Next: Measurement loop → Map → Results → Reflection & Submit.
                </AppText>

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

type PredictionChipProps = {
    label: string;
    active: boolean;
    onPress: () => void;
};

function PredictionChip({label, active, onPress}: PredictionChipProps) {
    return (
        <Pressable
            onPress={onPress}
            style={[styles.predictionChip, active && styles.predictionChipActive]}
        >
            <AppText
                variant="bodyStrong"
                color={active ? 'inverseText' : 'text'}
                align="center"
            >
                {label}
            </AppText>
        </Pressable>
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

    segmentWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    predictionChip: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },

    predictionChipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    customButton: {
        marginTop: spacing.lg,
    },

    previewBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },

    previewValue: {
        marginTop: spacing.xs,
    },

    stepList: {
        marginTop: spacing.lg,
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

    footerHint: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});