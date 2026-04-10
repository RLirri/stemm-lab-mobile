import React, {useEffect, useMemo, useRef, useState} from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";

import {
    createActivity6RunDraft,
    discardActivity6RunDraft,
    getActivity6RunDraft,
    getLatestRecoverableActivity6RunDraft,
    hydrateActivity6RunDraftFromLocalDb,
    updateActivity6Participant,
    updateActivity6Session,
    validateA6Session,
    type Activity6RunDraft,
    type A6ParticipantDraft,
    type A6TracingPathType,
} from "../../../store/activity6RunDraftStore";

/* =========================================================
   Helpers
========================================================= */

function clampInt(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNum(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function digitsOnly(s: string) {
    return s.replace(/[^\d]/g, "");
}

function trimOrEmpty(s: string) {
    return s.trim();
}

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function formatGeoText(geo: Activity6RunDraft["session"]["geo"] | undefined): string {
    if (!geo) return "No coordinate saved yet";
    if (!isFiniteNumber(geo.lat) || !isFiniteNumber(geo.lng)) return "No coordinate saved yet";

    const accText = isFiniteNumber(geo.accuracyM) ? ` (±${Math.round(geo.accuracyM)}m)` : "";
    const timeText = isFiniteNumber(geo.capturedAt) ? ` • ${new Date(geo.capturedAt).toLocaleString()}` : "";
    return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${accText}${timeText}`;
}

async function requestGpsPermissionSafe(): Promise<"granted" | "denied"> {
    try {
        const Location = await import("expo-location");
        const res = await Location.requestForegroundPermissionsAsync();
        return res.status === "granted" ? "granted" : "denied";
    } catch {
        return "denied";
    }
}

async function getCurrentGeoSafe(): Promise<{ lat: number; lng: number; accuracyM?: number } | null> {
    try {
        const Location = await import("expo-location");

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) return null;

        const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });

        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const acc = pos?.coords?.accuracy ?? undefined;
        const accuracyM = typeof acc === "number" && Number.isFinite(acc) ? acc : undefined;

        return {lat, lng, accuracyM};
    } catch {
        return null;
    }
}

/* =========================================================
   Types
========================================================= */

type Props = NativeStackScreenProps<AppStackParamList, "A6SessionSetup">;

const PATH_OPTIONS: Array<{ label: string; value: A6TracingPathType }> = [
    {label: "Circle", value: "circle"},
    {label: "Wave", value: "wave"},
    {label: "Zigzag", value: "zigzag"},
    {label: "Figure-8", value: "figure8"},
];

/* =========================================================
   Screen
========================================================= */

export default function A6SessionSetupScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;
    const routeRunId = route.params.runId;

    const [draft, setDraft] = useState<Activity6RunDraft | null>(null);
    const [bootstrapping, setBootstrapping] = useState(true);

    const hasBootstrappedRef = useRef(false);

    // UI buffers
    const [sessionLabel, setSessionLabel] = useState("");
    const [participantCountRaw, setParticipantCountRaw] = useState("1");

    const [trialsPerHandRaw, setTrialsPerHandRaw] = useState("3");

    const [delayMinSecRaw, setDelayMinSecRaw] = useState("1.0");
    const [delayMaxSecRaw, setDelayMaxSecRaw] = useState("3.0");
    const [targetSizePxRaw, setTargetSizePxRaw] = useState("56");

    const [tracingPathType, setTracingPathType] = useState<A6TracingPathType>("circle");
    const [maxAllowedDeviationPxRaw, setMaxAllowedDeviationPxRaw] = useState("40");
    const [accuracyThresholdPctRaw, setAccuracyThresholdPctRaw] = useState("70");

    // GPS
    const [gpsEnabled, setGpsEnabled] = useState(true);
    const [gpsPermission, setGpsPermission] = useState<"unknown" | "granted" | "denied">("unknown");
    const [capturingGps, setCapturingGps] = useState(false);

    // participant add input
    const [newParticipantName, setNewParticipantName] = useState("");

    useEffect(() => {
        if (!user) return;
        if (hasBootstrappedRef.current) return;

        hasBootstrappedRef.current = true;
        const userId = user.uid;

        async function bootstrap() {
            try {
                setBootstrapping(true);

                if (routeRunId) {
                    const existing = getActivity6RunDraft(routeRunId);
                    if (existing) {
                        setDraft(existing);
                        return;
                    }

                    const hydrated = await hydrateActivity6RunDraftFromLocalDb(routeRunId);
                    if (hydrated) {
                        setDraft(hydrated);
                        navigation.setParams({runId: hydrated.runId});
                        return;
                    }

                    const recreated = createActivity6RunDraft({
                        activityId,
                        createdBy: userId,
                        gpsEnabled: true,
                        participantCount: 1,
                        trialsPerHand: 3,
                        target: {delayMinSec: 1.0, delayMaxSec: 3.0, targetSizePx: 56},
                        tracingPathType: "circle",
                        maxAllowedDeviationPx: 100,
                        accuracyThresholdPct: 60,
                    });
                    setDraft(recreated);
                    navigation.setParams({runId: recreated.runId});
                    return;
                }

                const recoverable = await getLatestRecoverableActivity6RunDraft({
                    activityId,
                    createdBy: userId,
                });

                if (recoverable) {
                    Alert.alert(
                        "Resume previous draft?",
                        "We found an unfinished Activity 6 draft. Would you like to continue it or start a new session?",
                        [
                            {
                                text: "Start New",
                                style: "destructive",
                                onPress: async () => {
                                    try {
                                        await discardActivity6RunDraft(recoverable.runId);
                                    } catch (error) {
                                        console.error("[A6SessionSetup] Failed to discard old draft", error);
                                    }

                                    const created = createActivity6RunDraft({
                                        activityId,
                                        createdBy: userId,
                                        gpsEnabled: true,
                                        participantCount: 1,
                                        trialsPerHand: 3,
                                        target: {delayMinSec: 1.0, delayMaxSec: 3.0, targetSizePx: 56},
                                        tracingPathType: "circle",
                                        maxAllowedDeviationPx: 100,
                                        accuracyThresholdPct: 60,
                                    });
                                    setDraft(created);
                                    navigation.setParams({runId: created.runId});
                                },
                            },
                            {
                                text: "Resume",
                                onPress: () => {
                                    setDraft(recoverable);
                                    navigation.setParams({runId: recoverable.runId});
                                },
                            },
                        ]
                    );
                    return;
                }

                const created = createActivity6RunDraft({
                    activityId,
                    createdBy: userId,
                    gpsEnabled: true,
                    participantCount: 1,
                    trialsPerHand: 3,
                    target: {delayMinSec: 1.0, delayMaxSec: 3.0, targetSizePx: 56},
                    tracingPathType: "circle",
                    maxAllowedDeviationPx: 100,
                    accuracyThresholdPct: 60,
                });
                setDraft(created);
                navigation.setParams({runId: created.runId});
            } catch (error) {
                console.error("[A6SessionSetup] Failed to bootstrap draft", error);

                const fallback = createActivity6RunDraft({
                    activityId,
                    createdBy: userId,
                    gpsEnabled: true,
                    participantCount: 1,
                    trialsPerHand: 3,
                    target: {delayMinSec: 1.0, delayMaxSec: 3.0, targetSizePx: 56},
                    tracingPathType: "circle",
                    maxAllowedDeviationPx: 100,
                    accuracyThresholdPct: 60,
                });
                setDraft(fallback);
                navigation.setParams({runId: fallback.runId});
            } finally {
                setBootstrapping(false);
            }
        }

        void bootstrap();
    }, [activityId, navigation, routeRunId, user]);

    useEffect(() => {
        if (!draft) return;

        setSessionLabel(draft.session.sessionLabel ?? "");
        setParticipantCountRaw(String(draft.session.participantCount ?? 1));

        setTrialsPerHandRaw(String(draft.session.trialsPerHand ?? 3));

        setDelayMinSecRaw(String(draft.session.target?.delayMinSec ?? 1.0));
        setDelayMaxSecRaw(String(draft.session.target?.delayMaxSec ?? 3.0));
        setTargetSizePxRaw(String(draft.session.target?.targetSizePx ?? 56));

        setTracingPathType(draft.session.tracingPathType ?? "circle");
        setMaxAllowedDeviationPxRaw(String(draft.session.maxAllowedDeviationPx ?? 40));
        setAccuracyThresholdPctRaw(String(draft.session.accuracyThresholdPct ?? 70));

        setGpsEnabled(Boolean(draft.session.gpsEnabled));
        setGpsPermission(draft.session.gpsPermission ?? "unknown");
    }, [draft]);

    const participants = draft?.session.participants ?? [];
    const geoCaptured = Boolean(draft?.session.geo && isFiniteNumber(draft?.session.geo.lat) && isFiniteNumber(draft?.session.geo.lng));

    const sessionError = useMemo(() => {
        if (!draft) return null;
        return validateA6Session(draft);
    }, [draft]);

    function persistSessionBase(): Activity6RunDraft | null {
        if (!draft) return null;

        const nextParticipantCount = clampInt(parseInt(digitsOnly(participantCountRaw || "1"), 10), 1, 6);
        const nextTrialsPerHand = clampInt(parseInt(digitsOnly(trialsPerHandRaw || "3"), 10), 1, 10);

        const minSec = clampNum(parseFloat(delayMinSecRaw || "1.0"), 0.5, 10);
        const maxSec = clampNum(parseFloat(delayMaxSecRaw || "3.0"), 0.5, 10);
        const fixedMax = Math.max(maxSec, minSec + 0.1);

        const targetSizePx = clampInt(parseInt(digitsOnly(targetSizePxRaw || "56"), 10), 24, 120);

        const maxDev = clampInt(parseInt(digitsOnly(maxAllowedDeviationPxRaw || "40"), 10), 10, 200);
        const accThreshold = clampInt(parseInt(digitsOnly(accuracyThresholdPctRaw || "70"), 10), 0, 100);

        const next = updateActivity6Session(draft.runId, {
            sessionLabel: trimOrEmpty(sessionLabel) || undefined,
            participantCount: nextParticipantCount,
            participants: draft.session.participants,
            trialsPerHand: nextTrialsPerHand,
            target: {
                delayMinSec: minSec,
                delayMaxSec: fixedMax,
                targetSizePx,
            },
            tracingPathType,
            maxAllowedDeviationPx: maxDev,
            accuracyThresholdPct: accThreshold,
            gpsEnabled,
            geo: gpsEnabled ? draft.session.geo : undefined,
            gpsPermission,
        });

        setDraft(next);
        return next;
    }

    function onRenameParticipant(participantId: string, name: string) {
        if (!draft) return;

        const next = updateActivity6Participant(draft.runId, participantId, {name});
        setDraft(next);
    }

    function onAddParticipant() {
        if (!draft) return;

        const name = trimOrEmpty(newParticipantName);
        if (!name) {
            Alert.alert("Missing name", "Enter a participant name first.");
            return;
        }

        const currentCount = draft.session.participantCount ?? participants.length ?? 1;
        if (currentCount >= 6) {
            Alert.alert("Limit reached", "Participant count cannot exceed 6.");
            return;
        }

        const afterCount = updateActivity6Session(draft.runId, {participantCount: currentCount + 1});

        const appended = afterCount.session.participants?.[afterCount.session.participants.length - 1];
        if (!appended?.id) {
            setDraft(afterCount);
            setNewParticipantName("");
            setParticipantCountRaw(String(afterCount.session.participantCount));
            return;
        }

        const afterRename = updateActivity6Participant(afterCount.runId, appended.id, {name});

        setDraft(afterRename);
        setParticipantCountRaw(String(afterRename.session.participantCount));
        setNewParticipantName("");
    }

    function onRemoveParticipant(participantId: string) {
        if (!draft) return;

        const currentCount = draft.session.participantCount ?? participants.length ?? 1;
        if (currentCount <= 1) {
            Alert.alert("Not allowed", "At least 1 participant is required.");
            return;
        }

        Alert.alert("Remove participant?", "This will remove the participant from the session.", [
            {text: "Cancel", style: "cancel"},
            {
                text: "Remove",
                style: "destructive",
                onPress: () => {
                    const filtered: A6ParticipantDraft[] = (draft.session.participants ?? []).filter(
                        (p) => p.id !== participantId
                    );

                    const next = updateActivity6Session(draft.runId, {
                        participantCount: currentCount - 1,
                        participants: filtered,
                    });

                    setDraft(next);
                    setParticipantCountRaw(String(next.session.participantCount));
                },
            },
        ]);
    }

    function onToggleGps(nextVal: boolean) {
        setGpsEnabled(nextVal);
        if (!draft) return;

        const next = updateActivity6Session(draft.runId, {
            gpsEnabled: nextVal,
            geo: nextVal ? draft.session.geo : undefined,
        });

        setDraft(next);
    }

    async function onCaptureGps() {
        if (!draft) return;

        if (!gpsEnabled) {
            Alert.alert("GPS disabled", "Enable GPS first to capture coordinates.");
            return;
        }

        try {
            setCapturingGps(true);

            let status = gpsPermission;
            if (status === "unknown" || status === "denied") {
                status = await requestGpsPermissionSafe();
                setGpsPermission(status);

                const nextPerm = updateActivity6Session(draft.runId, {gpsPermission: status});
                setDraft(nextPerm);
            }

            if (status !== "granted") {
                Alert.alert(
                    "Permission denied",
                    "Location permission is required for submission. Please enable it in device settings."
                );
                return;
            }

            const g = await getCurrentGeoSafe();
            if (!g) {
                Alert.alert(
                    "Location unavailable",
                    "Could not capture your location. Please ensure Location Services are ON and try again."
                );
                return;
            }

            const next = updateActivity6Session(draft.runId, {
                gpsEnabled: true,
                gpsPermission: "granted",
                geo: {
                    lat: g.lat,
                    lng: g.lng,
                    accuracyM: g.accuracyM,
                    capturedAt: Date.now(),
                },
            });

            setDraft(next);
            Alert.alert("Location captured ✅", "GPS coordinate has been saved for submission.");
        } finally {
            setCapturingGps(false);
        }
    }

    function onContinue() {
        if (!user || !draft) return;

        const persisted = persistSessionBase();
        if (!persisted) return;

        const err = validateA6Session(persisted);
        if (err) {
            Alert.alert("Check setup", err);
            return;
        }

        navigation.navigate("A6Prediction", {
            activityId,
            runId: persisted.runId,
        });
    }

    if (!user) return null;

    if (bootstrapping || !draft) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10, opacity: 0.7}}>Loading session…</Text>
                <Text style={{marginTop: 4, opacity: 0.6}}>Checking for unfinished session...</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={{flex: 1, backgroundColor: "#fff"}}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.title}>Session Setup</Text>
                <Text style={styles.sub}>
                    Configure participants, reaction trials, tracing difficulty, and GPS policy before starting.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Session</Text>

                    <Text style={styles.label}>Session label</Text>
                    <TextInput
                        value={sessionLabel}
                        onChangeText={setSessionLabel}
                        placeholder="e.g. Week 6 – Reaction Board"
                        style={styles.input}
                    />
                    <Text style={styles.note}>
                        Use a clear label so your team can find runs later.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Participants</Text>

                    <Text style={styles.help}>
                        You can run this as a team session. At least 1 participant is required.
                    </Text>

                    <Text style={styles.label}>Participant count (1–6)</Text>
                    <TextInput
                        value={participantCountRaw}
                        onChangeText={(t) => setParticipantCountRaw(digitsOnly(t))}
                        keyboardType="number-pad"
                        placeholder="e.g. 3"
                        style={styles.input}
                    />
                    <Text style={styles.note}>
                        Tip: you can also add/remove participants using the controls below.
                    </Text>

                    <View style={styles.addRow}>
                        <View style={{flex: 1}}>
                            <Text style={styles.label}>Add participant (name)</Text>
                            <TextInput
                                value={newParticipantName}
                                onChangeText={setNewParticipantName}
                                placeholder="e.g. Ruixin"
                                style={styles.input}
                            />
                        </View>
                        <Pressable style={styles.smallBtn} onPress={onAddParticipant}>
                            <Text style={styles.smallBtnText}>Add</Text>
                        </Pressable>
                    </View>

                    {participants.length === 0 ? (
                        <Text style={styles.muted}>No participants initialized.</Text>
                    ) : (
                        <View style={{marginTop: 10}}>
                            {participants.map((p, idx) => (
                                <View key={p.id} style={styles.participantCard}>
                                    <Text style={styles.participantHeader}>Participant {idx + 1}</Text>

                                    <TextInput
                                        value={p.name}
                                        onChangeText={(t) => onRenameParticipant(p.id, t)}
                                        placeholder={`Participant ${idx + 1}`}
                                        style={styles.input}
                                    />

                                    <View style={styles.participantFooter}>
                                        <Text style={styles.participantMeta}>
                                            Added • {new Date(p.createdAt).toLocaleString()}
                                        </Text>

                                        <Pressable onPress={() => onRemoveParticipant(p.id)} style={styles.removeBtn}>
                                            <Text style={styles.removeBtnText}>Remove</Text>
                                        </Pressable>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Reaction Trials</Text>
                    <Text style={styles.help}>
                        The target appears after a random delay. Each participant completes dominant + non-dominant
                        trials.
                    </Text>

                    <Text style={styles.label}>Trials per hand (1–10)</Text>
                    <TextInput
                        value={trialsPerHandRaw}
                        onChangeText={(t) => setTrialsPerHandRaw(digitsOnly(t))}
                        keyboardType="number-pad"
                        placeholder="e.g. 3"
                        style={styles.input}
                    />

                    <Text style={styles.label}>Target delay min (seconds)</Text>
                    <TextInput
                        value={delayMinSecRaw}
                        onChangeText={setDelayMinSecRaw}
                        keyboardType="decimal-pad"
                        placeholder="e.g. 1.0"
                        style={styles.input}
                    />

                    <Text style={styles.label}>Target delay max (seconds)</Text>
                    <TextInput
                        value={delayMaxSecRaw}
                        onChangeText={setDelayMaxSecRaw}
                        keyboardType="decimal-pad"
                        placeholder="e.g. 3.0"
                        style={styles.input}
                    />

                    <Text style={styles.label}>Target size (px)</Text>
                    <TextInput
                        value={targetSizePxRaw}
                        onChangeText={(t) => setTargetSizePxRaw(digitsOnly(t))}
                        keyboardType="number-pad"
                        placeholder="e.g. 56"
                        style={styles.input}
                    />

                    <Text style={styles.note}>
                        Keep the delay range realistic (e.g. 1–3s) so students stay attentive.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Tracing Challenge</Text>
                    <Text style={styles.help}>
                        Students trace a moving path. Accuracy is computed from deviation vs allowed threshold.
                    </Text>

                    <Text style={styles.label}>Path type</Text>
                    <View style={{flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8}}>
                        {PATH_OPTIONS.map((opt) => {
                            const on = tracingPathType === opt.value;
                            return (
                                <Pressable
                                    key={opt.value}
                                    onPress={() => setTracingPathType(opt.value)}
                                    style={[styles.pill, on && styles.pillOn]}
                                >
                                    <Text style={[styles.pillText, on && styles.pillTextOn]}>{opt.label}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.label}>Max allowed deviation (px)</Text>
                    <TextInput
                        value={maxAllowedDeviationPxRaw}
                        onChangeText={(t) => setMaxAllowedDeviationPxRaw(digitsOnly(t))}
                        keyboardType="number-pad"
                        placeholder="e.g. 40"
                        style={styles.input}
                    />

                    <Text style={styles.label}>Accuracy threshold for leaderboard (%)</Text>
                    <TextInput
                        value={accuracyThresholdPctRaw}
                        onChangeText={(t) => setAccuracyThresholdPctRaw(digitsOnly(t))}
                        keyboardType="number-pad"
                        placeholder="e.g. 70"
                        style={styles.input}
                    />

                    <Text style={styles.note}>
                        A higher threshold makes leaderboard eligibility stricter.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>GPS (Required for Submission)</Text>
                    <Text style={styles.help}>
                        You can run trials without GPS, but submission will be blocked until GPS is granted and a
                        coordinate is captured.
                    </Text>

                    <View style={[styles.row, {marginTop: 10}]}>
                        <Text style={[styles.label, {marginTop: 0}]}>Enable GPS</Text>
                        <Switch value={gpsEnabled} onValueChange={onToggleGps}/>
                    </View>

                    <View style={styles.geoRow}>
                        <Text style={styles.geoText}>{formatGeoText(draft.session.geo)}</Text>
                        <Pressable
                            style={[styles.smallBtn, capturingGps && styles.smallBtnDisabled]}
                            onPress={onCaptureGps}
                            disabled={capturingGps}
                        >
                            <Text style={styles.smallBtnText}>{capturingGps ? "Capturing…" : "Capture"}</Text>
                        </Pressable>
                    </View>

                    <Text style={styles.note}>
                        Status: {gpsPermission.toUpperCase()} • Saved: {geoCaptured ? "YES" : "NO"}
                    </Text>
                </View>

                <Pressable style={styles.primaryBtn} onPress={onContinue}>
                    <Text style={styles.primaryBtnText}>Continue to Prediction</Text>
                </Pressable>

                {sessionError ? <Text style={styles.errorText}>⚠️ {sessionError}</Text> : null}

                <View style={{height: 40}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

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
    muted: {marginTop: 8, opacity: 0.6},

    label: {marginTop: 10, fontWeight: "800"},
    input: {
        marginTop: 6,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "#fff",
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
    },
    note: {marginTop: 10, opacity: 0.7, lineHeight: 18},

    row: {flexDirection: "row", alignItems: "center", justifyContent: "space-between"},

    addRow: {flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 10},

    smallBtn: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "#fff",
        minWidth: 80,
        alignItems: "center",
        justifyContent: "center",
    },
    smallBtnDisabled: {opacity: 0.6},
    smallBtnText: {fontWeight: "800"},

    participantCard: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
    },
    participantHeader: {fontWeight: "900"},
    participantFooter: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    participantMeta: {opacity: 0.7, fontSize: 12},

    removeBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#f3c2c2",
    },
    removeBtnText: {fontWeight: "900"},

    geoRow: {marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10},
    geoText: {flex: 1, opacity: 0.8},

    pill: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "#fff",
    },
    pillOn: {
        borderColor: "#111",
        backgroundColor: "#111",
    },
    pillText: {fontWeight: "900", opacity: 0.9},
    pillTextOn: {color: "#fff", opacity: 1},

    primaryBtn: {
        marginTop: 18,
        backgroundColor: "#111",
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "#fff", fontWeight: "900"},
    errorText: {marginTop: 12, color: "#b00020", fontWeight: "800"},
});