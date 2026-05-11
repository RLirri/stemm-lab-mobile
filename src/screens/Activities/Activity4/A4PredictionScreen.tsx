// src/screens/Activities/Activity4/A4PredictionScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {
    type Activity4RunDraft,
    getActivity4RunDraft,
    setActivity4Prediction,
} from '../../../store/activity4RunDraftStore';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A4Prediction'>;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function hasSessionBasics(d: Activity4RunDraft) {
    return (
        !!d.session?.activityId &&
        typeof d.session.designCount === 'number' &&
        d.session.designCount >= 3
    );
}

function isValidPick(idx: number, designCount: number) {
    return Number.isFinite(idx) && idx >= 0 && idx < designCount;
}

function buildDesignMeta(d: Activity4RunDraft, i: number) {
    const des = d.session.designs?.[i];
    if (!des) return '';

    const parts: string[] = [];

    if (typeof des.foldCount === 'number') parts.push(`${des.foldCount} folds`);
    if (typeof des.pillarCount === 'number') parts.push(`${des.pillarCount} pillars`);
    if (typeof des.layers === 'number') parts.push(`${des.layers} layers`);

    if (typeof des.baseWidthCm === 'number' || typeof des.baseLengthCm === 'number') {
        const w = typeof des.baseWidthCm === 'number' ? `${Math.round(des.baseWidthCm)}cm` : '?';
        const l = typeof des.baseLengthCm === 'number' ? `${Math.round(des.baseLengthCm)}cm` : '?';
        parts.push(`${w}×${l}`);
    }

    return parts.join(' • ');
}

export default function A4PredictionScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);
    const [bestDesignIndex, setBestDesignIndex] = useState<number | null>(null);
    const [notes, setNotes] = useState<string>('');
    const [saving, setSaving] = useState(false);

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

        if (!hasSessionBasics(d)) {
            Alert.alert('Setup required', 'Please complete Session Setup before Prediction.', [
                {
                    text: 'Go to Setup',
                    onPress: () => navigation.replace('A4SessionSetup', {activityId, runId}),
                },
            ]);
            return;
        }

        setDraft(d);
        setBestDesignIndex(
            typeof d.prediction?.predictedBestDesignIndex === 'number'
                ? d.prediction.predictedBestDesignIndex
                : null,
        );
        setNotes(d.prediction?.predictedNotes ?? '');
    }, [activityId, navigation, runId, user]);

    const designOptions = useMemo(() => {
        if (!draft) return [];

        return Array.from({length: draft.session.designCount}, (_, i) => {
            const name = draft.session.designs?.[i]?.name?.trim();

            return {
                index: i,
                label: name ? name : `Design ${i + 1}`,
                meta: buildDesignMeta(draft, i),
            };
        });
    }, [draft]);

    const durationText = useMemo(() => {
        if (!draft) return '';
        return `${draft.session.vibrationDurationSec}s vibration test`;
    }, [draft]);

    const predictionPreview = useMemo(() => {
        if (bestDesignIndex == null || !draft) {
            return 'Select the structure you predict will move the least during vibration.';
        }

        const selected = designOptions.find((d) => d.index === bestDesignIndex);
        return `${selected?.label ?? `Design ${bestDesignIndex + 1}`} is predicted to have the lowest movement score.`;
    }, [bestDesignIndex, designOptions, draft]);

    function validate(): string | null {
        if (!draft) return 'Draft not loaded.';

        const count = draft.session.designCount;

        if (bestDesignIndex == null) return 'Please select which design will move the least.';
        if (!isValidPick(bestDesignIndex, count)) return 'Selected design is out of range.';

        if (notes.trim().length > 0 && notes.trim().length < 8) {
            return 'Prediction notes are too short. Add a bit more detail or clear it.';
        }

        return null;
    }

    async function onSaveAndContinue() {
        if (!draft) return;

        const err = validate();

        if (err) {
            Alert.alert('Check prediction', err);
            return;
        }

        if (bestDesignIndex == null) return;

        try {
            setSaving(true);

            const next = setActivity4Prediction(runId, {
                predictedBestDesignIndex: bestDesignIndex,
                predictedNotes: notes.trim() ? notes.trim() : undefined,
            });

            setDraft(next);

            showToast(
                'Prediction saved',
                'success',
                'Opening earthquake measurements.',
            );

            setTimeout(() => {
                navigation.navigate('A4Measurements', {activityId, runId});
            }, 700);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to save prediction.';
            Alert.alert('Error', message);
        } finally {
            setSaving(false);
        }
    }

    function onBackToSetup() {
        navigation.navigate('A4SessionSetup', {activityId, runId});
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
                    <AppBadge label="Activity 4" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Prediction
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Predict which structure design will make the phone move the least
                        during the vibration test.
                    </AppText>
                </View>

                <InfoBanner
                    title="Prediction task"
                    message="Choose the design you expect to be most stable before measuring. The result screen will compare your hypothesis against the lowest movement score."
                    tone="info"
                />

                <AppSectionHeader
                    title="Test Conditions"
                    subtitle="Review the setup before selecting your predicted best design."
                />

                <AppCard>
                    <MetricRow label="Duration" value={durationText}/>

                    <MetricRow
                        label="Surface"
                        value={draft.session.surfaceContext ?? 'Not sure'}
                    />

                    <MetricRow label="Goal" value="Lowest movement score wins"/>

                    <AppButton
                        title="Edit Session Setup"
                        variant="outline"
                        onPress={onBackToSetup}
                        style={styles.setupButton}
                    />
                </AppCard>

                <AppSectionHeader
                    title="Select Best Design"
                    subtitle="Choose the design you believe will have the smallest movement."
                />

                <AppCard>
                    <View style={styles.choiceList}>
                        {designOptions.map((o) => {
                            const selected = bestDesignIndex === o.index;

                            return (
                                <Pressable
                                    key={o.index}
                                    onPress={() => setBestDesignIndex(o.index)}
                                    style={[styles.choiceCard, selected && styles.choiceCardOn]}
                                >
                                    <View style={styles.choiceTop}>
                                        <AppText
                                            variant="bodyStrong"
                                            color={selected ? 'inverseText' : 'text'}
                                            style={styles.choiceTitle}
                                        >
                                            {o.label}
                                        </AppText>

                                        {selected ? <AppBadge label="Selected" tone="success"/> : null}
                                    </View>

                                    <AppText
                                        variant="caption"
                                        color={selected ? 'inverseText' : 'textMuted'}
                                        style={styles.choiceMeta}
                                    >
                                        {o.meta || 'No design details yet'}
                                    </AppText>
                                </Pressable>
                            );
                        })}
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Prediction Reasoning"
                    subtitle="Optional notes to explain your hypothesis."
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

                    <View style={styles.promptBox}>
                        <AppText variant="bodyStrong" color="primary">
                            Prompt ideas
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • More folds may improve vibration dampening.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • More pillars may improve stability.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • A wider base may reduce wobble.
                        </AppText>
                    </View>

                    <AppInput
                        label="Prediction notes"
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Example: Design 2 has more folds and a wider base, so it should absorb vibration better."
                        multiline
                        style={styles.notesInput}
                    />
                </AppCard>

                <AppSectionHeader title="What Happens Next"/>

                <AppCard>
                    <View style={styles.stepList}>
                        <StepItem index={1} title="Run vibration measurements"/>
                        <StepItem index={2} title="Compare movement scores"/>
                        <StepItem index={3} title="Review results dashboard"/>
                        <StepItem index={4} title="Reflect and submit"/>
                    </View>
                </AppCard>

                <AppButton
                    title={saving ? 'Saving...' : 'Continue to Measurements'}
                    onPress={onSaveAndContinue}
                    disabled={saving}
                    loading={saving}
                />

                <AppText variant="caption" color="textMuted" style={styles.footerHint}>
                    Next: Measurements → Results → Reflection & Submit.
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

    setupButton: {
        marginTop: spacing.md,
    },

    choiceList: {
        gap: spacing.md,
    },

    choiceCard: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.md,
    },

    choiceCardOn: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    choiceTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    choiceTitle: {
        flex: 1,
    },

    choiceMeta: {
        marginTop: spacing.sm,
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

    promptBox: {
        borderWidth: 1,
        borderColor: colors.primarySoft,
        backgroundColor: colors.accentSoft,
        borderRadius: radius.lg,
        padding: spacing.md,
        marginBottom: spacing.lg,
    },

    promptText: {
        marginTop: spacing.xs,
    },

    notesInput: {
        minHeight: 120,
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