// src/screens/Activities/Activity5/A5GuidedTrialsScreen.tsx

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import * as Device from 'expo-device';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';

import {
    getActivity5RunDraft,
    upsertActivity5Trial,
    validateA5Prediction,
    type Activity5RunDraft,
    type A5MovementSpec,
    type A5TrialMode,
    type A5AccelDataset,
} from '../../../store/activity5RunDraftStore';

import {startMovementTrial} from '../../../services/activity5BiomechanicsService';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A5GuidedTrials'>;

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

function now() {
    return Date.now();
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function platformTag(): 'ios' | 'android' | 'unknown' {
    return Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unknown';
}

function osVersion(): string | undefined {
    return Platform.Version != null ? String(Platform.Version) : undefined;
}

function deviceModel(): string | undefined {
    return Device.modelName ?? Device.modelId ?? undefined;
}

function buildStoreDataset(args: {
    startedAt: number;
    samplingHz: number;
    samples: Array<{ tMs: number; x: number; y: number; z: number }>;
}): A5AccelDataset {
    return {
        startedAt: args.startedAt,
        samplingHz: args.samplingHz,
        platform: platformTag(),
        osVersion: osVersion(),
        deviceModel: deviceModel(),
        samples: args.samples.map((s) => ({
            tMs: s.tMs,
            ax: s.x,
            ay: s.y,
            az: s.z,
        })),
    };
}

function safeParticipantName(run: Activity5RunDraft, pid: string) {
    return run.session.participants.find((p) => p.id === pid)?.name ?? '—';
}

export default function A5GuidedTrialsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity5RunDraft | null>(null);
    const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);

    const [running, setRunning] = useState<{
        participantId: string;
        movementType: string;
        mode: A5TrialMode;
        movementTitle: string;
        targetDurationSec: number;
    } | null>(null);

    const [countdown, setCountdown] = useState<number | null>(null);
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

        const d = getActivity5RunDraft(runId);

        if (!d) {
            Alert.alert('Session expired', 'Please restart Activity 5.', [
                {
                    text: 'OK',
                    onPress: () => navigation.replace('A5SessionSetup', {activityId}),
                },
            ]);
            return;
        }

        const predErr = validateA5Prediction(d);

        if (predErr) {
            Alert.alert('Prediction required', predErr, [
                {
                    text: 'Go to Prediction',
                    onPress: () => navigation.replace('A5Prediction', {activityId, runId}),
                },
            ]);
            return;
        }

        setDraft(d);
        setSelectedParticipantId(d.session.participants?.[0]?.id ?? null);
    }, [activityId, navigation, runId, user]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
        };
    }, []);

    const participants = draft?.session.participants ?? [];
    const movements: A5MovementSpec[] = draft?.session.movements ?? [];
    const samplingHz = clampInt(draft?.session.samplingHz ?? 50, 10, 100);
    const feedbackEnabled = Boolean(draft?.session.feedbackEnabled);

    const progress = useMemo(() => {
        if (!draft) return null;

        const key = (p: string, m: string, mode: string) => `${p}::${m}::${mode}`;

        const completed = new Set<string>();

        for (const t of draft.trials ?? []) {
            if (t?.participantId && t?.movementType && t?.mode && t?.metrics) {
                completed.add(key(t.participantId, t.movementType, t.mode));
            }
        }

        const pid = selectedParticipantId ?? participants[0]?.id;
        const modes: A5TrialMode[] = feedbackEnabled ? ['baseline', 'feedback'] : ['baseline'];
        const total = movements.length * modes.length;

        let done = 0;

        if (pid) {
            for (const mv of movements) {
                for (const mode of modes) {
                    if (completed.has(key(pid, mv.type, mode))) done += 1;
                }
            }
        }

        return {done, total};
    }, [draft, feedbackEnabled, movements, participants, selectedParticipantId]);

    function isBusy() {
        return running != null || countdown != null || secondsLeft != null;
    }

    function clearTimers() {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setCountdown(null);
        setSecondsLeft(null);
    }

    function trialFor(pid: string, movementType: string, mode: A5TrialMode) {
        if (!draft) return null;

        const list = (draft.trials ?? [])
            .filter((t) => t.participantId === pid && t.movementType === movementType && t.mode === mode)
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

        return list[0] ?? null;
    }

    async function runTrial(args: {
        participantId: string;
        movement: A5MovementSpec;
        mode: A5TrialMode;
    }) {
        if (!draft) return;
        if (isBusy()) return;

        const predErr = validateA5Prediction(draft);

        if (predErr) {
            Alert.alert('Prediction required', predErr, [
                {
                    text: 'Go to Prediction',
                    onPress: () => navigation.replace('A5Prediction', {activityId, runId}),
                },
            ]);
            return;
        }

        if (!args.participantId) {
            Alert.alert('Select participant', 'Please select a participant before starting a trial.');
            return;
        }

        const durationSec = clampInt(args.movement.durationSec, 10, 60);
        const durationMs = durationSec * 1000;

        setRunning({
            participantId: args.participantId,
            movementType: args.movement.type,
            mode: args.mode,
            movementTitle: args.movement.title,
            targetDurationSec: durationSec,
        });

        try {
            clearTimers();

            for (let c = 3; c >= 1; c -= 1) {
                setCountdown(c);
                await sleep(800);
            }

            setCountdown(null);

            const endAt = now() + durationMs;
            setSecondsLeft(durationSec);

            timerRef.current = setInterval(() => {
                const remain = Math.max(0, Math.ceil((endAt - now()) / 1000));
                setSecondsLeft(remain);

                if (remain <= 0) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    timerRef.current = null;
                    setSecondsLeft(null);
                }
            }, 200);

            const startedAt = now();

            const trialResult = await startMovementTrial({
                durationMs,
                samplingHz,
                feedbackPolicy:
                    args.mode === 'feedback' && feedbackEnabled
                        ? {
                            enabled: true,
                            smoothnessAlertThreshold: 0.08,
                            minCueIntervalMs: 800,
                            cueVibrationMs: 120,
                            liveWindowMs: 500,
                        }
                        : {enabled: false},
            });

            clearTimers();

            const dataset = buildStoreDataset({
                startedAt,
                samplingHz,
                samples: trialResult.samples,
            });

            const updated = upsertActivity5Trial(runId, {
                participantId: args.participantId,
                movementType: args.movement.type,
                mode: args.mode,
                dataset,
                metrics: {
                    durationSec: trialResult.metrics.durationSec,
                    displacementMagnitudeCm: trialResult.metrics.displacementMagnitudeCm,
                    smoothnessIndex: trialResult.metrics.smoothnessIndex,
                },
            });

            setDraft(updated);

            showToast(
                'Trial saved',
                'success',
                `${safeParticipantName(updated, args.participantId)} • ${args.movement.title} • ${args.mode}`,
            );
        } catch (e: unknown) {
            clearTimers();

            const message = e instanceof Error ? e.message : 'Failed to record trial.';
            Alert.alert('Error', message);
        } finally {
            setRunning(null);
        }
    }

    function goToResults() {
        if (isBusy()) return;

        showToast('Opening results', 'success', 'Preparing movement analysis.');

        setTimeout(() => {
            navigation.navigate('A5Results', {activityId, runId});
        }, 600);
    }

    if (!user) return null;

    if (!draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading guided trials..."/>
            </AppGradientScreen>
        );
    }

    const selectedName =
        participants.find((p) => p.id === selectedParticipantId)?.name ?? 'Select participant';

    return (
        <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <AppGradientScreen>
                <View style={styles.header}>
                    <AppBadge label="Activity 5" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Guided Trials
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Hold the phone firmly, follow each movement, and compare baseline
                        movement with feedback-assisted movement.
                    </AppText>
                </View>

                {countdown != null ? (
                    <View style={styles.runningBanner}>
                        <AppText variant="bodyStrong" color="inverseText">
                            Get ready
                        </AppText>

                        <AppText variant="title" color="inverseText" style={styles.countdownText}>
                            {countdown}
                        </AppText>
                    </View>
                ) : null}

                {secondsLeft != null && running ? (
                    <View style={styles.runningBanner}>
                        <View style={styles.runningTextArea}>
                            <AppText variant="bodyStrong" color="inverseText">
                                Recording movement
                            </AppText>

                            <AppText variant="caption" color="inverseText" style={styles.runningHint}>
                                {running.movementTitle} • {running.mode.toUpperCase()} • {secondsLeft}s left
                            </AppText>

                            {running.mode === 'feedback' && feedbackEnabled ? (
                                <AppText variant="caption" color="inverseText" style={styles.runningHint}>
                                    Feedback cues are enabled. Try to keep the movement smooth.
                                </AppText>
                            ) : null}
                        </View>

                        <AppBadge label={`${secondsLeft}s`} tone="info"/>
                    </View>
                ) : null}

                <InfoBanner
                    title="Fair test guidance"
                    message="Hold the phone the same way each time. Move slowly and smoothly. Lower smoothness index means better coordination."
                    tone="info"
                />

                <AppSectionHeader
                    title="Participant"
                    subtitle="Select who is performing the movement trial."
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

                        {progress ? (
                            <AppBadge
                                label={`${progress.done} / ${progress.total}`}
                                tone={progress.done >= progress.total ? 'success' : 'warning'}
                            />
                        ) : null}
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Movement Trials"
                    subtitle="Record baseline first, then feedback if enabled."
                />

                {movements.map((mv) => {
                    const pid = selectedParticipantId ?? participants[0]?.id ?? '';
                    const baseline = pid ? trialFor(pid, mv.type, 'baseline') : null;
                    const feedback = pid ? trialFor(pid, mv.type, 'feedback') : null;

                    const hasBaseline = !!baseline?.metrics;
                    const hasFeedback = !!feedback?.metrics;

                    return (
                        <AppCard key={mv.type}>
                            <View style={styles.movementHeader}>
                                <View style={styles.movementText}>
                                    <AppText variant="sectionTitle">{mv.title}</AppText>

                                    <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                        Duration guidance: {mv.durationSec}s
                                    </AppText>
                                </View>

                                <AppBadge
                                    label={hasBaseline || hasFeedback ? 'Recorded' : 'Pending'}
                                    tone={hasBaseline || hasFeedback ? 'success' : 'warning'}
                                />
                            </View>

                            <AppText variant="body" color="textMuted" style={styles.guidanceText}>
                                {mv.postureGuidance}
                            </AppText>

                            <View style={styles.metricBox}>
                                <MetricRow
                                    label="Baseline smoothness"
                                    value={hasBaseline ? baseline!.metrics!.smoothnessIndex.toFixed(3) : '—'}
                                />

                                <MetricRow
                                    label="Feedback smoothness"
                                    value={hasFeedback ? feedback!.metrics!.smoothnessIndex.toFixed(3) : '—'}
                                />

                                <MetricRow
                                    label="Baseline displacement"
                                    value={
                                        hasBaseline
                                            ? `${baseline!.metrics!.displacementMagnitudeCm.toFixed(2)} cm`
                                            : '—'
                                    }
                                />
                            </View>

                            <View style={styles.buttonRow}>
                                <AppButton
                                    title={hasBaseline ? 'Retake Baseline' : 'Start Baseline'}
                                    variant="outline"
                                    onPress={() =>
                                        void runTrial({
                                            participantId: pid,
                                            movement: mv,
                                            mode: 'baseline',
                                        })
                                    }
                                    disabled={isBusy()}
                                    style={styles.trialButton}
                                />

                                <AppButton
                                    title={hasFeedback ? 'Retake Feedback' : 'Start Feedback'}
                                    onPress={() =>
                                        void runTrial({
                                            participantId: pid,
                                            movement: mv,
                                            mode: 'feedback',
                                        })
                                    }
                                    disabled={!feedbackEnabled || isBusy()}
                                    style={styles.trialButton}
                                />
                            </View>

                            {!feedbackEnabled ? (
                                <InfoBanner
                                    title="Feedback mode disabled"
                                    message="Feedback mode was disabled in Session Setup."
                                    tone="warning"
                                />
                            ) : null}
                        </AppCard>
                    );
                })}

                <AppButton
                    title="View Results"
                    onPress={goToResults}
                    disabled={isBusy()}
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

    runningBanner: {
        marginBottom: spacing.lg,
        borderRadius: radius.xl,
        backgroundColor: colors.primaryDark,
        padding: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    runningTextArea: {
        flex: 1,
    },

    runningHint: {
        marginTop: spacing.xs,
        opacity: 0.85,
    },

    countdownText: {
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
        backgroundColor: colors.primary,
        borderColor: colors.primary,
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

    movementHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    movementText: {
        flex: 1,
    },

    guidanceText: {
        marginTop: spacing.md,
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

    buttonRow: {
        marginTop: spacing.lg,
        flexDirection: 'row',
        gap: spacing.md,
    },

    trialButton: {
        flex: 1,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});