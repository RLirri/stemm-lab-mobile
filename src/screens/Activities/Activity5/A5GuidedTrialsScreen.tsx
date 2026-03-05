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
    View,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";
import * as Device from "expo-device";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";

import {
    getActivity5RunDraft,
    upsertActivity5Trial,
    validateA5Prediction,
    type Activity5RunDraft,
    type A5MovementSpec,
    type A5TrialMode,
    type A5AccelDataset,
} from "../../../store/activity5RunDraftStore";

import {startMovementTrial} from "../../../services/activity5BiomechanicsService";

type Props = NativeStackScreenProps<AppStackParamList, "A5GuidedTrials">;

/* =========================================================
   Helpers
========================================================= */

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function now() {
    return Date.now();
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function platformTag(): "ios" | "android" | "unknown" {
    return Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "unknown";
}

function osVersion(): string | undefined {
    return Platform.Version != null ? String(Platform.Version) : undefined;
}

function deviceModel(): string | undefined {
    return Device.modelName ?? Device.modelId ?? undefined;
}

/**
 * Map service samples {tMs,x,y,z} -> store samples {tMs,ax,ay,az}
 */
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
    return run.session.participants.find((p) => p.id === pid)?.name ?? "—";
}

/* =========================================================
   Screen
========================================================= */

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

    // Timer refs only (service owns accelerometer subscription)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!user) return;

        const d = getActivity5RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Please restart Activity 5.", [
                {text: "OK", onPress: () => navigation.replace("A5SessionSetup", {activityId})},
            ]);
            return;
        }

        // Prediction gating (FR-A5-07)
        const predErr = validateA5Prediction(d);
        if (predErr) {
            Alert.alert("Prediction required", predErr, [
                {text: "Go to Prediction", onPress: () => navigation.replace("A5Prediction", {activityId, runId})},
            ]);
            return;
        }

        setDraft(d);

        // default participant selection
        const first = d.session.participants?.[0]?.id;
        setSelectedParticipantId(first ?? null);
    }, [activityId, navigation, runId, user]);

    useEffect(() => {
        return () => {
            try {
                if (timerRef.current) clearInterval(timerRef.current);
            } catch {
            }
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
        const modes: A5TrialMode[] = feedbackEnabled ? ["baseline", "feedback"] : ["baseline"];
        const total = (movements.length || 0) * modes.length;

        let done = 0;
        if (pid) {
            for (const mv of movements) {
                for (const mode of modes) {
                    if (completed.has(key(pid, mv.type, mode))) done++;
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

    async function runTrial(args: { participantId: string; movement: A5MovementSpec; mode: A5TrialMode }) {
        if (!draft) return;
        if (isBusy()) return;

        // enforce gating (robust)
        const predErr = validateA5Prediction(draft);
        if (predErr) {
            Alert.alert("Prediction required", predErr, [
                {text: "Go to Prediction", onPress: () => navigation.replace("A5Prediction", {activityId, runId})},
            ]);
            return;
        }

        if (!args.participantId) {
            Alert.alert("Select participant", "Please select a participant before starting a trial.");
            return;
        }

        const durationSec = clampInt(args.movement.durationSec, 10, 60);
        const durationMs = durationSec * 1000;

        // UI lock + banner
        setRunning({
            participantId: args.participantId,
            movementType: args.movement.type,
            mode: args.mode,
            movementTitle: args.movement.title,
            targetDurationSec: durationSec,
        });

        try {
            // 1) countdown (3..1)
            clearTimers();
            for (let c = 3; c >= 1; c--) {
                setCountdown(c);
                await sleep(800);
            }
            setCountdown(null);

            // 2) seconds-left UI
            const endAt = now() + durationMs;
            setSecondsLeft(durationSec);

            timerRef.current = setInterval(() => {
                const remain = Math.max(0, Math.ceil((endAt - now()) / 1000));
                setSecondsLeft(remain);
                if (remain <= 0) {
                    try {
                        if (timerRef.current) clearInterval(timerRef.current);
                    } catch {
                    }
                    timerRef.current = null;
                    setSecondsLeft(null);
                }
            }, 200);

            // 3) Run trial via service (single source of truth)
            const startedAt = now();
            const trialResult = await startMovementTrial({
                durationMs,
                samplingHz,
                feedbackPolicy:
                    args.mode === "feedback" && feedbackEnabled
                        ? {
                            enabled: true,
                            // tune later after real device calibration
                            smoothnessAlertThreshold: 0.08,
                            minCueIntervalMs: 800,
                            cueVibrationMs: 120,
                            liveWindowMs: 500,
                        }
                        : {enabled: false},
            });

            clearTimers();

            // 4) Store dataset+metrics in draft store (matches FR-A5-02/03/10)
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

            Alert.alert(
                "Trial saved ✅",
                [
                    `Participant: ${safeParticipantName(updated, args.participantId)}`,
                    `Movement: ${args.movement.title}`,
                    `Mode: ${args.mode}`,
                    `Duration: ${trialResult.metrics.durationSec.toFixed(1)}s`,
                    `Displacement (approx): ${trialResult.metrics.displacementMagnitudeCm.toFixed(2)} cm`,
                    `Smoothness index: ${trialResult.metrics.smoothnessIndex.toFixed(3)} (lower = smoother)`,
                ].join("\n")
            );
        } catch (e: any) {
            clearTimers();
            Alert.alert("Error", e?.message ?? "Failed to record trial.");
        } finally {
            setRunning(null);
        }
    }

    function goToResults() {
        navigation.navigate("A5Results", {activityId, runId});
    }

    if (!user) return null;

    if (!draft) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10, opacity: 0.7}}>Loading…</Text>
            </View>
        );
    }

    const selectedName =
        participants.find((p) => p.id === selectedParticipantId)?.name ?? "Select participant";

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Guided Trials</Text>
                <Text style={styles.sub}>
                    Hold the phone firmly. Follow the guided movement. Baseline = no guidance. Feedback = live cues to
                    move smoother.
                </Text>

                {/* Running banner */}
                {countdown != null ? (
                    <View style={styles.runningBanner}>
                        <Text style={styles.runningTitle}>Get Ready…</Text>
                        <Text style={styles.runningText}>{countdown}</Text>
                    </View>
                ) : null}

                {secondsLeft != null && running ? (
                    <View style={styles.runningBanner}>
                        <Text style={styles.runningTitle}>Recording…</Text>
                        <Text style={styles.runningText}>
                            {running.movementTitle} • {running.mode.toUpperCase()} • {secondsLeft}s left
                        </Text>
                        {running.mode === "feedback" && feedbackEnabled ? (
                            <Text style={[styles.runningText, {marginTop: 8}]}>
                                Feedback cues are enabled. Try to keep motion smooth.
                            </Text>
                        ) : null}
                    </View>
                ) : null}

                {/* Participant picker */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Participant</Text>
                    <Text style={styles.help}>Select who is performing the movement trial.</Text>

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
                                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{p.name}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.note}>Selected: {selectedName}</Text>

                    {progress ? (
                        <Text style={styles.note}>
                            Progress (selected participant):{" "}
                            <Text style={{fontWeight: "900"}}>
                                {progress.done}/{progress.total}
                            </Text>
                        </Text>
                    ) : null}
                </View>

                {/* How to run */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>How to measure (fair test)</Text>
                    <Text style={styles.body}>• Hold the phone the same way each time</Text>
                    <Text style={styles.body}>• Move slowly and smoothly</Text>
                    <Text style={styles.body}>• Lower smoothness index = better coordination</Text>
                    <Text style={styles.body}>• Record baseline first, then feedback to see improvement</Text>
                </View>

                {/* Movements list */}
                {movements.map((mv) => {
                    const pid = selectedParticipantId ?? participants[0]?.id ?? "";
                    const baseline = pid ? trialFor(pid, mv.type, "baseline") : null;
                    const feedback = pid ? trialFor(pid, mv.type, "feedback") : null;

                    const hasBaseline = !!baseline?.metrics;
                    const hasFeedback = !!feedback?.metrics;

                    return (
                        <View key={mv.type} style={styles.movementCard}>
                            <Text style={styles.movementTitle}>{mv.title}</Text>
                            <Text style={styles.movementMeta}>
                                Duration guidance: <Text style={{fontWeight: "900"}}>{mv.durationSec}s</Text>
                            </Text>
                            <Text style={styles.body}>{mv.postureGuidance}</Text>

                            <View style={{marginTop: 10, gap: 6}}>
                                <Row label="Baseline smoothness">
                                    <Text style={styles.valueText}>
                                        {hasBaseline ? baseline!.metrics!.smoothnessIndex.toFixed(3) : "—"}
                                    </Text>
                                </Row>
                                <Row label="Feedback smoothness">
                                    <Text style={styles.valueText}>
                                        {hasFeedback ? feedback!.metrics!.smoothnessIndex.toFixed(3) : "—"}
                                    </Text>
                                </Row>
                                <Row label="Displacement (baseline)">
                                    <Text style={styles.valueText}>
                                        {hasBaseline ? `${baseline!.metrics!.displacementMagnitudeCm.toFixed(2)} cm` : "—"}
                                    </Text>
                                </Row>
                            </View>

                            <View style={styles.btnRow}>
                                <Pressable
                                    style={[styles.secondaryBtn, isBusy() && styles.btnDisabled]}
                                    disabled={isBusy()}
                                    onPress={() => runTrial({participantId: pid, movement: mv, mode: "baseline"})}
                                >
                                    <Text style={styles.secondaryBtnText}>
                                        {hasBaseline ? "Retake Baseline" : "Start Baseline"}
                                    </Text>
                                </Pressable>

                                <Pressable
                                    style={[styles.primaryBtn, (!feedbackEnabled || isBusy()) && styles.btnDisabled]}
                                    disabled={!feedbackEnabled || isBusy()}
                                    onPress={() => runTrial({participantId: pid, movement: mv, mode: "feedback"})}
                                >
                                    <Text style={styles.primaryBtnText}>
                                        {hasFeedback ? "Retake Feedback" : "Start Feedback"}
                                    </Text>
                                </Pressable>
                            </View>

                            {!feedbackEnabled ? (
                                <Text style={styles.muted}>Feedback mode is disabled in Session Setup.</Text>
                            ) : null}
                        </View>
                    );
                })}

                <Pressable
                    style={[styles.primaryBtnWide, isBusy() && styles.btnDisabled]}
                    disabled={isBusy()}
                    onPress={goToResults}
                >
                    <Text style={styles.primaryBtnText}>View Results</Text>
                </Pressable>

                <View style={{height: 40}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

/* =========================================================
   Small UI components
========================================================= */

function Row(props: { label: string; children: React.ReactNode }) {
    return (
        <View style={{flexDirection: "row", justifyContent: "space-between", alignItems: "center"}}>
            <Text style={{opacity: 0.75}}>{props.label}</Text>
            {props.children}
        </View>
    );
}

/* =========================================================
   Styles
========================================================= */

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20, backgroundColor: "#fff"},
    center: {flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff"},

    title: {fontSize: 24, fontWeight: "900"},
    sub: {marginTop: 8, opacity: 0.7, lineHeight: 20},

    card: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {fontSize: 16, fontWeight: "900", marginBottom: 8},
    help: {opacity: 0.75, lineHeight: 18},
    body: {marginTop: 4, opacity: 0.85, lineHeight: 18},
    muted: {marginTop: 8, opacity: 0.6},

    note: {marginTop: 10, opacity: 0.7},

    chipWrap: {marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10},
    chip: {
        borderWidth: 1,
        borderColor: "#ddd",
        backgroundColor: "white",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
    },
    chipSelected: {borderColor: "#111", backgroundColor: "#111"},
    chipText: {fontWeight: "900", opacity: 0.85},
    chipTextSelected: {color: "white", opacity: 1},

    movementCard: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "white",
        borderRadius: 14,
        padding: 14,
    },
    movementTitle: {fontSize: 16, fontWeight: "900"},
    movementMeta: {marginTop: 6, opacity: 0.7},

    btnRow: {marginTop: 12, flexDirection: "row", gap: 10},
    secondaryBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#111",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor: "white",
    },
    secondaryBtnText: {fontWeight: "900"},
    primaryBtn: {flex: 1, backgroundColor: "#111", paddingVertical: 12, borderRadius: 12, alignItems: "center"},
    primaryBtnWide: {
        marginTop: 18,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center"
    },
    primaryBtnText: {color: "white", fontWeight: "900"},
    valueText: {fontWeight: "900"},

    btnDisabled: {opacity: 0.5},

    runningBanner: {marginTop: 14, padding: 14, borderRadius: 14, backgroundColor: "#111"},
    runningTitle: {color: "white", fontWeight: "900", fontSize: 16},
    runningText: {color: "white", marginTop: 6, opacity: 0.9},
});