// src/screens/Activities/Activity4/A4MeasurementsScreen.tsx
import React, {useEffect, useMemo, useRef, useState} from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";

import {
    getActivity4RunDraft,
    upsertActivity4Measurement,
    type Activity4RunDraft,
} from "../../../store/activity4RunDraftStore";

import {startEarthquakeMeasurement} from "../../../services/activity4PhysicsService";

type Props = NativeStackScreenProps<AppStackParamList, "A4Measurements">;

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function toNumberOrUndefined(raw: string): number | undefined {
    const t = raw.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
}

function pickFinalScore(args: {
    sensorScore?: number;
    manualDeg?: number;
    manualCm?: number;
}): { finalScore: number; method: "sensor" | "manual_deg" | "manual_cm" } | null {
    const {sensorScore, manualDeg, manualCm} = args;

    if (isFiniteNumber(sensorScore)) {
        return {finalScore: sensorScore, method: "sensor"};
    }
    if (isFiniteNumber(manualDeg)) {
        return {finalScore: manualDeg, method: "manual_deg"};
    }
    if (isFiniteNumber(manualCm)) {
        return {finalScore: manualCm, method: "manual_cm"};
    }
    return null;
}

export default function A4MeasurementsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);

    const [runningIndex, setRunningIndex] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // countdown UI
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // local manual input buffers (don’t write to store until Save pressed)
    const [manualDegByDesign, setManualDegByDesign] = useState<Record<number, string>>({});
    const [manualCmByDesign, setManualCmByDesign] = useState<Record<number, string>>({});

    useEffect(() => {
        if (!user) return;

        const d = getActivity4RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Please restart Activity 4.");
            return;
        }

        // Prediction gating (FR-A4-05)
        if (typeof d.prediction?.predictedBestDesignIndex !== "number") {
            Alert.alert("Prediction required", "Please complete prediction first.", [
                {
                    text: "Go to Prediction",
                    onPress: () => navigation.replace("A4Prediction", {activityId, runId}),
                },
            ]);
            return;
        }

        setDraft(d);

        // preload manual inputs from saved measurements (if any)
        const nextDeg: Record<number, string> = {};
        const nextCm: Record<number, string> = {};
        for (const m of d.measurements ?? []) {
            if (typeof m.designIndex === "number") {
                if (isFiniteNumber((m as any).manualOutcomeDeg)) nextDeg[m.designIndex] = String((m as any).manualOutcomeDeg);
                if (isFiniteNumber((m as any).manualOutcomeCm)) nextCm[m.designIndex] = String((m as any).manualOutcomeCm);
            }
        }
        setManualDegByDesign(nextDeg);
        setManualCmByDesign(nextCm);
    }, [activityId, navigation, runId, user]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
        };
    }, []);

    const completedCount = useMemo(() => {
        if (!draft) return 0;

        // “Completed” means we have a finalScore stored (sensor or manual)
        return (draft.measurements ?? []).filter((m) => isFiniteNumber((m as any).finalScore)).length;
    }, [draft]);

    const designCount = draft?.session?.designCount ?? draft?.session?.designs?.length ?? 0;
    const durationSec = draft?.session?.vibrationDurationSec ?? 10;

    function startCountdown(totalSec: number) {
        if (timerRef.current) clearInterval(timerRef.current);

        const endAt = Date.now() + totalSec * 1000;
        setSecondsLeft(totalSec);

        timerRef.current = setInterval(() => {
            const remain = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
            setSecondsLeft(remain);
            if (remain <= 0) {
                if (timerRef.current) clearInterval(timerRef.current);
                timerRef.current = null;
                setSecondsLeft(null);
            }
        }, 200);
    }

    function measurementForDesign(d: Activity4RunDraft, designIndex: number) {
        return (d.measurements ?? []).find((m) => m.designIndex === designIndex) ?? null;
    }

    async function runTestForDesign(designIndex: number) {
        if (!draft) return;

        try {
            setRunningIndex(designIndex);
            setSubmitting(true);

            startCountdown(durationSec);

            const result = await startEarthquakeMeasurement({
                durationMs: durationSec * 1000,
                sampleIntervalMs: 50,
                vibrate: true,
            });

            // Sensor movement score (lower is better)
            const sensorScore = result.movementScore;

            // manual values (optional validation)
            const manualDeg = toNumberOrUndefined(manualDegByDesign[designIndex] ?? "");
            const manualCm = toNumberOrUndefined(manualCmByDesign[designIndex] ?? "");

            const final = pickFinalScore({
                sensorScore,
                manualDeg,
                manualCm,
            });

            // If sensor exists, final should be sensor
            const validationDelta =
                isFiniteNumber(sensorScore) && isFiniteNumber(manualDeg)
                    ? Math.abs(sensorScore - manualDeg)
                    : undefined;

            const updated = upsertActivity4Measurement(runId, {
                designIndex,

                // raw sensor samples (optional – you already store magnitudeSamples)
                magnitudeSamples: result.samples.map((s) => Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z)),

                // sensor
                movementScore: sensorScore,

                // manual (saved too)
                manualOutcomeDeg: manualDeg,
                manualOutcomeCm: manualCm,

                // final score + method (leaderboard uses finalScore)
                finalScore: final?.finalScore,
                finalMethod: final?.method,

                // optional validation metadata
                validation: validationDelta != null ? {
                    delta: validationDelta,
                    flagged: validationDelta > 5
                } : undefined,
            } as any);

            setDraft(updated);

            Alert.alert(
                "Test Completed ✅",
                `Sensor score: ${sensorScore.toFixed(2)}\nFinal score: ${final?.finalScore?.toFixed?.(2) ?? sensorScore.toFixed(2)}\n(Lower is better)`
            );
        } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Failed to run vibration test.");
        } finally {
            setRunningIndex(null);
            setSubmitting(false);
            setSecondsLeft(null);
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }

    function saveManualForDesign(designIndex: number) {
        if (!draft) return;

        const manualDeg = toNumberOrUndefined(manualDegByDesign[designIndex] ?? "");
        const manualCm = toNumberOrUndefined(manualCmByDesign[designIndex] ?? "");

        const existing = measurementForDesign(draft, designIndex);
        const sensorScore = existing ? (existing as any).movementScore : undefined;

        const final = pickFinalScore({
            sensorScore,
            manualDeg,
            manualCm,
        });

        if (!final) {
            Alert.alert(
                "Missing value",
                "Enter a manual outcome (degrees or cm) OR run the sensor test to generate a score."
            );
            return;
        }

        const validationDelta =
            isFiniteNumber(sensorScore) && isFiniteNumber(manualDeg) ? Math.abs(sensorScore - manualDeg) : undefined;

        const updated = upsertActivity4Measurement(runId, {
            designIndex,
            manualOutcomeDeg: manualDeg,
            manualOutcomeCm: manualCm,
            finalScore: final.finalScore,
            finalMethod: final.method,
            validation: validationDelta != null ? {delta: validationDelta, flagged: validationDelta > 5} : undefined,
        } as any);

        setDraft(updated);

        Alert.alert(
            "Saved ✅",
            `Final score: ${final.finalScore.toFixed(2)} (${final.method === "sensor" ? "sensor" : "manual"})`
        );
    }

    function goToResults() {
        if (!draft) return;

        if (completedCount < designCount) {
            Alert.alert(
                "Incomplete",
                `You have completed ${completedCount}/${designCount} designs.\n\nTip: A design is "completed" when it has a Final Score (sensor or manual).`
            );
            return;
        }

        navigation.navigate("A4Results", {activityId, runId});
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

    return (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Measurements</Text>
            <Text style={styles.sub}>
                Place the phone at the center of the structure. Each run vibrates for{" "}
                <Text style={{fontWeight: "900"}}>{durationSec}s</Text>.
            </Text>

            {secondsLeft != null ? (
                <View style={styles.runningBanner}>
                    <Text style={styles.runningTitle}>Recording…</Text>
                    <Text style={styles.runningText}>{secondsLeft}s left</Text>
                </View>
            ) : null}

            <View style={styles.card}>
                <Text style={styles.cardTitle}>How to test (fair measurement)</Text>
                <Text style={styles.body}>• Phone centered on platform</Text>
                <Text style={styles.body}>• Do not touch the table during test</Text>
                <Text style={styles.body}>• Keep the same phone orientation each time</Text>
                <Text style={styles.body}>• Lower score = better vibration resistance</Text>
            </View>

            {(draft.session.designs ?? []).map((design, index) => {
                const m = measurementForDesign(draft, index) as any;

                const sensorScore = m?.movementScore;
                const finalScore = m?.finalScore;
                const method = m?.finalMethod;

                const hasSensor = isFiniteNumber(sensorScore);
                const hasFinal = isFiniteNumber(finalScore);

                const isRunning = runningIndex === index;

                // optional design details (folds/pillars if your store adds them later)
                const folds = isFiniteNumber(design?.foldCount) ? design.foldCount : null;
                const pillars = isFiniteNumber(design?.pillarCount) ? design.pillarCount : null;

                const degRaw = manualDegByDesign[index] ?? "";
                const cmRaw = manualCmByDesign[index] ?? "";

                const delta = m?.validation?.delta;
                const flagged = m?.validation?.flagged === true;

                return (
                    <View key={index} style={styles.designCard}>
                        <View style={{flex: 1}}>
                            <Text style={styles.designTitle}>{design?.name ?? `Design ${index + 1}`}</Text>

                            <Text style={styles.designMeta}>
                                {folds != null || pillars != null
                                    ? `Folds: ${folds ?? "—"} • Pillars: ${pillars ?? "—"}`
                                    : "No design details yet (optional)"}
                            </Text>

                            <View style={{marginTop: 10, gap: 6}}>
                                <Row label="Sensor score">
                                    <Text style={styles.valueText}>{hasSensor ? sensorScore.toFixed(2) : "—"}</Text>
                                </Row>

                                <Row label="Final score (leaderboard)">
                                    <Text style={styles.valueText}>
                                        {hasFinal ? `${finalScore.toFixed(2)} (${method ?? "—"})` : "—"}
                                    </Text>
                                </Row>

                                {delta != null ? (
                                    <Text style={[styles.deltaText, flagged && {color: "#b00020"}]}>
                                        Manual vs sensor
                                        Δ: {Number(delta).toFixed(2)} {flagged ? " (check placement)" : ""}
                                    </Text>
                                ) : null}
                            </View>

                            {/* Manual fallback / validation */}
                            <View style={styles.manualBox}>
                                <Text style={styles.manualTitle}>
                                    Manual outcome (optional validation; required if sensor missing)
                                </Text>

                                <View style={styles.manualRow}>
                                    <View style={{flex: 1}}>
                                        <Text style={styles.manualLabel}>Outcome (degrees)</Text>
                                        <TextInput
                                            value={degRaw}
                                            onChangeText={(t) =>
                                                setManualDegByDesign((p) => ({
                                                    ...p,
                                                    [index]: t.replace(/[^0-9.\-]/g, "")
                                                }))
                                            }
                                            placeholder="e.g. 4"
                                            keyboardType="decimal-pad"
                                            style={styles.input}
                                        />
                                    </View>

                                    <View style={{width: 10}}/>

                                    <View style={{flex: 1}}>
                                        <Text style={styles.manualLabel}>Outcome (cm)</Text>
                                        <TextInput
                                            value={cmRaw}
                                            onChangeText={(t) =>
                                                setManualCmByDesign((p) => ({
                                                    ...p,
                                                    [index]: t.replace(/[^0-9.\-]/g, "")
                                                }))
                                            }
                                            placeholder="e.g. 1"
                                            keyboardType="decimal-pad"
                                            style={styles.input}
                                        />
                                    </View>
                                </View>

                                <Pressable
                                    style={({pressed}) => [
                                        styles.saveBtn,
                                        pressed && {opacity: 0.7},
                                    ]}
                                    onPress={() => saveManualForDesign(index)}
                                    disabled={submitting}
                                >
                                    <Text style={styles.saveBtnText}>Save Manual Outcome</Text>
                                </Pressable>
                            </View>
                        </View>

                        <View style={{width: 12}}/>

                        <Pressable
                            style={[
                                styles.runBtn,
                                isRunning && {opacity: 0.7},
                            ]}
                            onPress={() => runTestForDesign(index)}
                            disabled={submitting}
                        >
                            {isRunning ? (
                                <ActivityIndicator color="white"/>
                            ) : (
                                <Text style={styles.runBtnText}>{hasSensor ? "Retest" : "Start"}</Text>
                            )}
                        </Pressable>
                    </View>
                );
            })}

            <Pressable style={[styles.primaryBtn, submitting && {opacity: 0.7}]} onPress={goToResults}
                       disabled={submitting}>
                <Text style={styles.primaryBtnText}>Continue to Results</Text>
            </Pressable>

            <View style={{height: 40}}/>
        </ScrollView>
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
    container: {padding: 20},
    center: {flex: 1, justifyContent: "center", alignItems: "center"},

    title: {fontSize: 26, fontWeight: "900"},
    sub: {marginTop: 6, opacity: 0.75, lineHeight: 18},

    runningBanner: {
        marginTop: 12,
        borderRadius: 14,
        padding: 12,
        backgroundColor: "#111",
    },
    runningTitle: {color: "white", fontWeight: "900", fontSize: 14},
    runningText: {color: "white", opacity: 0.85, marginTop: 4},

    card: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {fontWeight: "900"},
    body: {marginTop: 6, lineHeight: 18, opacity: 0.9},

    designCard: {
        marginTop: 14,
        padding: 14,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 14,
        flexDirection: "row",
        alignItems: "flex-start",
        backgroundColor: "white",
    },

    designTitle: {fontWeight: "900", fontSize: 16},
    designMeta: {marginTop: 6, opacity: 0.7},

    row: {flexDirection: "row", justifyContent: "space-between", alignItems: "center"},
    rowLabel: {opacity: 0.7, fontWeight: "800"},
    valueText: {fontWeight: "900"},

    deltaText: {marginTop: 8, opacity: 0.9, fontWeight: "800"},

    manualBox: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 12,
        padding: 12,
    },
    manualTitle: {fontWeight: "900"},
    manualRow: {marginTop: 10, flexDirection: "row"},
    manualLabel: {fontWeight: "800", opacity: 0.8},

    input: {
        marginTop: 6,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 12,
        backgroundColor: "white",
        paddingVertical: 10,
        paddingHorizontal: 12,
    },

    saveBtn: {
        marginTop: 10,
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#111",
        backgroundColor: "white",
    },
    saveBtnText: {fontWeight: "900"},

    runBtn: {
        backgroundColor: "#111",
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 12,
        alignSelf: "flex-start",
    },
    runBtnText: {color: "white", fontWeight: "900"},

    primaryBtn: {
        marginTop: 20,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900"},
});