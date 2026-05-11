// src/screens/Activities/Activity6/A6ReactionTrialScreen.tsx

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';

import {
    type A6HandType,
    type Activity6RunDraft,
    getActivity6RunDraft,
    upsertActivity6ReactionTrial,
    validateA6Prediction,
} from '../../../store/activity6RunDraftStore';

import {
    type A6TargetPresentation,
    buildReactionRecord,
    planNextTarget,
    waitAndActivateTarget,
} from '../../../services/activity6ReactionBoardService';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A6ReactionTrial'>;

type Phase = 'idle' | 'countdown' | 'waiting_random' | 'active_target' | 'saved';
type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function now() {
    return Date.now();
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function safeParticipantName(run: Activity6RunDraft, pid: string) {
    return run.session.participants.find((p) => p.id === pid)?.name ?? '—';
}

function formatMs(ms: number | undefined) {
    if (ms == null || !Number.isFinite(ms)) return '—';
    return `${Math.round(ms)} ms`;
}

function normToPx(args: {
    n: number;
    sizePx: number;
    totalPx: number;
    extraMarginPx?: number;
}) {
    const margin = Math.min(
        args.totalPx / 2,
        args.sizePx / 2 + (args.extraMarginPx ?? 8),
    );

    const span = Math.max(1, args.totalPx - 2 * margin);
    const px = margin + args.n * span;

    return px - args.sizePx / 2;
}

export default function A6ReactionTrialScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity6RunDraft | null>(null);

    const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
    const [hand, setHand] = useState<A6HandType>('dominant');

    const [phase, setPhase] = useState<Phase>('idle');
    const [countdown, setCountdown] = useState<number | null>(null);

    const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
    const [activeTarget, setActiveTarget] = useState<A6TargetPresentation | null>(null);

    const [lastSaved, setLastSaved] = useState<{
        participantName: string;
        hand: A6HandType;
        trialNumber: number;
        reactionTimeMs: number;
    } | null>(null);

    const runningRef = useRef(false);

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

        const d = getActivity6RunDraft(runId);

        if (!d) {
            Alert.alert('Session expired', 'Please restart Activity 6.', [
                {
                    text: 'OK',
                    onPress: () => navigation.replace('A6SessionSetup', {activityId}),
                },
            ]);
            return;
        }

        const predErr = validateA6Prediction(d);

        if (predErr) {
            Alert.alert('Prediction required', predErr, [
                {
                    text: 'Go to Prediction',
                    onPress: () => navigation.replace('A6Prediction', {activityId, runId}),
                },
            ]);
            return;
        }

        setDraft(d);
        setSelectedParticipantId(d.session.participants?.[0]?.id ?? null);
    }, [activityId, navigation, runId, user]);

    useEffect(() => {
        return () => {
            runningRef.current = false;
        };
    }, []);

    const participants = draft?.session.participants ?? [];
    const trialsPerHand = clampInt(draft?.session.trialsPerHand ?? 1, 1, 10);
    const targetCfg = draft?.session.target;
    const targetSizePx = clampInt(targetCfg?.targetSizePx ?? 56, 24, 120);

    const selectedName = useMemo(() => {
        return participants.find((p) => p.id === selectedParticipantId)?.name ?? 'Select participant';
    }, [participants, selectedParticipantId]);

    const trialNumberFor = useMemo(() => {
        if (!draft || !selectedParticipantId) return 1;

        const nDone = (draft.reactionTrials ?? []).filter(
            (t) =>
                t.participantId === selectedParticipantId &&
                t.hand === hand &&
                Number.isFinite(t.reactionTimeMs),
        ).length;

        return clampInt(nDone + 1, 1, 999);
    }, [draft, hand, selectedParticipantId]);

    const progress = useMemo(() => {
        if (!draft || !selectedParticipantId) return null;

        const countFor = (pid: string, h: A6HandType) =>
            (draft.reactionTrials ?? []).filter(
                (t) =>
                    t.participantId === pid &&
                    t.hand === h &&
                    Number.isFinite(t.reactionTimeMs),
            ).length;

        return {
            dominantDone: countFor(selectedParticipantId, 'dominant'),
            nonDominantDone: countFor(selectedParticipantId, 'non_dominant'),
            trialsPerHand,
        };
    }, [draft, selectedParticipantId, trialsPerHand]);

    function isBusy() {
        return phase !== 'idle' && phase !== 'saved';
    }

    function resetToIdle() {
        setPhase('idle');
        setCountdown(null);
        setActiveTarget(null);
        setLastSaved(null);
        runningRef.current = false;

        showToast('Trial reset', 'info', 'You can start a new reaction trial.');
    }

    async function startOneTrial() {
        if (!draft) return;
        if (isBusy()) return;

        const predErr = validateA6Prediction(draft);

        if (predErr) {
            Alert.alert('Prediction required', predErr, [
                {
                    text: 'Go to Prediction',
                    onPress: () => navigation.replace('A6Prediction', {activityId, runId}),
                },
            ]);
            return;
        }

        const pid = selectedParticipantId ?? participants[0]?.id;

        if (!pid) {
            Alert.alert('Select participant', 'Please select a participant before starting a trial.');
            return;
        }

        if (!layout || layout.width <= 0 || layout.height <= 0) {
            Alert.alert('Layout not ready', 'Please wait a moment for the screen to load.');
            return;
        }

        const doneCount = (draft.reactionTrials ?? []).filter(
            (t) =>
                t.participantId === pid &&
                t.hand === hand &&
                Number.isFinite(t.reactionTimeMs),
        ).length;

        if (doneCount >= trialsPerHand) {
            Alert.alert(
                'Trials completed',
                `You already recorded ${doneCount}/${trialsPerHand} for this hand.\nYou can retake more if you want, or switch hand.`,
            );
        }

        setLastSaved(null);
        setActiveTarget(null);
        setPhase('countdown');
        runningRef.current = true;

        try {
            for (let c = 3; c >= 1; c -= 1) {
                setCountdown(c);
                await sleep(650);
            }

            setCountdown(null);

            if (!runningRef.current) return;

            setPhase('waiting_random');

            const plan = planNextTarget({
                cfg: {
                    delayMinSec: targetCfg?.delayMinSec ?? 1.0,
                    delayMaxSec: targetCfg?.delayMaxSec ?? 3.0,
                    extraMarginPx: 8,
                },
                screen: {
                    width: layout.width,
                    height: layout.height,
                },
                targetSizePx,
            });

            const presentation = await waitAndActivateTarget(plan);

            if (!runningRef.current) return;

            setActiveTarget(presentation);
            setPhase('active_target');
        } catch (e: unknown) {
            resetToIdle();

            const message = e instanceof Error ? e.message : 'Failed to start trial.';
            Alert.alert('Error', message);
        }
    }

    function handleTapTarget() {
        if (!draft || !activeTarget) return;
        if (phase !== 'active_target') return;

        const pid = selectedParticipantId ?? participants[0]?.id;
        if (!pid) return;

        const tapAt = now();

        const record = buildReactionRecord({
            participantId: pid,
            hand,
            trialNumber: trialNumberFor,
            appearedAt: activeTarget.appearedAt,
            tapAt,
        });

        try {
            const updated = upsertActivity6ReactionTrial(runId, {
                participantId: record.participantId,
                hand: record.hand,
                trialNumber: record.trialNumber,
                target: {
                    delayMs: activeTarget.delayMs,
                    appearedAt: activeTarget.appearedAt,
                    location: activeTarget.location,
                },
                tapAt: record.tapAt,
            });

            setDraft(updated);

            setLastSaved({
                participantName: safeParticipantName(updated, pid),
                hand,
                trialNumber: record.trialNumber,
                reactionTimeMs: record.reactionTimeMs,
            });

            setPhase('saved');
            setActiveTarget(null);
            runningRef.current = false;

            showToast(
                'Reaction trial saved',
                'success',
                `Reaction time: ${formatMs(record.reactionTimeMs)}`,
            );
        } catch (e: unknown) {
            resetToIdle();

            const message = e instanceof Error ? e.message : 'Failed to save reaction trial.';
            Alert.alert('Error', message);
        }
    }

    function goToTracing() {
        showToast('Opening tracing challenge', 'success');

        setTimeout(() => {
            navigation.navigate('A6TracingChallenge', {activityId, runId});
        }, 600);
    }

    function goToResults() {
        showToast('Opening results', 'success', 'Preparing reaction analysis.');

        setTimeout(() => {
            navigation.navigate('A6Results', {activityId, runId});
        }, 600);
    }

    if (!user) return null;

    if (!draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading reaction trial..."/>
            </AppGradientScreen>
        );
    }

    const targetStyle =
        activeTarget && layout
            ? {
                left: normToPx({
                    n: activeTarget.location.x,
                    sizePx: targetSizePx,
                    totalPx: layout.width,
                }),
                top: normToPx({
                    n: activeTarget.location.y,
                    sizePx: targetSizePx,
                    totalPx: layout.height,
                }),
                width: targetSizePx,
                height: targetSizePx,
                borderRadius: targetSizePx / 2,
            }
            : null;

    return (
        <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <AppGradientScreen>
                <View style={styles.header}>
                    <AppBadge label="Activity 6" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Tap Reaction
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Tap the target as soon as it appears. Delay and position are
                        randomized to measure true reaction time.
                    </AppText>
                </View>

                <InfoBanner
                    title="Fair testing tips"
                    message="Keep your finger close, but do not hover on the exact spot. Wait for the target instead of predicting the delay."
                    tone="info"
                />

                <AppSectionHeader
                    title="Participant"
                    subtitle="Rotate through team members and record trials separately."
                />

                <AppCard>
                    <View style={styles.chipWrap}>
                        {participants.map((p) => {
                            const selected = p.id === selectedParticipantId;

                            return (
                                <Pressable
                                    key={p.id}
                                    style={[styles.chip, selected && styles.chipSelected]}
                                    onPress={() => setSelectedParticipantId(p.id)}
                                    disabled={isBusy()}
                                >
                                    <AppText
                                        variant="bodyStrong"
                                        color={selected ? 'inverseText' : 'text'}
                                        align="center"
                                    >
                                        {p.name}
                                    </AppText>
                                </Pressable>
                            );
                        })}
                    </View>

                    <View style={styles.selectionBox}>
                        <View>
                            <AppText variant="caption" color="textMuted">
                                Selected participant
                            </AppText>

                            <AppText variant="bodyStrong" style={styles.smallGap}>
                                {selectedName}
                            </AppText>
                        </View>

                        <AppBadge
                            label={isBusy() ? 'Trial active' : 'Ready'}
                            tone={isBusy() ? 'warning' : 'info'}
                        />
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Hand Selection"
                    subtitle="Complete trials with both dominant and non-dominant hands."
                />

                <AppCard>
                    <View style={styles.chipWrap}>
                        <ChoiceChip
                            label="Dominant"
                            selected={hand === 'dominant'}
                            disabled={isBusy()}
                            onPress={() => setHand('dominant')}
                        />

                        <ChoiceChip
                            label="Non-dominant"
                            selected={hand === 'non_dominant'}
                            disabled={isBusy()}
                            onPress={() => setHand('non_dominant')}
                        />
                    </View>

                    {progress ? (
                        <View style={styles.progressBox}>
                            <MetricRow
                                label="Dominant"
                                value={`${progress.dominantDone} / ${progress.trialsPerHand}`}
                            />

                            <MetricRow
                                label="Non-dominant"
                                value={`${progress.nonDominantDone} / ${progress.trialsPerHand}`}
                            />
                        </View>
                    ) : null}
                </AppCard>

                <AppSectionHeader
                    title="Trial Arena"
                    subtitle="Start a trial, wait for the random target, then tap quickly."
                />

                <AppCard>
                    {phase === 'countdown' && countdown != null ? (
                        <View style={styles.phaseBox}>
                            <AppText variant="bodyStrong" color="inverseText">
                                Get ready
                            </AppText>

                            <AppText variant="title" color="inverseText" style={styles.phaseValue}>
                                {countdown}
                            </AppText>
                        </View>
                    ) : null}

                    {phase === 'waiting_random' ? (
                        <View style={styles.phaseBox}>
                            <AppText variant="bodyStrong" color="inverseText">
                                Wait
                            </AppText>

                            <AppText variant="caption" color="inverseText" style={styles.phaseHint}>
                                Target will appear soon after a random delay.
                            </AppText>
                        </View>
                    ) : null}

                    {phase === 'saved' && lastSaved ? (
                        <View style={styles.savedBox}>
                            <View style={styles.savedText}>
                                <AppText variant="bodyStrong">Trial saved</AppText>

                                <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                    {lastSaved.participantName} •{' '}
                                    {lastSaved.hand === 'dominant' ? 'Dominant' : 'Non-dominant'} •
                                    Trial {lastSaved.trialNumber}
                                </AppText>
                            </View>

                            <AppBadge label={formatMs(lastSaved.reactionTimeMs)} tone="success"/>
                        </View>
                    ) : null}

                    <View
                        style={styles.arena}
                        onLayout={(e) => {
                            const {width, height} = e.nativeEvent.layout;
                            setLayout({width, height});
                        }}
                    >
                        {phase === 'active_target' && activeTarget && targetStyle ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Tap target"
                                onPress={handleTapTarget}
                                style={[styles.target, targetStyle]}
                            >
                                <AppText variant="bodyStrong" color="inverseText" align="center">
                                    TAP
                                </AppText>
                            </Pressable>
                        ) : (
                            <View style={styles.placeholder}>
                                <AppText variant="bodyStrong" color="textMuted" align="center">
                                    {layout ? 'Target hidden' : 'Loading arena...'}
                                </AppText>
                            </View>
                        )}
                    </View>

                    <View style={styles.actionRow}>
                        <AppButton
                            title={`Start Trial ${trialNumberFor}`}
                            onPress={() => void startOneTrial()}
                            disabled={isBusy()}
                            style={styles.startButton}
                        />

                        <AppButton
                            title="Reset"
                            variant="outline"
                            onPress={resetToIdle}
                            disabled={isBusy()}
                            style={styles.resetButton}
                        />
                    </View>

                    <View style={styles.configBox}>
                        <MetricRow
                            label="Current hand"
                            value={hand === 'dominant' ? 'Dominant' : 'Non-dominant'}
                        />

                        <MetricRow label="Target size" value={`${targetSizePx}px`}/>
                    </View>
                </AppCard>

                <View style={styles.actions}>
                    <AppButton
                        title="Continue to Tracing Challenge"
                        variant="outline"
                        onPress={goToTracing}
                        disabled={isBusy()}
                    />

                    <AppButton
                        title="View Results"
                        onPress={goToResults}
                        disabled={isBusy()}
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
        </KeyboardAvoidingView>
    );
}

type ChoiceChipProps = {
    label: string;
    selected: boolean;
    disabled?: boolean;
    onPress: () => void;
};

function ChoiceChip({label, selected, disabled, onPress}: ChoiceChipProps) {
    return (
        <Pressable
            style={[styles.chip, selected && styles.chipSelected, disabled && styles.disabled]}
            onPress={onPress}
            disabled={disabled}
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
    },

    chipSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },

    disabled: {
        opacity: 0.6,
    },

    selectionBox: {
        marginTop: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    progressBox: {
        marginTop: spacing.lg,
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

    phaseBox: {
        borderRadius: radius.lg,
        backgroundColor: colors.primaryDark,
        padding: spacing.lg,
        marginBottom: spacing.md,
    },

    phaseValue: {
        marginTop: spacing.sm,
    },

    phaseHint: {
        marginTop: spacing.xs,
        opacity: 0.85,
    },

    savedBox: {
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        marginBottom: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    savedText: {
        flex: 1,
    },

    arena: {
        height: 360,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceMuted,
        overflow: 'hidden',
        position: 'relative',
    },

    placeholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
    },

    target: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primaryDark,
    },

    actionRow: {
        marginTop: spacing.md,
        flexDirection: 'row',
        gap: spacing.md,
    },

    startButton: {
        flex: 1,
    },

    resetButton: {
        width: 110,
    },

    configBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },

    actions: {
        marginTop: spacing.lg,
        gap: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});