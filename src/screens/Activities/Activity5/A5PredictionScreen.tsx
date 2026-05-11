// src/screens/Activities/Activity5/A5PredictionScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {
    type A5MovementSpec,
    type Activity5RunDraft,
    createActivity5RunDraft,
    getActivity5RunDraft,
    setActivity5Prediction,
    validateA5Prediction,
} from '../../../store/activity5RunDraftStore';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A5Prediction'>;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function trimOrUndef(s?: string) {
    const t = s?.trim();
    return t ? t : undefined;
}

export default function A5PredictionScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity5RunDraft | null>(null);
    const [predictedVibrationLevel, setPredictedVibrationLevel] = useState('');
    const [predictedMostDifficultMovement, setPredictedMostDifficultMovement] = useState('');

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

        let d = runId ? getActivity5RunDraft(runId) : null;

        if (!d) {
            d = createActivity5RunDraft({
                activityId,
                createdBy: user.uid,
                participantCount: 1,
                samplingHz: 50,
                movementDurationSec: 20,
                gpsEnabled: true,
                feedbackEnabled: true,
            });
        }

        setDraft(d);
    }, [activityId, runId, user]);

    useEffect(() => {
        if (!draft) return;

        setPredictedVibrationLevel(draft.prediction?.predictedVibrationLevel ?? '');
        setPredictedMostDifficultMovement(
            draft.prediction?.predictedMostDifficultMovement ?? '',
        );
    }, [draft]);

    const movements: A5MovementSpec[] = useMemo(() => {
        return draft?.session.movements ?? [];
    }, [draft]);

    const predictionError = useMemo(() => {
        if (!draft) return null;

        const shadow: Activity5RunDraft = {
            ...draft,
            prediction: {
                predictedVibrationLevel: trimOrUndef(predictedVibrationLevel),
                predictedMostDifficultMovement: trimOrUndef(predictedMostDifficultMovement),
                createdAt: draft.prediction?.createdAt ?? Date.now(),
                updatedAt: Date.now(),
            },
        };

        return validateA5Prediction(shadow);
    }, [draft, predictedMostDifficultMovement, predictedVibrationLevel]);

    const selectedMovementTitle = useMemo(() => {
        if (!predictedMostDifficultMovement) return 'None selected';

        return (
            movements.find((m) => m.type === predictedMostDifficultMovement)?.title ??
            predictedMostDifficultMovement
        );
    }, [movements, predictedMostDifficultMovement]);

    const predictionPreview = useMemo(() => {
        const vibration = predictedVibrationLevel.trim();
        const movement = selectedMovementTitle;

        if (!vibration && movement === 'None selected') {
            return 'Enter a vibration estimate and choose the movement you expect to be hardest.';
        }

        return `Expected vibration: ${vibration || 'not entered'} · Hardest movement: ${movement}`;
    }, [predictedVibrationLevel, selectedMovementTitle]);

    function persistPrediction(): Activity5RunDraft | null {
        if (!draft) return null;

        const next = setActivity5Prediction(draft.runId, {
            predictedVibrationLevel: trimOrUndef(predictedVibrationLevel),
            predictedMostDifficultMovement: trimOrUndef(predictedMostDifficultMovement),
        });

        setDraft(next);
        return next;
    }

    function onContinue() {
        if (!draft) return;

        const err = predictionError;

        if (err) {
            Alert.alert('Prediction required', err);
            return;
        }

        const next = persistPrediction();
        if (!next) return;

        showToast(
            'Prediction saved',
            'success',
            'Opening guided movement trials.',
        );

        setTimeout(() => {
            navigation.navigate('A5GuidedTrials', {
                activityId,
                runId: next.runId,
            });
        }, 700);
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
                    <AppBadge label="Activity 5" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Prediction
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Predict the expected vibration level and which movement will be
                        hardest to keep smooth.
                    </AppText>
                </View>

                <InfoBanner
                    title="Prediction task"
                    message="Make a hypothesis before recording trials. The result dashboard will compare your prediction with movement smoothness and displacement metrics."
                    tone="info"
                />

                <AppSectionHeader
                    title="Predicted Vibration Level"
                    subtitle="Estimate the expected vibration or movement intensity."
                />

                <AppCard>
                    <AppInput
                        label="Your prediction"
                        value={predictedVibrationLevel}
                        onChangeText={setPredictedVibrationLevel}
                        placeholder='e.g. "medium" or "~5 mm"'
                    />

                    <View style={styles.exampleBox}>
                        <AppText variant="bodyStrong" color="primary">
                            Example formats
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                            low · medium · high · around 5 mm · very unstable
                        </AppText>
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Predicted Most Difficult Movement"
                    subtitle="Choose the movement expected to be hardest to keep smooth."
                />

                <AppCard>
                    <View style={styles.chipWrap}>
                        {movements.map((m) => {
                            const selected = predictedMostDifficultMovement === m.type;

                            return (
                                <MovementChip
                                    key={m.type}
                                    label={m.title}
                                    selected={selected}
                                    onPress={() => setPredictedMostDifficultMovement(m.type)}
                                />
                            );
                        })}
                    </View>

                    <View style={styles.previewBox}>
                        <AppText variant="caption" color="textMuted">
                            Current prediction
                        </AppText>

                        <AppText variant="bodyStrong" style={styles.previewText}>
                            {predictionPreview}
                        </AppText>
                    </View>
                </AppCard>

                <AppSectionHeader title="What Happens Next"/>

                <AppCard>
                    <View style={styles.stepList}>
                        <StepItem index={1} title="Record guided movement trials"/>
                        <StepItem index={2} title="Compare smoothness and displacement"/>
                        <StepItem index={3} title="Review performance feedback"/>
                        <StepItem index={4} title="Reflect and submit"/>
                    </View>
                </AppCard>

                {predictionError ? (
                    <InfoBanner
                        title="Prediction incomplete"
                        message={predictionError}
                        tone="warning"
                    />
                ) : null}

                <AppButton title="Start Guided Trials" onPress={onContinue}/>

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

type MovementChipProps = {
    label: string;
    selected: boolean;
    onPress: () => void;
};

function MovementChip({label, selected, onPress}: MovementChipProps) {
    return (
        <Pressable
            onPress={onPress}
            style={[styles.chip, selected && styles.chipSelected]}
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

    exampleBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.accentSoft,
        borderWidth: 1,
        borderColor: colors.primarySoft,
        padding: spacing.md,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    chip: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        maxWidth: '100%',
    },

    chipSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },

    previewBox: {
        marginTop: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },

    previewText: {
        marginTop: spacing.xs,
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