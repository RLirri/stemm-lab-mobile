// src/screens/Activities/Activity6/A6PredictionScreen.tsx

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {
    getActivity6RunDraft,
    setActivity6Prediction,
    type Activity6RunDraft,
    type A6PredictionDraft,
} from '../../../store/activity6RunDraftStore';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A6Prediction'>;
type HandPick = NonNullable<A6PredictionDraft['predictedHandFaster']>;
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

function parseMs(input: string): number | null {
    const cleaned = input.replace(/[^\d]/g, '');
    if (!cleaned) return null;

    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

export default function A6PredictionScreen({route, navigation}: Props) {
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity6RunDraft | null>(null);
    const [reactionMsText, setReactionMsText] = useState('');
    const [handPick, setHandPick] = useState<HandPick | null>(null);

    const [toast, setToast] = useState<ToastState>({
        visible: false,
        title: '',
        message: undefined,
        tone: 'success',
    });

    function showToast(title: string, tone: ToastTone = 'success', message?: string) {
        setToast({visible: true, title, message, tone});
    }

    const refresh = useCallback(() => {
        const d = getActivity6RunDraft(runId);
        setDraft(d);

        if (d?.prediction) {
            const ms = d.prediction.predictedReactionTimeMs;
            setReactionMsText(isFiniteNumber(ms) ? String(Math.round(ms)) : '');
            setHandPick(d.prediction.predictedHandFaster ?? null);
        }
    }, [runId]);

    useEffect(() => {
        const d = getActivity6RunDraft(runId);

        if (!d) {
            Alert.alert(
                'Session expired',
                'Your Activity 6 session draft was not found. Please start again.',
                [
                    {
                        text: 'OK',
                        onPress: () => navigation.replace('A6SessionSetup', {activityId}),
                    },
                ],
            );
            return;
        }

        setDraft(d);

        const ms = d.prediction?.predictedReactionTimeMs;
        setReactionMsText(isFiniteNumber(ms) ? String(Math.round(ms)) : '');
        setHandPick(d.prediction?.predictedHandFaster ?? null);
    }, [activityId, navigation, runId]);

    useFocusEffect(
        useCallback(() => {
            refresh();
        }, [refresh]),
    );

    const view = useMemo(() => {
        if (!draft) return null;

        const threshold = clampInt(draft.session.accuracyThresholdPct ?? 60, 0, 100);
        const trialsPerHand = clampInt(draft.session.trialsPerHand ?? 3, 1, 10);

        const msParsed = parseMs(reactionMsText);
        const msOk = msParsed != null && msParsed >= 100 && msParsed <= 2000;
        const handOk = !!handPick;

        return {
            threshold,
            trialsPerHand,
            msParsed,
            msOk,
            handOk,
            ready: msOk && handOk,
        };
    }, [draft, handPick, reactionMsText]);

    function savePrediction(showSuccess = true) {
        if (!draft || !view) return false;

        const msParsed = parseMs(reactionMsText);

        if (msParsed == null) {
            Alert.alert('Missing prediction', 'Please enter your predicted reaction time in milliseconds.');
            return false;
        }

        const ms = clampInt(msParsed, 100, 2000);

        if (!handPick) {
            Alert.alert('Missing choice', 'Please choose which hand you think will be faster.');
            return false;
        }

        setActivity6Prediction(runId, {
            predictedReactionTimeMs: ms,
            predictedHandFaster: handPick,
        });

        refresh();

        if (showSuccess) {
            showToast(
                'Prediction saved',
                'success',
                'You can start the reaction challenge now.',
            );
        }

        return true;
    }

    function onSave() {
        savePrediction(true);
    }

    function onContinue() {
        if (!draft || !view) return;

        if (!view.ready) {
            Alert.alert(
                'Complete prediction first',
                'Please enter a predicted reaction time between 100 and 2000 ms and choose which hand will be faster.',
            );
            return;
        }

        const saved = savePrediction(false);
        if (!saved) return;

        showToast(
            'Prediction saved',
            'success',
            'Opening reaction trials.',
        );

        setTimeout(() => {
            navigation.navigate('A6ReactionTrial', {activityId, runId});
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
                    <AppBadge label="Activity 6" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Prediction
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Predict your reaction time and which hand will respond faster before
                        starting the reaction trials.
                    </AppText>
                </View>

                <InfoBanner
                    title="Prediction task"
                    message="Make a hypothesis before testing. The result screen will compare your predicted reaction time and faster hand with the measured data."
                    tone="info"
                />

                <AppSectionHeader
                    title="Session Settings"
                    subtitle="Review the configured reaction challenge requirements."
                />

                <AppCard>
                    <MetricRow label="Trials per hand" value={String(view.trialsPerHand)}/>
                    <MetricRow label="Leaderboard accuracy threshold" value={`≥ ${view.threshold}%`}/>

                    <InfoBanner
                        title="Completion requirement"
                        message="Complete dominant and non-dominant trials for each participant, then finish the tracing challenge."
                        tone="info"
                    />
                </AppCard>

                <AppSectionHeader
                    title="Participants"
                    subtitle="These participants will rotate through the reaction challenge."
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
                                        Dominant hand: {p.dominantHand ?? '—'}
                                    </AppText>
                                </View>

                                <AppBadge label={`P${index + 1}`} tone="info"/>
                            </View>
                        ))}
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Your Prediction"
                    subtitle="Enter a reaction-time estimate and choose the faster hand."
                />

                <AppCard>
                    <AppInput
                        label="Predicted reaction time"
                        value={reactionMsText}
                        onChangeText={(text) => setReactionMsText(text.replace(/[^\d]/g, ''))}
                        placeholder="e.g. 320"
                        keyboardType="number-pad"
                        maxLength={5}
                    />

                    <AppText variant="caption" color="textMuted" style={styles.helpText}>
                        Enter a number between 100 and 2000 ms. Typical human reaction time is
                        often around 200–400 ms.
                    </AppText>

                    <View style={styles.exampleBox}>
                        <AppText variant="bodyStrong" color="primary">
                            Prediction preview
                        </AppText>

                        <AppText variant="body" style={styles.smallGap}>
                            {view.msParsed != null
                                ? `${clampInt(view.msParsed, 100, 2000)} ms predicted reaction time`
                                : 'No reaction-time prediction entered yet.'}
                        </AppText>
                    </View>

                    <AppText variant="bodyStrong" style={styles.choiceTitle}>
                        Which hand will be faster?
                    </AppText>

                    <View style={styles.choiceRow}>
                        <ChoiceButton
                            label="Dominant"
                            selected={handPick === 'Dominant'}
                            onPress={() => setHandPick('Dominant')}
                        />

                        <ChoiceButton
                            label="Non-dominant"
                            selected={handPick === 'Non-dominant'}
                            onPress={() => setHandPick('Non-dominant')}
                        />

                        <ChoiceButton
                            label="Same"
                            selected={handPick === 'Same'}
                            onPress={() => setHandPick('Same')}
                        />
                    </View>

                    <View style={styles.checkList}>
                        <ChecklistRow label="Reaction time entered" ok={view.msOk}/>
                        <ChecklistRow label="Faster hand selected" ok={view.handOk}/>
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
                        <StepItem index={1} title="Complete tap reaction trials"/>
                        <StepItem index={2} title="Complete tracing challenge"/>
                        <StepItem index={3} title="Review reaction and tracing results"/>
                        <StepItem index={4} title="Reflect and submit"/>
                    </View>
                </AppCard>

                {!view.ready ? (
                    <InfoBanner
                        title="Prediction incomplete"
                        message="Enter a valid reaction time and choose the faster hand before continuing."
                        tone="warning"
                    />
                ) : null}

                <AppButton
                    title="Continue to Reaction Trials"
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
    },

    exampleBox: {
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

    choiceRow: {
        marginTop: spacing.md,
        flexDirection: 'row',
        gap: spacing.sm,
    },

    choiceButton: {
        flex: 1,
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