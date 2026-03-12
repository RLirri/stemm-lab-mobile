// src/screens/Activities/Activity7/A7MeasurementsScreen.tsx

import React, {useEffect, useMemo, useRef, useState} from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    Vibration,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";
import {Accelerometer} from "expo-sensors";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";

import {
    getActivity7RunDraft,
    getA7NextMeasurementSlot,
    getA7ParticipantPhaseCompletion,
    getA7PhaseLabel as getStoreA7PhaseLabel,
    upsertActivity7Measurement,
    type Activity7RunDraft,
    type A7MeasurementPhase,
    type A7SensorSample,
} from "../../../store/activity7RunDraftStore";

import {
    estimateBreathsFromSamples,
    getA7PhaseLabel,
    getEstimationQualityMessage,
    roundBpm,
} from "../../../services/activity7BreathingService";

type Props = NativeStackScreenProps<AppStackParamList, "A7Measurements">;

type RecordingState = "idle" | "recording" | "saving";
type MeasurementSlot = { participantId: string; phase: A7MeasurementPhase } | null;

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
    return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function formatBpm(v?: number) {
    if (v == null || !Number.isFinite(v)) return "—";
    return `${roundBpm(v, 1)} BPM`;
}

function formatSeconds(ms: number) {
    return `${Math.max(0, Math.round(ms / 1000))}s`;
}

function getParticipantName(run: Activity7RunDraft, participantId: string) {
    return (
        run.session.participants.find((p) => p.id === participantId)?.name ??
        "Unknown participant"
    );
}

function getPhaseInstruction(phase: A7MeasurementPhase) {
    switch (phase) {
        case "rest":
            return "Place the phone gently on the chest and remain still while the breathing-at-rest measurement is recorded.";
        case "post_jog_1min":
            return "After 1 minute of jogging on the spot, place the phone gently on the chest again and record breathing.";
        case "post_star_jumps_100":
            return "After completing 100 star jumps, place the phone gently on the chest again and record breathing.";
        default:
            return "Place the phone gently on the chest and record breathing.";
    }
}

function getPhaseBadgeTone(phase: A7MeasurementPhase) {
    switch (phase) {
        case "rest":
            return {
                bg: "#eef6ff",
                border: "#d7e8ff",
                text: "#1b4f8c",
            };
        case "post_jog_1min":
            return {
                bg: "#fff7e8",
                border: "#fde3b0",
                text: "#8a5400",
            };
        case "post_star_jumps_100":
            return {
                bg: "#f7eefc",
                border: "#e6d5f4",
                text: "#6b2c91",
            };
        default:
            return {
                bg: "#f4f4f5",
                border: "#e5e7eb",
                text: "#222",
            };
    }
}

/**
 * Give a short tactile confirmation that the current measurement has finished.
 * Pattern: short buzz -> brief pause -> short buzz
 */
function triggerMeasurementCompletedFeedback() {
    try {
        Vibration.vibrate([0, 180, 100, 180]);
    } catch {
        // no-op: vibration support can vary across devices/platforms
    }
}

export default function A7MeasurementsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity7RunDraft | null>(null);

    const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
    const [selectedPhase, setSelectedPhase] = useState<A7MeasurementPhase | null>(null);

    const [recordingState, setRecordingState] = useState<RecordingState>("idle");
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    const [notes, setNotes] = useState("");
    const [lastSavedSummary, setLastSavedSummary] = useState<LastSavedSummary | null>(null);

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const countdownEndAtRef = useRef<number | null>(null);
    const recordingStartedAtRef = useRef<number | null>(null);
    const sampleBufferRef = useRef<A7SensorSample[]>([]);
    const sensorSubscriptionRef = useRef<{ remove: () => void } | null>(null);

    useEffect(() => {
        if (!user) return;

        const loaded = getActivity7RunDraft(runId);
        if (!loaded) {
            Alert.alert("Session expired", "Please restart Activity 7.", [
                {text: "OK", onPress: () => navigation.goBack()},
            ]);
            return;
        }

        if (!loaded.prediction) {
            Alert.alert("Prediction required", "Please complete the prediction step first.", [
                {
                    text: "Go to Prediction",
                    onPress: () => navigation.replace("A7Prediction", {activityId, runId}),
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
            const firstPid = loaded.session.participants[0]?.id ?? null;
            setSelectedParticipantId(firstPid);
            setSelectedPhase("rest");
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

    const phaseTone = selectedPhase ? getPhaseBadgeTone(selectedPhase) : getPhaseBadgeTone("rest");

    const selectedParticipant = useMemo(() => {
        if (!draft || !selectedParticipantId) return null;
        return draft.session.participants.find((p) => p.id === selectedParticipantId) ?? null;
    }, [draft, selectedParticipantId]);

    const selectedMeasurement = useMemo(() => {
        if (!draft || !selectedParticipantId || !selectedPhase) return null;
        return (
            draft.measurements.find(
                (m) => m.participantId === selectedParticipantId && m.phase === selectedPhase
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
    const canStart =
        !!draft &&
        !!selectedParticipantId &&
        !!selectedPhase &&
        recordingState === "idle";

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
            Alert.alert("Session expired", "Please restart Activity 7.", [
                {text: "OK", onPress: () => navigation.goBack()},
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
            Alert.alert("Not ready", "Please select a participant and phase first.");
            return;
        }

        if (!draft.prediction) {
            Alert.alert("Prediction required", "Please complete prediction first.");
            return;
        }

        setLastSavedSummary(null);
        sampleBufferRef.current = [];
        recordingStartedAtRef.current = now();
        setRecordingState("recording");

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

                if (sampleBufferRef.current.length > 15_000) {
                    sampleBufferRef.current = sampleBufferRef.current.slice(-12_000);
                }
            });

            beginCountdown(measurementDurationSec, () => {
                void finishRecordingAndSave();
            });
        } catch (e: any) {
            cleanupSensorSubscription();
            clearCountdown();
            setRecordingState("idle");

            Alert.alert(
                "Sensor unavailable",
                e?.message ??
                "Could not start the accelerometer. Check that expo-sensors is installed and motion access is available on this device."
            );
        }
    }

    async function finishRecordingAndSave() {
        if (!draft || !selectedParticipantId || !selectedPhase) {
            cleanupSensorSubscription();
            clearCountdown();
            setRecordingState("idle");
            return;
        }

        if (recordingState !== "recording") return;

        setRecordingState("saving");

        const endedAt = now();
        const startedAt = recordingStartedAtRef.current ?? endedAt;
        const samples = [...sampleBufferRef.current];

        cleanupSensorSubscription();
        clearCountdown();

        if (samples.length === 0) {
            setRecordingState("idle");
            Alert.alert(
                "No sensor data",
                "No accelerometer data was captured. Please keep the device still on the chest and try again."
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
            setNotes("");

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

            const bpmText =
                estimation.breathsPerMinute != null
                    ? `${roundBpm(estimation.breathsPerMinute, 1)} BPM`
                    : "Unavailable";

            triggerMeasurementCompletedFeedback();

            Alert.alert(
                "Measurement saved ✅",
                `${summary.participantName}\n${summary.phaseLabel}\n\nEstimated breathing rate: ${bpmText}\nDetected cycles: ${summary.detectedCycles}\nSamples: ${summary.sampleCount}\n\n${summary.qualityMessage}`
            );
        } catch (e: any) {
            Alert.alert("Save failed", e?.message ?? "Failed to save measurement.");
        } finally {
            sampleBufferRef.current = [];
            recordingStartedAtRef.current = null;
            setRecordingState("idle");
            refreshDraft();
        }
    }

    function stopEarly() {
        if (recordingState !== "recording") return;

        Alert.alert(
            "Finish measurement?",
            "This will stop the current recording and save the captured dataset so far.",
            [
                {text: "Continue recording", style: "cancel"},
                {
                    text: "Finish now",
                    onPress: () => {
                        void finishRecordingAndSave();
                    },
                },
            ]
        );
    }

    function handleParticipantPress(participantId: string) {
        if (!draft || recordingState !== "idle") return;
        setSelectedParticipantId(participantId);

        const completion = getA7ParticipantPhaseCompletion(draft, participantId);
        const suggestedPhase = !completion.rest
            ? "rest"
            : !completion.post_jog_1min
                ? "post_jog_1min"
                : !completion.post_star_jumps_100
                    ? "post_star_jumps_100"
                    : "rest";

        setSelectedPhase(suggestedPhase);
    }

    function handlePhasePress(phase: A7MeasurementPhase) {
        if (recordingState !== "idle") return;
        setSelectedPhase(phase);
    }

    function goToResults() {
        if (!draft) return;

        const next = getA7NextMeasurementSlot(draft);
        if (next) {
            const pname = getParticipantName(draft, next.participantId);
            Alert.alert(
                "Measurements incomplete",
                `${pname} still needs ${getStoreA7PhaseLabel(next.phase)} before you can continue to results.`
            );
            return;
        }

        navigation.navigate("A7Results", {activityId, runId});
    }

    if (!user) return null;

    if (!draft) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={styles.loadingText}>Loading…</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={{flex: 1, backgroundColor: "#fff"}}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Breathing Measurements</Text>
                <Text style={styles.sub}>
                    Record chest movement using the accelerometer for all required phases. Prediction must
                    already be completed before measurement begins.
                </Text>

                {recordingState === "recording" ? (
                    <View style={styles.recordingBanner}>
                        <Text style={styles.recordingTitle}>Recording…</Text>
                        <Text style={styles.recordingText}>
                            Keep the phone gently on the chest and remain steady.
                        </Text>
                        <Text style={styles.recordingCountdown}>
                            {secondsLeft != null ? `${secondsLeft}s left` : "In progress"}
                        </Text>
                    </View>
                ) : null}

                {lastSavedSummary ? (
                    <View style={styles.savedBanner}>
                        <Text style={styles.savedTitle}>Latest saved measurement</Text>
                        <Text style={styles.savedText}>
                            {lastSavedSummary.participantName} • {lastSavedSummary.phaseLabel}
                        </Text>
                        <Text style={[styles.savedText, {fontWeight: "900", marginTop: 6}]}>
                            {formatBpm(lastSavedSummary.breathsPerMinute)} • Cycles {lastSavedSummary.detectedCycles}
                        </Text>
                        <Text style={styles.savedText}>
                            Duration {lastSavedSummary.durationSec}s • Samples {lastSavedSummary.sampleCount}
                        </Text>
                        <Text style={styles.savedHint}>{lastSavedSummary.qualityMessage}</Text>
                    </View>
                ) : null}

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Measurement protocol</Text>
                    <Text style={styles.body}>• Place the phone gently on the participant’s chest.</Text>
                    <Text style={styles.body}>• Use the same placement style across all phases.</Text>
                    <Text style={styles.body}>• Ask the participant to stay as still as possible during
                        recording.</Text>
                    <Text style={styles.body}>
                        • Required phases: Rest, Post-Exercise Measurement 1, Post-Exercise Measurement 2.
                    </Text>
                    <Text style={styles.body}>
                        • The configured measurement duration is{" "}
                        <Text style={{fontWeight: "900"}}>{measurementDurationSec}s</Text>.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Participants</Text>
                    <Text style={styles.help}>
                        Rotate through all team members. Each participant must complete all three required phases.
                    </Text>

                    <View style={styles.chipWrap}>
                        {participants.map((p) => {
                            const selected = p.id === selectedParticipantId;
                            const completion = getA7ParticipantPhaseCompletion(draft, p.id);
                            const completedCount =
                                Number(completion.rest) +
                                Number(completion.post_jog_1min) +
                                Number(completion.post_star_jumps_100);

                            return (
                                <Pressable
                                    key={p.id}
                                    style={[styles.chip, selected && styles.chipSelected]}
                                    onPress={() => handleParticipantPress(p.id)}
                                    disabled={recordingState !== "idle"}
                                >
                                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                                        {p.name}
                                    </Text>
                                    <Text style={[styles.chipSubText, selected && styles.chipSubTextSelected]}>
                                        {completedCount}/3 complete
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Current measurement slot</Text>

                    <View
                        style={[
                            styles.phaseBadge,
                            {
                                backgroundColor: phaseTone.bg,
                                borderColor: phaseTone.border,
                            },
                        ]}
                    >
                        <Text style={[styles.phaseBadgeText, {color: phaseTone.text}]}>
                            {selectedPhase ? getA7PhaseLabel(selectedPhase) : "Select phase"}
                        </Text>
                    </View>

                    <Text style={styles.slotLabel}>
                        Participant: <Text style={styles.slotValue}>{selectedParticipant?.name ?? "—"}</Text>
                    </Text>

                    <Text style={[styles.slotLabel, {marginTop: 6}]}>
                        Suggested next incomplete slot:{" "}
                        <Text style={styles.slotValue}>
                            {nextSlot
                                ? `${getParticipantName(draft, nextSlot.participantId)} • ${getA7PhaseLabel(nextSlot.phase)}`
                                : "All measurements complete"}
                        </Text>
                    </Text>

                    <Text style={[styles.help, {marginTop: 12}]}>
                        {selectedPhase ? getPhaseInstruction(selectedPhase) : "Choose a phase to continue."}
                    </Text>

                    <View style={styles.phaseRow}>
                        {(["rest", "post_jog_1min", "post_star_jumps_100"] as A7MeasurementPhase[]).map(
                            (phase) => {
                                const selected = selectedPhase === phase;
                                const done =
                                    selectedCompletion?.[phase] === true &&
                                    selectedParticipantId != null;

                                return (
                                    <Pressable
                                        key={phase}
                                        style={[
                                            styles.phaseChip,
                                            selected && styles.phaseChipSelected,
                                            done && styles.phaseChipDone,
                                        ]}
                                        onPress={() => handlePhasePress(phase)}
                                        disabled={recordingState !== "idle"}
                                    >
                                        <Text
                                            style={[
                                                styles.phaseChipText,
                                                selected && styles.phaseChipTextSelected,
                                            ]}
                                        >
                                            {getA7PhaseLabel(phase)}
                                        </Text>
                                        {done ? <Text style={styles.phaseChipDoneText}>Saved</Text> : null}
                                    </Pressable>
                                );
                            }
                        )}
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Measurement notes</Text>
                    <Text style={styles.help}>
                        Optional notes for this measurement only, such as placement issue, movement artefacts, or
                        participant posture.
                    </Text>

                    <TextInput
                        value={notes}
                        onChangeText={setNotes}
                        editable={recordingState === "idle"}
                        multiline
                        placeholder="e.g. Slight body movement during last 5 seconds"
                        style={styles.input}
                    />
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Current saved result for selected slot</Text>

                    <Row label="Phase">
                        <Text style={styles.valueText}>
                            {selectedPhase ? getA7PhaseLabel(selectedPhase) : "—"}
                        </Text>
                    </Row>

                    <Row label="Estimated breathing rate">
                        <Text style={styles.valueText}>
                            {formatBpm(selectedMeasurement?.estimatedBreathsPerMin)}
                        </Text>
                    </Row>

                    <Row label="Detected cycles">
                        <Text style={styles.valueText}>
                            {selectedMeasurement?.detectedCycles ?? "—"}
                        </Text>
                    </Row>

                    <Row label="Duration">
                        <Text style={styles.valueText}>
                            {selectedMeasurement ? formatSeconds(selectedMeasurement.durationMs) : "—"}
                        </Text>
                    </Row>

                    <Row label="Sensor samples">
                        <Text style={styles.valueText}>
                            {selectedMeasurement?.sampling?.sampleCount ?? "—"}
                        </Text>
                    </Row>

                    <Row label="Actual sampling rate">
                        <Text style={styles.valueText}>
                            {selectedMeasurement?.sampling?.actualSamplingHz != null
                                ? `${roundBpm(selectedMeasurement.sampling.actualSamplingHz, 1)} Hz`
                                : "—"}
                        </Text>
                    </Row>
                </View>

                <View style={styles.actionRow}>
                    <Pressable
                        style={[styles.primaryBtn, !canStart && styles.btnDisabled]}
                        onPress={startRecording}
                        disabled={!canStart}
                    >
                        <Text style={styles.primaryBtnText}>Start Measurement</Text>
                    </Pressable>

                    <Pressable
                        style={[
                            styles.secondaryBtn,
                            recordingState !== "recording" && styles.btnDisabled,
                        ]}
                        onPress={stopEarly}
                        disabled={recordingState !== "recording"}
                    >
                        <Text style={styles.secondaryBtnText}>Finish Early</Text>
                    </Pressable>
                </View>

                <Pressable
                    style={[
                        styles.primaryBtnWide,
                        (recordingState !== "idle" || !allCompleted) && styles.btnDisabled,
                    ]}
                    onPress={goToResults}
                    disabled={recordingState !== "idle" || !allCompleted}
                >
                    <Text style={styles.primaryBtnText}>Continue to Results</Text>
                </Pressable>

                {!allCompleted ? (
                    <Text style={styles.footerHint}>
                        Complete all participant-phase measurements before continuing.
                    </Text>
                ) : (
                    <Text style={styles.footerHint}>
                        All required measurements are complete. You can continue to results.
                    </Text>
                )}

                <View style={{height: 40}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function Row(props: { label: string; children: React.ReactNode }) {
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{props.label}</Text>
            {props.children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        padding: 20,
        backgroundColor: "#fff",
    },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
    },
    loadingText: {
        marginTop: 10,
        opacity: 0.7,
    },

    title: {
        fontSize: 26,
        fontWeight: "900",
    },
    sub: {
        marginTop: 8,
        opacity: 0.75,
        lineHeight: 20,
    },

    recordingBanner: {
        marginTop: 14,
        borderRadius: 16,
        padding: 14,
        backgroundColor: "#111",
    },
    recordingTitle: {
        color: "white",
        fontWeight: "900",
        fontSize: 16,
    },
    recordingText: {
        color: "white",
        marginTop: 6,
        opacity: 0.9,
    },
    recordingCountdown: {
        color: "white",
        marginTop: 8,
        fontWeight: "900",
        fontSize: 18,
    },

    savedBanner: {
        marginTop: 14,
        borderRadius: 16,
        padding: 14,
        backgroundColor: "#f4f5f7",
        borderWidth: 1,
        borderColor: "#e5e7eb",
    },
    savedTitle: {
        fontWeight: "900",
        fontSize: 16,
        color: "#111",
    },
    savedText: {
        marginTop: 6,
        color: "#111",
        opacity: 0.88,
    },
    savedHint: {
        marginTop: 8,
        color: "#111",
        opacity: 0.72,
        lineHeight: 18,
    },

    card: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 16,
        padding: 14,
    },

    cardTitle: {
        fontSize: 16,
        fontWeight: "900",
        marginBottom: 8,
    },
    body: {
        marginTop: 6,
        lineHeight: 18,
        opacity: 0.9,
    },
    help: {
        opacity: 0.75,
        lineHeight: 18,
    },

    chipWrap: {
        marginTop: 10,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
    },
    chip: {
        minWidth: 120,
        borderWidth: 1,
        borderColor: "#ddd",
        backgroundColor: "white",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 14,
    },
    chipSelected: {
        backgroundColor: "#111",
        borderColor: "#111",
    },
    chipText: {
        fontWeight: "900",
        color: "#111",
    },
    chipTextSelected: {
        color: "white",
    },
    chipSubText: {
        marginTop: 4,
        opacity: 0.68,
        fontSize: 12,
        fontWeight: "700",
        color: "#111",
    },
    chipSubTextSelected: {
        color: "white",
        opacity: 0.88,
    },

    phaseBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        marginTop: 2,
    },
    phaseBadgeText: {
        fontWeight: "900",
    },

    slotLabel: {
        marginTop: 10,
        opacity: 0.8,
    },
    slotValue: {
        fontWeight: "900",
        color: "#111",
    },

    phaseRow: {
        marginTop: 14,
        gap: 10,
    },
    phaseChip: {
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: "white",
    },
    phaseChipSelected: {
        borderColor: "#111",
        backgroundColor: "#111",
    },
    phaseChipDone: {
        borderColor: "#c7d7c7",
    },
    phaseChipText: {
        fontWeight: "900",
        color: "#111",
    },
    phaseChipTextSelected: {
        color: "white",
    },
    phaseChipDoneText: {
        marginTop: 4,
        fontSize: 12,
        opacity: 0.7,
        fontWeight: "700",
    },

    input: {
        marginTop: 10,
        minHeight: 90,
        textAlignVertical: "top",
        borderWidth: 1,
        borderColor: "#e5e7eb",
        borderRadius: 14,
        backgroundColor: "white",
        paddingHorizontal: 12,
        paddingVertical: 12,
    },

    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 8,
        gap: 12,
    },
    rowLabel: {
        opacity: 0.72,
        fontWeight: "800",
        flex: 1,
    },
    valueText: {
        fontWeight: "900",
        color: "#111",
    },

    actionRow: {
        marginTop: 18,
        flexDirection: "row",
        gap: 10,
    },
    primaryBtn: {
        flex: 1,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnWide: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {
        color: "white",
        fontWeight: "900",
    },

    secondaryBtn: {
        width: 130,
        borderWidth: 1,
        borderColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
        backgroundColor: "white",
    },
    secondaryBtnText: {
        fontWeight: "900",
        color: "#111",
    },

    btnDisabled: {
        opacity: 0.5,
    },

    footerHint: {
        marginTop: 10,
        textAlign: "center",
        opacity: 0.68,
    },
});