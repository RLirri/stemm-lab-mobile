import React, {useEffect, useMemo, useRef, useState} from "react";
import {
    Alert,
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    Platform,
} from "react-native";
import * as Location from "expo-location";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";

import {
    addA2Measurement,
    getActivity2RunDraft,
    removeA2Measurement,
    setA2Computed,
    updateA2Measurement,
    type Activity2RunDraft,
    type A2GpsPoint,
} from "../../../store/activity2RunDraftStore";

import {classifySoundRisk, isValidDbReading, scoreActivity2AverageDb} from "../../../services/scoringService";
import {measureSoundLevel} from "../../../services/microphoneService";

type Props = NativeStackScreenProps<AppStackParamList, "A2Measurement">;

type RecordUIState = {
    measurementId: string;
    startedAtMs: number;
    durationSec: number;
    countdownSec: number;
};

type GpsState =
    | { status: "disabled_in_session" }
    | { status: "unknown" }
    | { status: "denied" }
    | { status: "services_off" }
    | { status: "ready" };

function fmtGps(gps?: A2GpsPoint) {
    if (!gps) return "Not captured";
    const lat = Number.isFinite(gps.lat) ? gps.lat.toFixed(5) : "—";
    const lng = Number.isFinite(gps.lng) ? gps.lng.toFixed(5) : "—";
    const acc = typeof gps.accuracyM === "number" ? ` (±${Math.round(gps.accuracyM)}m)` : "";
    return `${lat}, ${lng}${acc}`;
}

function toFiniteOrUndefined(x: unknown): number | undefined {
    return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label = "timeout"): Promise<T> {
    let t: ReturnType<typeof setTimeout> | null = null;
    try {
        return await Promise.race([
            p,
            new Promise<T>((_, rej) => {
                t = setTimeout(() => rej(new Error(label)), ms);
            }),
        ]);
    } finally {
        if (t) clearTimeout(t);
    }
}

export default function A2MeasurementScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity2RunDraft | null>(null);

    // recording UI state
    const [recording, setRecording] = useState<RecordUIState | null>(null);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // GPS status (UX feedback)
    const [gpsState, setGpsState] = useState<GpsState>({status: "unknown"});

    // Manual input staging (so we don’t GPS-capture on every keystroke)
    const [manualDbById, setManualDbById] = useState<Record<string, string>>({});

    // ---------- load draft ----------
    useEffect(() => {
        if (!user) return;

        const d = getActivity2RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Please restart the activity.");
            navigation.replace("A2SessionSetup", {activityId});
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    function refreshDraft() {
        const d = getActivity2RunDraft(runId);
        if (d) setDraft(d);
    }

    const gpsEnabled = draft?.session?.gpsEnabled === true;

    // ---------- GPS readiness check ----------
    async function refreshGpsReadiness(): Promise<GpsState> {
        if (!gpsEnabled) {
            const s: GpsState = {status: "disabled_in_session"};
            setGpsState(s);
            return s;
        }

        // Services ON?
        try {
            const servicesOn = await Location.hasServicesEnabledAsync();
            if (!servicesOn) {
                const s: GpsState = {status: "services_off"};
                setGpsState(s);
                return s;
            }
        } catch {
            // If check fails, keep going and let permission step decide.
        }

        // Permission?
        try {
            const perm = await Location.getForegroundPermissionsAsync();
            if (!perm.granted) {
                const req = await Location.requestForegroundPermissionsAsync();
                if (!req.granted) {
                    const s: GpsState = {status: "denied"};
                    setGpsState(s);
                    return s;
                }
            }
        } catch {
            const s: GpsState = {status: "denied"};
            setGpsState(s);
            return s;
        }

        const s: GpsState = {status: "ready"};
        setGpsState(s);
        return s;
    }

    useEffect(() => {
        // When screen loads, check GPS state once for better UX
        void refreshGpsReadiness();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gpsEnabled]);

    async function getBestEffortLocation(): Promise<A2GpsPoint | undefined> {
        const ready = await refreshGpsReadiness();
        if (ready.status !== "ready") return undefined;

        // 1) Try current position with timeout
        try {
            const loc = await withTimeout(
                Location.getCurrentPositionAsync({accuracy: Location.Accuracy.Balanced}),
                4500,
                "location_timeout"
            );

            const lat = toFiniteOrUndefined(loc.coords.latitude);
            const lng = toFiniteOrUndefined(loc.coords.longitude);
            if (lat == null || lng == null) return undefined;

            return {
                lat,
                lng,
                accuracyM: toFiniteOrUndefined(loc.coords.accuracy),
            };
        } catch {
            // ignore and fallback to last known
        }

        // 2) Fallback: last known
        try {
            const last = await Location.getLastKnownPositionAsync();
            if (!last) return undefined;

            const lat = toFiniteOrUndefined(last.coords.latitude);
            const lng = toFiniteOrUndefined(last.coords.longitude);
            if (lat == null || lng == null) return undefined;

            return {
                lat,
                lng,
                accuracyM: toFiniteOrUndefined(last.coords.accuracy),
            };
        } catch {
            return undefined;
        }
    }

    // ---------- draft mutations ----------
    function onAddAction() {
        addA2Measurement(runId, "New action");
        refreshDraft();
    }

    function onRemove(measurementId: string) {
        if (recording?.measurementId === measurementId) return;
        removeA2Measurement(runId, measurementId);
        refreshDraft();
    }

    function applyDbToMeasurement(params: {
        measurementId: string;
        dbAvg: number;
        dbMax?: number;
        durationSec: number;
        gps?: A2GpsPoint;
    }) {
        const {measurementId, dbAvg, dbMax, durationSec, gps} = params;

        const valid = isValidDbReading(dbAvg, durationSec);
        const risk = valid ? classifySoundRisk(dbAvg) : undefined;

        updateA2Measurement(runId, measurementId, {
            dbAvg: valid ? dbAvg : undefined,
            dbMax: valid && typeof dbMax === "number" && Number.isFinite(dbMax) ? dbMax : undefined,
            durationSec,
            isValid: valid,
            riskCategory: risk?.category,
            riskLabel: risk?.label,
            recordedAt: Date.now(),
            gps,
        });

        refreshDraft();
    }

    function clearCountdownTimer() {
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
        }
    }

    // ---------- recording ----------
    async function onRecord(measurementId: string) {
        if (!draft) return;
        if (recording) return;

        const durationSec = 3;

        try {
            const startedAtMs = Date.now();
            setRecording({measurementId, startedAtMs, durationSec, countdownSec: durationSec});

            clearCountdownTimer();
            countdownTimerRef.current = setInterval(() => {
                setRecording((prev) => {
                    if (!prev) return prev;
                    const elapsed = (Date.now() - prev.startedAtMs) / 1000;
                    const left = Math.max(0, Math.ceil(prev.durationSec - elapsed));
                    return {...prev, countdownSec: left};
                });
            }, 200);

            // Capture GPS first (best effort)
            const gps = await getBestEffortLocation();

            // Measure microphone
            const reading = await measureSoundLevel({
                durationSec,
                calibrationOffsetDb: 100,
            });

            applyDbToMeasurement({
                measurementId,
                dbAvg: reading.dbAvg,
                dbMax: reading.dbMax,
                durationSec: reading.durationSec,
                gps,
            });

            // If GPS expected but missing, inform user clearly
            if (gpsEnabled && !gps) {
                Alert.alert(
                    "GPS not captured",
                    "We recorded sound successfully, but location was not available. Make sure Location is ON and try “Retry GPS”."
                );
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed to record sound.";
            Alert.alert("Recording failed", msg);
        } finally {
            clearCountdownTimer();
            setRecording(null);
        }
    }

    async function onSaveManualDb(measurementId: string) {
        const raw = manualDbById[measurementId] ?? "";
        const n = Number(raw);

        if (!Number.isFinite(n)) {
            Alert.alert("Invalid dB", "Please enter a valid number (e.g. 72).");
            return;
        }

        const gps = await getBestEffortLocation();
        applyDbToMeasurement({measurementId, dbAvg: n, durationSec: 3, gps});

        if (gpsEnabled && !gps) {
            Alert.alert(
                "GPS not captured",
                "Saved dB, but location was not available. Turn on Location services and try “Retry GPS”."
            );
        }
    }

    async function onRetryGps(measurementId: string) {
        if (!draft) return;
        if (recording) return;

        const gps = await getBestEffortLocation();
        if (!gps) {
            const s = gpsState.status;
            const hint =
                s === "services_off"
                    ? "Location services are OFF."
                    : s === "denied"
                        ? "Location permission denied."
                        : "Location not available yet.";

            Alert.alert("Still no GPS", `${hint}\n\nEnable Location and try again.`);
            return;
        }

        updateA2Measurement(runId, measurementId, {gps});
        refreshDraft();
    }

    // ---------- derived info ----------
    const validCount = useMemo(() => draft?.actions.filter((a) => a.isValid).length ?? 0, [draft]);

    const gpsHint = useMemo(() => {
        if (!gpsEnabled) return "GPS is disabled in Session Setup.";
        if (gpsState.status === "services_off") return "Location services are OFF. Turn on Location on your phone.";
        if (gpsState.status === "denied") return "Location permission denied. Enable it in settings and retry.";
        if (gpsState.status === "ready") return "GPS will be attached automatically if available.";
        return "Checking GPS status…";
    }, [gpsEnabled, gpsState.status]);

    function onContinue() {
        if (!draft) return;

        const {score, validCount: vc} = scoreActivity2AverageDb(draft.actions);

        if (vc < 3) {
            Alert.alert("Minimum requirement", "You must record at least 3 valid measurements.");
            return;
        }

        setA2Computed(runId, {
            validCount: vc,
            avgDb: score,
            score,
            updatedAt: Date.now(),
        });

        navigation.navigate("A2Map", {activityId, runId});
    }

    useEffect(() => {
        return () => clearCountdownTimer();
    }, []);

    // ---------- render ----------
    if (!user) return null;

    if (!draft) {
        return (
            <View style={styles.center}>
                <Text style={{fontWeight: "900"}}>Loading draft…</Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Measurements</Text>
            <Text style={styles.sub}>
                Record at least <Text style={styles.bold}>3</Text> valid actions. {gpsHint}
            </Text>

            {gpsEnabled && gpsState.status !== "ready" ? (
                <View style={styles.warnCard}>
                    <Text style={styles.warnTitle}>GPS status</Text>
                    <Text style={styles.warnBody}>{gpsHint}</Text>
                    <Pressable style={styles.warnBtn} onPress={() => void refreshGpsReadiness()}>
                        <Text style={styles.warnBtnText}>Re-check GPS</Text>
                    </Pressable>
                </View>
            ) : null}

            {draft.actions.map((a) => {
                const busy = recording?.measurementId === a.id;
                const hasDb = typeof a.dbAvg === "number" && Number.isFinite(a.dbAvg);

                return (
                    <View key={a.id} style={styles.card}>
                        <Text style={styles.cardTitle}>Action</Text>

                        <TextInput
                            style={styles.input}
                            value={a.actionLabel}
                            onChangeText={(t) => {
                                updateA2Measurement(runId, a.id, {actionLabel: t});
                                refreshDraft();
                            }}
                            placeholder="e.g. Drop a book"
                            editable={!busy}
                        />

                        <View style={styles.rowBetween}>
                            <Text style={styles.label}>Microphone recording</Text>

                            <Pressable
                                style={[styles.primaryBtnSmall, busy && {opacity: 0.75}]}
                                onPress={() => void onRecord(a.id)}
                                disabled={busy}
                            >
                                {busy ? (
                                    <View style={styles.inlineRow}>
                                        <ActivityIndicator color="white"/>
                                        <Text style={styles.primaryBtnSmallText}>
                                            Recording… {recording?.countdownSec ?? 0}s
                                        </Text>
                                    </View>
                                ) : (
                                    <Text style={styles.primaryBtnSmallText}>Record (3s)</Text>
                                )}
                            </Pressable>
                        </View>

                        <Text style={styles.help}>
                            Tip: phone dB readings are approximate. Use the same device per team for fairness.
                        </Text>

                        <Text style={styles.label}>Manual dB (fallback)</Text>
                        <View style={styles.manualRow}>
                            <TextInput
                                style={[styles.input, {flex: 1, marginTop: 0}]}
                                keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
                                placeholder="Avg dB (e.g. 72)"
                                value={manualDbById[a.id] ?? ""}
                                onChangeText={(t) => setManualDbById((m) => ({...m, [a.id]: t}))}
                                editable={!busy}
                            />
                            <Pressable
                                style={[styles.secondaryBtnSmall, busy && {opacity: 0.6}]}
                                onPress={() => void onSaveManualDb(a.id)}
                                disabled={busy}
                            >
                                <Text style={styles.secondaryBtnSmallText}>Save</Text>
                            </Pressable>
                        </View>

                        <View style={styles.metaRow}>
                            <Text style={styles.metaK}>GPS</Text>
                            <Text style={styles.metaV}>{fmtGps(a.gps)}</Text>
                        </View>

                        {gpsEnabled ? (
                            <Pressable
                                style={[styles.linkBtn, busy && {opacity: 0.6}]}
                                onPress={() => void onRetryGps(a.id)}
                                disabled={busy}
                            >
                                <Text style={styles.linkBtnText}>Retry GPS for this action</Text>
                            </Pressable>
                        ) : null}

                        <View style={styles.metaRow}>
                            <Text style={styles.metaK}>Status</Text>
                            <Text style={styles.metaV}>
                                {a.isValid ? "Valid ✅" : hasDb ? "Invalid ❌" : "Not recorded"}
                            </Text>
                        </View>

                        {a.isValid ? (
                            <View style={styles.resultBox}>
                                <Text style={styles.resultTitle}>
                                    {a.dbAvg?.toFixed(1)} dB — {a.riskLabel ?? "Risk unknown"}
                                </Text>
                                {typeof a.dbMax === "number" ? (
                                    <Text style={styles.resultSub}>Max: {a.dbMax.toFixed(1)} dB</Text>
                                ) : null}
                            </View>
                        ) : null}

                        <Pressable
                            style={[styles.dangerBtn, busy && {opacity: 0.5}]}
                            onPress={() => onRemove(a.id)}
                            disabled={busy}
                        >
                            <Text style={styles.dangerBtnText}>Remove Action</Text>
                        </Pressable>
                    </View>
                );
            })}

            <Pressable style={styles.secondaryBtn} onPress={onAddAction} disabled={!!recording}>
                <Text style={styles.secondaryBtnText}>+ Add Action</Text>
            </Pressable>

            <Text style={styles.footer}>Valid measurements: {validCount} / 3 minimum</Text>

            <Pressable style={[styles.primaryBtn, !!recording && {opacity: 0.7}]} onPress={onContinue}
                       disabled={!!recording}>
                <Text style={styles.primaryBtnText}>Continue to Map</Text>
            </Pressable>

            <View style={{height: 30}}/>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20},
    center: {flex: 1, alignItems: "center", justifyContent: "center"},

    title: {fontSize: 26, fontWeight: "900", marginTop: 6},
    sub: {marginTop: 8, opacity: 0.75, lineHeight: 18},
    bold: {fontWeight: "900"},

    warnCard: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#111",
        backgroundColor: "white",
        borderRadius: 14,
        padding: 12,
    },
    warnTitle: {fontWeight: "900"},
    warnBody: {marginTop: 6, opacity: 0.85, lineHeight: 18},
    warnBtn: {
        marginTop: 10,
        backgroundColor: "#111",
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: "center",
    },
    warnBtnText: {color: "white", fontWeight: "900"},

    card: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {fontSize: 16, fontWeight: "900"},

    label: {marginTop: 12, fontWeight: "800"},
    help: {marginTop: 6, opacity: 0.7, lineHeight: 18},

    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === "ios" ? 12 : 10,
    },

    rowBetween: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12},
    inlineRow: {flexDirection: "row", alignItems: "center", gap: 8},

    manualRow: {marginTop: 8, flexDirection: "row", gap: 10, alignItems: "center"},
    secondaryBtnSmall: {
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        alignItems: "center",
    },
    secondaryBtnSmallText: {fontWeight: "900"},

    metaRow: {marginTop: 10, flexDirection: "row", justifyContent: "space-between", gap: 12},
    metaK: {fontWeight: "800", opacity: 0.9},
    metaV: {fontWeight: "800", opacity: 0.85, flexShrink: 1, textAlign: "right"},

    linkBtn: {marginTop: 8},
    linkBtnText: {fontWeight: "900", textDecorationLine: "underline", opacity: 0.85},

    resultBox: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    resultTitle: {fontWeight: "900"},
    resultSub: {marginTop: 4, opacity: 0.75, fontWeight: "700"},

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    primaryBtnSmall: {
        backgroundColor: "#111",
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        alignItems: "center",
    },
    primaryBtnSmallText: {color: "white", fontWeight: "900"},

    secondaryBtn: {
        marginTop: 14,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},

    dangerBtn: {
        marginTop: 12,
        backgroundColor: "#ffecec",
        borderWidth: 1,
        borderColor: "#ffbdbd",
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: "center",
    },
    dangerBtnText: {fontWeight: "900", color: "#b00020"},

    footer: {marginTop: 10, opacity: 0.7, lineHeight: 18},
});