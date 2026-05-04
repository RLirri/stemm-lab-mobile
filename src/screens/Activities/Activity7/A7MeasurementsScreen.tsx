// src/screens/Activities/Activity7/A7MeasurementsScreen.tsx

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    View,
    Vibration,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Accelerometer} from 'expo-sensors';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';

import {
    getActivity7RunDraft,
    getA7NextMeasurementSlot,
    getA7ParticipantPhaseCompletion,
    getA7PhaseLabel as getStoreA7PhaseLabel,
    upsertActivity7Measurement,
    type Activity7RunDraft,
    type A7MeasurementPhase,
    type A7SensorSample,
} from '../../../store/activity7RunDraftStore';

import {
    estimateBreathsFromSamples,
    getA7PhaseLabel,
    getEstimationQualityMessage,
    roundBpm,
} from '../../../services/activity7BreathingService';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A7Measurements'>;

type RecordingState = 'idle' | 'recording' | 'saving';
type MeasurementSlot = { participantId: string; phase: A7MeasurementPhase } | null;
type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

type LastSavedSummary = {
    participantName: string;
    phaseLabel: string;
    durationSec: number;
    breathsPerMinute?: number;
    detectedCycles: number;
    sampleCount: number;
    qualityMessage: string;
};

function now() {
    return Date.now();
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNum(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function safeFinite(n: unknown, fallback = 0) {
    return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function formatBpm(v?: number) {
    if (v == null || !Number.isFinite(v)) return '—';
    return `${roundBpm(v, 1)} BPM`;
}

function formatSeconds(ms: number) {
    return `${Math.max(0, Math.round(ms / 1000))}s`;
}

function getParticipantName(run: Activity7RunDraft, participantId: string) {
    return (
        run.session.participants.find((participant) => participant.id === participantId)?.name ??
        'Unknown participant'
    );
}

function getPhaseInstruction(phase: A7MeasurementPhase) {
    switch (phase) {
        case 'rest':
            return 'Place the phone gently on the chest and remain still while the resting breathing measurement is recorded.';

        case 'post_jog_1min':
            return 'After 1 minute of jogging on the spot, place the phone gently on the chest again and record breathing.';

        case 'post_star_jumps_100':
            return 'After completing 100 star jumps, place the phone gently on the chest again and record breathing.';

        default:
            return 'Place the phone gently on the chest and record breathing.';
    }
}

function triggerMeasurementCompletedFeedback() {
    try {
        Vibration.vibrate([0, 180, 100, 180]);
    } catch {
        // Vibration support can vary across devices/platforms.
    }
}

export default function A7MeasurementsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity7RunDraft | null>(null);

    const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
    const [selectedPhase, setSelectedPhase] = useState<A7MeasurementPhase | null>(null);

    const [recordingState, setRecordingState] = useState<RecordingState>('idle');
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    const [notes, setNotes] = useState('');
    const [lastSavedSummary, setLastSavedSummary] = useState<LastSavedSummary | null>(null);

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownEndAtRef = useRef<number | null>(null);
    const recordingStartedAtRef = useRef<number | null>(null);
    const sampleBufferRef = useRef<A7SensorSample[]>([]);
    const sensorSubscriptionRef = useRef<{ remove: () => void } | null>(null);
    const recordingStateRef = useRef<RecordingState>('idle');

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
        recordingStateRef.current = recordingState;
    }, [recordingState]);

    useEffect(() => {
        if (!user) return;

        const loaded = getActivity7RunDraft(runId);

        if (!loaded) {
            Alert.alert('Session expired', 'Please restart Activity 7.', [
                {text: 'OK', onPress: () => navigation.goBack()},
            ]);
            return;
        }

        if (!loaded.prediction) {
            Alert.alert('Prediction required', 'Please complete the prediction step first.', [
                {
                    text: 'Go to Prediction',
                    onPress: () => navigation.replace('A7Prediction', {activityId, runId}),
                },
            ]);
            return;
        }

        setDraft(loaded);

        const nextSlot = getA7NextMeasurementSlot(loaded);

        if (nextSlot) {
            setSelectedParticipantId(nextSlot.participantId);
            setSelectedPhase(nextSlot.phase);
        } else {
            const firstParticipantId = loaded.session.participants[0]?.id ?? null;
            setSelectedParticipantId(firstParticipantId);
            setSelectedPhase('rest');
        }
    }, [activityId, navigation, runId, user]);

    useEffect(() => {
        return () => {
            cleanupSensorSubscription();
            clearCountdown();

            try {
                Vibration.cancel();
            } catch {
                // no-op
            }
        };
    }, []);

    const participants = draft?.session.participants ?? [];
    const measurementDurationSec = draft?.session.measurementDurationSec ?? 30;

    const selectedParticipant = useMemo(() => {
        if (!draft || !selectedParticipantId) return null;

        return (
            draft.session.participants.find(
                (participant) => participant.id === selectedParticipantId,
            ) ?? null
        );
    }, [draft, selectedParticipantId]);

    const selectedMeasurement = useMemo(() => {
        if (!draft || !selectedParticipantId || !selectedPhase) return null;

        return (
            draft.measurements.find(
                (measurement) =>
                    measurement.participantId === selectedParticipantId &&
                    measurement.phase === selectedPhase,
            ) ?? null
        );
    }, [draft, selectedParticipantId, selectedPhase]);

    const selectedCompletion = useMemo(() => {
        if (!draft || !selectedParticipantId) return null;
        return getA7ParticipantPhaseCompletion(draft, selectedParticipantId);
    }, [draft, selectedParticipantId]);

    const nextSlot = useMemo<MeasurementSlot>(() => {
        if (!draft) return null;
        return getA7NextMeasurementSlot(draft);
    }, [draft]);

    const allCompleted = !nextSlot && !!draft;

    const completedPhaseCount = useMemo(() => {
        if (!draft) return 0;

        return draft.measurements.filter((measurement) => {
            return (
                measurement.estimatedBreathsPerMin != null ||
                measurement.detectedCycles != null ||
                measurement.sampling?.sampleCount != null
            );
        }).length;
    }, [draft]);

    const totalRequiredPhaseCount = useMemo(() => {
        return participants.length * 3;
    }, [participants.length]);

    const canStart =
        !!draft &&
        !!selectedParticipantId &&
        !!selectedPhase &&
        recordingState === 'idle';

    function clearCountdown() {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        countdownEndAtRef.current = null;
        setSecondsLeft(null);
    }

    function cleanupSensorSubscription() {
        try {
            sensorSubscriptionRef.current?.remove();
        } catch {
            // no-op
        }

        sensorSubscriptionRef.current = null;
    }

    function refreshDraft() {
        const latest = getActivity7RunDraft(runId);

        if (!latest) {
            Alert.alert('Session expired', 'Please restart Activity 7.', [
                {text: 'OK', onPress: () => navigation.goBack()},
            ]);
            return;
        }

        setDraft(latest);

        const next = getA7NextMeasurementSlot(latest);

        if (next) {
            setSelectedParticipantId(next.participantId);
            setSelectedPhase(next.phase);
        }
    }

    function beginCountdown(totalSec: number, onElapsed: () => void) {
        clearCountdown();

        const safeTotalSec = clampInt(totalSec, 1, 600);
        const endAt = now() + safeTotalSec * 1000;

        countdownEndAtRef.current = endAt;
        setSecondsLeft(safeTotalSec);

        timerRef.current = setInterval(() => {
            const remain = Math.max(0, Math.ceil((endAt - now()) / 1000));
            setSecondsLeft(remain);

            if (remain <= 0) {
                clearCountdown();
                onElapsed();
            }
        }, 200);
    }

    async function startRecording() {
        if (!draft || !selectedParticipantId || !selectedPhase) {
            Alert.alert('Not ready', 'Please select a participant and phase first.');
            return;
        }

        if (!draft.prediction) {
            Alert.alert('Prediction required', 'Please complete prediction first.');
            return;
        }

        setLastSavedSummary(null);
        sampleBufferRef.current = [];
        recordingStartedAtRef.current = now();
        recordingStateRef.current = 'recording';
        setRecordingState('recording');

        try {
            const targetHz = clampNum(draft.session.targetSamplingHz ?? 25, 1, 200);
            const intervalMs = clampInt(1000 / targetHz, 5, 1000);

            Accelerometer.setUpdateInterval(intervalMs);

            cleanupSensorSubscription();

            sensorSubscriptionRef.current = Accelerometer.addListener((reading: any) => {
                const timestamp = now();

                sampleBufferRef.current.push({
                    timestamp,
                    x: safeFinite(reading?.x),
                    y: safeFinite(reading?.y),
                    z: safeFinite(reading?.z),
                });

                if (sampleBufferRef.current.length > 15000) {
                    sampleBufferRef.current = sampleBufferRef.current.slice(-12000);
                }
            });

            beginCountdown(measurementDurationSec, () => {
                void finishRecordingAndSave();
            });
        } catch (error: unknown) {
            cleanupSensorSubscription();
            clearCountdown();
            recordingStateRef.current = 'idle';
            setRecordingState('idle');

            Alert.alert(
                'Sensor unavailable',
                error instanceof Error
                    ? error.message
                    : 'Could not start the accelerometer. Check that expo-sensors is installed and motion access is available on this device.',
            );
        }
    }

    async function finishRecordingAndSave() {
        if (!draft || !selectedParticipantId || !selectedPhase) {
            cleanupSensorSubscription();
            clearCountdown();
            recordingStateRef.current = 'idle';
            setRecordingState('idle');
            return;
        }

        if (recordingStateRef.current !== 'recording') return;

        recordingStateRef.current = 'saving';
        setRecordingState('saving');

        const endedAt = now();
        const startedAt = recordingStartedAtRef.current ?? endedAt;
        const samples = [...sampleBufferRef.current];

        cleanupSensorSubscription();
        clearCountdown();

        if (samples.length === 0) {
            recordingStateRef.current = 'idle';
            setRecordingState('idle');

            Alert.alert(
                'No sensor data',
                'No accelerometer data was captured. Please keep the device still on the chest and try again.',
            );
            return;
        }

        try {
            const estimation = estimateBreathsFromSamples({
                samples,
                targetSamplingHz: draft.session.targetSamplingHz,
                smoothingWindowSec: draft.session.smoothingWindowSec,
                minPeakGapMs: draft.session.minPeakGapMs,
            });

            const updated = upsertActivity7Measurement(runId, {
                participantId: selectedParticipantId,
                phase: selectedPhase,
                startedAt,
                endedAt,
                samples,
                estimatedBreathsPerMin: estimation.breathsPerMinute,
                detectedCycles: estimation.detectedCycles,
                notes: notes.trim() || undefined,
            });

            setDraft(updated);
            setNotes('');

            const summary: LastSavedSummary = {
                participantName: getParticipantName(updated, selectedParticipantId),
                phaseLabel: getA7PhaseLabel(selectedPhase),
                durationSec: Math.round(estimation.durationMs / 1000),
                breathsPerMinute: estimation.breathsPerMinute,
                detectedCycles: estimation.detectedCycles,
                sampleCount: estimation.sampleCount,
                qualityMessage: getEstimationQualityMessage(estimation),
            };

            setLastSavedSummary(summary);

            const maybeNext = getA7NextMeasurementSlot(updated);

            if (maybeNext) {
                setSelectedParticipantId(maybeNext.participantId);
                setSelectedPhase(maybeNext.phase);
            }

            triggerMeasurementCompletedFeedback();

            showToast(
                'Measurement saved',
                'success',
                `${summary.participantName} • ${summary.phaseLabel} • ${formatBpm(
                    summary.breathsPerMinute,
                )}`,
            );
        } catch (error: unknown) {
            Alert.alert(
                'Save failed',
                error instanceof Error ? error.message : 'Failed to save measurement.',
            );
        } finally {
            sampleBufferRef.current = [];
            recordingStartedAtRef.current = null;
            recordingStateRef.current = 'idle';
            setRecordingState('idle');
            refreshDraft();
        }
    }

    function stopEarly() {
        if (recordingState !== 'recording') return;

        Alert.alert(
            'Finish measurement?',
            'This will stop the current recording and save the captured dataset so far.',
            [
                {text: 'Continue recording', style: 'cancel'},
                {
                    text: 'Finish now',
                    onPress: () => {
                        void finishRecordingAndSave();
                    },
                },
            ],
        );
    }

    function handleParticipantPress(participantId: string) {
        if (!draft || recordingState !== 'idle') return;

        setSelectedParticipantId(participantId);

        const completion = getA7ParticipantPhaseCompletion(draft, participantId);

        const suggestedPhase = !completion.rest
            ? 'rest'
            : !completion.post_jog_1min
                ? 'post_jog_1min'
                : !completion.post_star_jumps_100
                    ? 'post_star_jumps_100'
                    : 'rest';

        setSelectedPhase(suggestedPhase);
    }

    function handlePhasePress(phase: A7MeasurementPhase) {
        if (recordingState !== 'idle') return;
        setSelectedPhase(phase);
    }

    function goToResults() {
        if (!draft) return;

        const next = getA7NextMeasurementSlot(draft);

        if (next) {
            const participantName = getParticipantName(draft, next.participantId);

            Alert.alert(
                'Measurements incomplete',
                `${participantName} still needs ${getStoreA7PhaseLabel(
                    next.phase,
                )} before you can continue to results.`,
            );
            return;
        }

        showToast('Measurements complete', 'success', 'Opening results dashboard.');

        setTimeout(() => {
            navigation.navigate('A7Results', {activityId, runId});
        }, 600);
    }

    if (!user) return null;

    if (!draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading breathing measurements..."/>
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
                    <AppBadge label="Activity 7" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Breathing Measurements
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Record chest movement using the accelerometer for all required
                        breathing phases.
                    </AppText>
                </View>

                {recordingState === 'recording' ? (
                    <View style={styles.recordingBanner}>
                        <View style={styles.recordingTextArea}>
                            <AppText variant="bodyStrong" color="inverseText">
                                Recording breathing movement
                            </AppText>

                            <AppText variant="caption" color="inverseText" style={styles.recordingHint}>
                                Keep the phone gently on the chest and remain steady.
                            </AppText>
                        </View>

                        <AppBadge
                            label={secondsLeft != null ? `${secondsLeft}s` : 'Active'}
                            tone="info"
                        />
                    </View>
                ) : null}

                {recordingState === 'saving' ? (
                    <View style={styles.savingBox}>
                        <ActivityIndicator color={colors.primary}/>

                        <AppText variant="caption" color="textMuted">
                            Estimating breathing rate and saving measurement...
                        </AppText>
                    </View>
                ) : null}

                {lastSavedSummary ? (
                    <AppCard>
                        <View style={styles.savedHeader}>
                            <View style={styles.savedTextArea}>
                                <AppText variant="bodyStrong">Latest saved measurement</AppText>

                                <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                    {lastSavedSummary.participantName} • {lastSavedSummary.phaseLabel}
                                </AppText>
                            </View>

                            <AppBadge label={formatBpm(lastSavedSummary.breathsPerMinute)} tone="success"/>
                        </View>

                        <View style={styles.savedMetaGrid}>
                            <MetricTile label="Detected cycles" value={String(lastSavedSummary.detectedCycles)}/>
                            <MetricTile label="Duration" value={`${lastSavedSummary.durationSec}s`}/>
                            <MetricTile label="Samples" value={String(lastSavedSummary.sampleCount)}/>
                        </View>

                        <InfoBanner
                            title="Estimation quality"
                            message={lastSavedSummary.qualityMessage}
                            tone="info"
                        />
                    </AppCard>
                ) : null}

                <InfoBanner
                    title="Measurement protocol"
                    message={`Place the phone gently on the participant's chest, keep the same placement style, and record for ${measurementDurationSec}s per phase.`}
                    tone="info"
                />

                <AppSectionHeader
                    title="Progress"
                    subtitle="Complete all participant-phase measurements before results."
                />

                <View style={styles.heroCard}>
                    <View style={styles.heroTop}>
                        <AppText variant="bodyStrong" color="inverseText">
                            Completed Measurements
                        </AppText>

                        <AppBadge
                            label={allCompleted ? 'Complete' : 'In progress'}
                            tone={allCompleted ? 'success' : 'warning'}
                        />
                    </View>

                    <AppText variant="title" color="inverseText" style={styles.heroScore}>
                        {completedPhaseCount} / {totalRequiredPhaseCount}
                    </AppText>

                    <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                        Required phases: Rest, Post-Jog, and Post-Star-Jumps for each
                        participant.
                    </AppText>
                </View>

                <AppSectionHeader
                    title="Participants"
                    subtitle="Select the participant who is currently being measured."
                />

                <AppCard>
                    <View style={styles.chipWrap}>
                        {participants.map((participant) => {
                            const selected = participant.id === selectedParticipantId;
                            const completion = getA7ParticipantPhaseCompletion(draft, participant.id);
                            const completedCount =
                                Number(completion.rest) +
                                Number(completion.post_jog_1min) +
                                Number(completion.post_star_jumps_100);

                            return (
                                <Pressable
                                    key={participant.id}
                                    style={[styles.chip, selected && styles.chipSelected]}
                                    onPress={() => handleParticipantPress(participant.id)}
                                    disabled={recordingState !== 'idle'}
                                >
                                    <AppText
                                        variant="bodyStrong"
                                        color={selected ? 'inverseText' : 'text'}
                                    >
                                        {participant.name}
                                    </AppText>

                                    <AppText
                                        variant="caption"
                                        color={selected ? 'inverseText' : 'textMuted'}
                                        style={styles.smallGap}
                                    >
                                        {completedCount}/3 complete
                                    </AppText>
                                </Pressable>
                            );
                        })}
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Current Measurement Slot"
                    subtitle="Choose the breathing phase for the selected participant."
                />

                <AppCard>
                    <View style={styles.slotHeader}>
                        <View style={styles.slotTextArea}>
                            <AppText variant="caption" color="textMuted">
                                Selected participant
                            </AppText>

                            <AppText variant="sectionTitle" style={styles.smallGap}>
                                {selectedParticipant?.name ?? '—'}
                            </AppText>
                        </View>

                        <AppBadge
                            label={selectedPhase ? getA7PhaseLabel(selectedPhase) : 'Select phase'}
                            tone={allCompleted ? 'success' : 'info'}
                        />
                    </View>

                    <View style={styles.nextSlotBox}>
                        <AppText variant="caption" color="textMuted">
                            Suggested next incomplete slot
                        </AppText>

                        <AppText variant="bodyStrong" style={styles.smallGap}>
                            {nextSlot
                                ? `${getParticipantName(draft, nextSlot.participantId)} • ${getA7PhaseLabel(
                                    nextSlot.phase,
                                )}`
                                : 'All measurements complete'}
                        </AppText>
                    </View>

                    <InfoBanner
                        title="Phase instruction"
                        message={selectedPhase ? getPhaseInstruction(selectedPhase) : 'Choose a phase to continue.'}
                        tone="info"
                    />

                    <View style={styles.phaseList}>
                        {(['rest', 'post_jog_1min', 'post_star_jumps_100'] as A7MeasurementPhase[]).map(
                            (phase) => {
                                const selected = selectedPhase === phase;
                                const done = selectedCompletion?.[phase] === true && selectedParticipantId != null;

                                return (
                                    <Pressable
                                        key={phase}
                                        style={[styles.phaseChip, selected && styles.phaseChipSelected]}
                                        onPress={() => handlePhasePress(phase)}
                                        disabled={recordingState !== 'idle'}
                                    >
                                        <View style={styles.phaseTextArea}>
                                            <AppText
                                                variant="bodyStrong"
                                                color={selected ? 'inverseText' : 'text'}
                                            >
                                                {getA7PhaseLabel(phase)}
                                            </AppText>

                                            <AppText
                                                variant="caption"
                                                color={selected ? 'inverseText' : 'textMuted'}
                                                style={styles.smallGap}
                                            >
                                                {done ? 'Saved' : 'Pending'}
                                            </AppText>
                                        </View>

                                        <AppBadge label={done ? 'Done' : 'Needed'} tone={done ? 'success' : 'warning'}/>
                                    </Pressable>
                                );
                            },
                        )}
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Measurement Notes"
                    subtitle="Optional note for the current participant and phase."
                />

                <AppCard>
                    <AppInput
                        label="Notes"
                        value={notes}
                        onChangeText={setNotes}
                        editable={recordingState === 'idle'}
                        multiline
                        placeholder="e.g. Slight body movement during the last 5 seconds"
                        style={styles.notesInput}
                    />
                </AppCard>

                <AppSectionHeader
                    title="Saved Result for Selected Slot"
                    subtitle="Review the currently saved result before retaking or continuing."
                />

                <AppCard>
                    <MetricRow
                        label="Phase"
                        value={selectedPhase ? getA7PhaseLabel(selectedPhase) : '—'}
                    />

                    <MetricRow
                        label="Estimated breathing rate"
                        value={formatBpm(selectedMeasurement?.estimatedBreathsPerMin)}
                    />

                    <MetricRow
                        label="Detected cycles"
                        value={selectedMeasurement?.detectedCycles != null ? String(selectedMeasurement.detectedCycles) : '—'}
                    />

                    <MetricRow
                        label="Duration"
                        value={selectedMeasurement ? formatSeconds(selectedMeasurement.durationMs) : '—'}
                    />

                    <MetricRow
                        label="Sensor samples"
                        value={
                            selectedMeasurement?.sampling?.sampleCount != null
                                ? String(selectedMeasurement.sampling.sampleCount)
                                : '—'
                        }
                    />

                    <MetricRow
                        label="Actual sampling rate"
                        value={
                            selectedMeasurement?.sampling?.actualSamplingHz != null
                                ? `${roundBpm(selectedMeasurement.sampling.actualSamplingHz, 1)} Hz`
                                : '—'
                        }
                    />
                </AppCard>

                <View style={styles.actions}>
                    <View style={styles.actionRow}>
                        <AppButton
                            title="Start Measurement"
                            onPress={startRecording}
                            disabled={!canStart}
                            style={styles.startButton}
                        />

                        <AppButton
                            title="Finish Early"
                            variant="outline"
                            onPress={stopEarly}
                            disabled={recordingState !== 'recording'}
                            style={styles.finishButton}
                        />
                    </View>

                    <AppButton
                        title="Continue to Results"
                        onPress={goToResults}
                        disabled={recordingState !== 'idle' || !allCompleted}
                    />
                </View>

                {!allCompleted ? (
                    <InfoBanner
                        title="Measurements incomplete"
                        message="Complete all participant-phase measurements before continuing to results."
                        tone="warning"
                    />
                ) : (
                    <InfoBanner
                        title="Measurements complete"
                        message="All required measurements are complete. You can continue to the results dashboard."
                        tone="success"
                    />
                )}

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

type MetricTileProps = {
    label: string;
    value: string;
};

function MetricTile({label, value}: MetricTileProps) {
    return (
        <View style={styles.metricTile}>
            <AppText variant="caption" color="textMuted">
                {label}
            </AppText>

            <AppText variant="bodyStrong" style={styles.metricTileValue}>
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

    recordingBanner: {
        marginBottom: spacing.lg,
        borderRadius: radius.xl,
        backgroundColor: colors.primaryDark,
        padding: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    recordingTextArea: {
        flex: 1,
    },

    recordingHint: {
        marginTop: spacing.xs,
        opacity: 0.85,
    },

    savingBox: {
        marginBottom: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
    },

    savedHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    savedTextArea: {
        flex: 1,
    },

    savedMetaGrid: {
        marginTop: spacing.md,
        gap: spacing.sm,
    },

    heroCard: {
        borderRadius: radius.xl,
        backgroundColor: colors.primaryDark,
        padding: spacing.xl,
        marginBottom: spacing.lg,
    },

    heroTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.md,
    },

    heroScore: {
        marginTop: spacing.md,
    },

    heroHint: {
        marginTop: spacing.md,
        opacity: 0.75,
    },

    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    chip: {
        minWidth: 128,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.md,
    },

    chipSelected: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    slotHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    slotTextArea: {
        flex: 1,
    },

    nextSlotBox: {
        marginTop: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },

    phaseList: {
        marginTop: spacing.md,
        gap: spacing.sm,
    },

    phaseChip: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    phaseChipSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },

    phaseTextArea: {
        flex: 1,
    },

    notesInput: {
        minHeight: 110,
        textAlignVertical: 'top',
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

    metricTile: {
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },

    metricTileValue: {
        marginTop: spacing.xs,
    },

    actions: {
        marginTop: spacing.lg,
        gap: spacing.md,
    },

    actionRow: {
        flexDirection: 'row',
        gap: spacing.md,
    },

    startButton: {
        flex: 1,
    },

    finishButton: {
        width: 132,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});