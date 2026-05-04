// src/screens/Activities/Activity3/A3PredictionScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {
    getActivity3RunDraft,
    setActivity3Prediction,
    type Activity3RunDraft,
    type FanDistanceCm,
} from '../../../store/activity3RunDraftStore';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppInput,
    AppSectionHeader,
    AppStatusToast,
    AppText,
    EmptyState,
    InfoBanner,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A3Prediction'>;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

export default function A3PredictionScreen({route, navigation}: Props) {
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);

    const [bestDesignIndex, setBestDesignIndex] = useState<number | null>(null);
    const [bestDistance, setBestDistance] = useState<FanDistanceCm | null>(null);
    const [notes, setNotes] = useState<string>('');

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
        const d = getActivity3RunDraft(runId);
        setDraft(d);

        if (!d?.prediction) return;

        if (typeof d.prediction.predictedBestDesignIndex === 'number') {
            setBestDesignIndex(d.prediction.predictedBestDesignIndex);
        }

        if (typeof d.prediction.predictedBestDistanceCm === 'number') {
            setBestDistance(d.prediction.predictedBestDistanceCm);
        }

        if (typeof d.prediction.predictedNotes === 'string') {
            setNotes(d.prediction.predictedNotes);
        }
    }, [runId]);

    const designCount = draft?.session.fanDesignCount ?? 3;

    const canContinue = useMemo(() => {
        return bestDesignIndex != null && bestDistance != null;
    }, [bestDesignIndex, bestDistance]);

    const predictionPreview = useMemo(() => {
        if (bestDesignIndex == null && bestDistance == null) {
            return 'Choose a design and distance to create your prediction.';
        }

        if (bestDesignIndex == null) {
            return `Distance selected: ${bestDistance} cm. Choose a design next.`;
        }

        if (bestDistance == null) {
            return `Design ${bestDesignIndex + 1} selected. Choose a distance next.`;
        }

        return `Design ${bestDesignIndex + 1} at ${bestDistance} cm is predicted to perform best.`;
    }, [bestDesignIndex, bestDistance]);

    if (!draft) {
        return (
            <AppGradientScreen scroll={false}>
                <EmptyState
                    title="Session not found"
                    message="Your run draft may have expired. Go back and start again."
                />
            </AppGradientScreen>
        );
    }

    function onContinue() {
        if (bestDesignIndex == null || bestDistance == null) {
            Alert.alert(
                'Prediction required',
                'Please choose the predicted best design and distance before continuing.',
            );
            return;
        }

        setActivity3Prediction(runId, {
            predictedBestDesignIndex: bestDesignIndex,
            predictedBestDistanceCm: bestDistance,
            predictedNotes: notes.trim() ? notes.trim() : undefined,
        });

        showToast(
            'Prediction saved',
            'success',
            'Opening fan measurements.',
        );

        setTimeout(() => {
            navigation.navigate('A3Measurements', {activityId, runId});
        }, 700);
    }

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 3" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    Prediction
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Before measuring, predict which fan design and distance will produce
                    the strongest airflow.
                </AppText>
            </View>

            <InfoBanner
                title="Prediction task"
                message="Make a prediction before testing. Later, your results dashboard will compare your hypothesis with the measured best design."
                tone="info"
            />

            <AppSectionHeader
                title="Predicted Best Design"
                subtitle="Choose the fan design you expect to perform best."
            />

            <AppCard>
                <View style={styles.segmentWrap}>
                    {Array.from({length: designCount}).map((_, i) => {
                        const active = bestDesignIndex === i;

                        return (
                            <ChoiceChip
                                key={i}
                                label={`Design ${i + 1}`}
                                active={active}
                                onPress={() => setBestDesignIndex(i)}
                            />
                        );
                    })}
                </View>
            </AppCard>

            <AppSectionHeader
                title="Predicted Best Distance"
                subtitle="Choose the distance where airflow should be strongest."
            />

            <AppCard>
                <View style={styles.segmentWrap}>
                    {([15, 30, 45] as const).map((v) => {
                        const active = bestDistance === v;

                        return (
                            <ChoiceChip
                                key={v}
                                label={`${v} cm`}
                                active={active}
                                onPress={() => setBestDistance(v)}
                            />
                        );
                    })}
                </View>
            </AppCard>

            <AppSectionHeader
                title="Prediction Notes"
                subtitle="Optional reasoning for your hypothesis."
            />

            <AppCard>
                <View style={styles.previewBox}>
                    <AppText variant="caption" color="textMuted">
                        Current prediction
                    </AppText>

                    <AppText variant="bodyStrong" style={styles.previewText}>
                        {predictionPreview}
                    </AppText>
                </View>

                <AppInput
                    label="Why do you think this will win?"
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Example: I think the larger fan blades will push more air at 30 cm..."
                    multiline
                    style={styles.notesInput}
                />
            </AppCard>

            <AppSectionHeader title="What Happens Next"/>

            <AppCard>
                <View style={styles.stepList}>
                    <StepItem index={1} title="Measure each fan design"/>
                    <StepItem index={2} title="Compare airflow across distances"/>
                    <StepItem index={3} title="Review result dashboard"/>
                    <StepItem index={4} title="Reflect and submit"/>
                </View>
            </AppCard>

            <AppButton
                title="Continue to Measurements"
                onPress={onContinue}
                disabled={!canContinue}
            />

            <AppText variant="caption" color="textMuted" style={styles.footerHint}>
                Next: Measurements → Comparison → Results → Reflection & Submit.
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
    );
}

type ChoiceChipProps = {
    label: string;
    active: boolean;
    onPress: () => void;
};

function ChoiceChip({label, active, onPress}: ChoiceChipProps) {
    return (
        <Pressable
            onPress={onPress}
            style={[styles.choiceChip, active && styles.choiceChipActive]}
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

    choiceChip: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        minWidth: 104,
    },

    choiceChipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    previewBox: {
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        marginBottom: spacing.lg,
    },

    previewText: {
        marginTop: spacing.xs,
    },

    notesInput: {
        minHeight: 100,
        textAlignVertical: 'top',
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

    footerHint: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});