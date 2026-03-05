import React, {useEffect, useMemo, useState} from "react";
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
    createActivity5RunDraft,
    getActivity5RunDraft,
    updateActivity5Session,
    updateActivity5Participant,
    validateA5Session,
    type Activity5RunDraft,
    type A5ParticipantDraft,
} from "../../../store/activity5RunDraftStore";

/* =========================================================
   Helpers
========================================================= */

function clampInt(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
}

function digitsOnly(s: string) {
    return s.replace(/[^\d]/g, "");
}

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function trimOrEmpty(s: string) {
    return s.trim();
}

function formatGeoText(geo: Activity5RunDraft["session"]["geo"] | undefined): string {
    if (!geo) return "No coordinate saved yet";
    if (!isFiniteNumber(geo.lat) || !isFiniteNumber(geo.lng)) return "No coordinate saved yet";

    const accText = isFiniteNumber(geo.accuracyM) ? ` (±${Math.round(geo.accuracyM)}m)` : "";
    const timeText = isFiniteNumber(geo.capturedAt)
        ? ` • ${new Date(geo.capturedAt).toLocaleString()}`
        : "";

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

type Props = NativeStackScreenProps<AppStackParamList, "A5SessionSetup">;

/* =========================================================
   Screen
========================================================= */

export default function A5SessionSetupScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity5RunDraft | null>(null);

    // UI buffers
    const [sessionLabel, setSessionLabel] = useState("");
    const [samplingHzRaw, setSamplingHzRaw] = useState("50");
    const [movementDurationSecRaw, setMovementDurationSecRaw] = useState("20");
    const [participantCountRaw, setParticipantCountRaw] = useState("1");
    const [feedbackEnabled, setFeedbackEnabled] = useState(true);

    // GPS
    const [gpsEnabled, setGpsEnabled] = useState(true);
    const [gpsPermission, setGpsPermission] = useState<"unknown" | "granted" | "denied">("unknown");
    const [capturingGps, setCapturingGps] = useState(false);

    // participant add input
    const [newParticipantName, setNewParticipantName] = useState("");

    /* ----------------------------
       Hydrate / Create draft
    ---------------------------- */

    useEffect(() => {
        if (!user) return;

        let d = runId ? getActivity5RunDraft(runId) : null;
        if (!d) {
            d = createActivity5RunDraft({
                activityId,
                createdBy: user.uid,
                gpsEnabled: true,
                feedbackEnabled: true,
                samplingHz: 50,
                movementDurationSec: 20,
                participantCount: 1,
            });
        }
        setDraft(d);
    }, [activityId, runId, user]);

    /* ----------------------------
       Draft -> UI sync
    ---------------------------- */

    useEffect(() => {
        if (!draft) return;

        setSessionLabel(draft.session.sessionLabel ?? "");
        setSamplingHzRaw(String(draft.session.samplingHz ?? 50));
        setMovementDurationSecRaw(String(draft.session.movementDurationSec ?? 20));
        setParticipantCountRaw(String(draft.session.participantCount ?? 1));

        setFeedbackEnabled(Boolean(draft.session.feedbackEnabled));

        setGpsEnabled(Boolean(draft.session.gpsEnabled));
        setGpsPermission(draft.session.gpsPermission ?? "unknown");
    }, [draft]);

    const participants = draft?.session.participants ?? [];
    const geoCaptured = !!draft?.session.geo;

    /* ----------------------------
       Validation (shadow object)
    ---------------------------- */

    const sessionError = useMemo(() => {
        if (!draft) return null;

        const samplingHz = clampInt(Number(samplingHzRaw || "50"), 10, 100);
        const movementDurationSec = clampInt(Number(movementDurationSecRaw || "20"), 10, 60);
        const participantCount = clampInt(Number(participantCountRaw || "1"), 1, 6);

        const shadow: Activity5RunDraft = {
            ...draft,
            session: {
                ...draft.session,
                sessionLabel: sessionLabel.trim() ? sessionLabel.trim() : undefined,
                samplingHz,
                movementDurationSec,
                participantCount,
                feedbackEnabled,
                gpsEnabled,
                gpsPermission,
                // IMPORTANT: we don't mutate participants here; store will normalize on persist
            },
        };

        return validateA5Session(shadow);
    }, [
        draft,
        sessionLabel,
        samplingHzRaw,
        movementDurationSecRaw,
        participantCountRaw,
        feedbackEnabled,
        gpsEnabled,
        gpsPermission,
    ]);

    function persistSessionBase(): Activity5RunDraft | null {
        if (!draft) return null;

        const samplingHz = clampInt(Number(samplingHzRaw || "50"), 10, 100);
        const movementDurationSec = clampInt(Number(movementDurationSecRaw || "20"), 10, 60);
        const participantCount = clampInt(Number(participantCountRaw || "1"), 1, 6);

        const next = updateActivity5Session(draft.runId, {
            sessionLabel: sessionLabel.trim() ? sessionLabel.trim() : undefined,
            samplingHz,
            movementDurationSec,
            participantCount,
            feedbackEnabled,
            gpsEnabled,
            gpsPermission,
        });

        setDraft(next);
        return next;
    }

    /* ----------------------------
       Participants: Rename
    ---------------------------- */

    function onRenameParticipant(participantId: string, name: string) {
        if (!draft) return;

        const next = updateActivity5Participant(draft.runId, participantId, {
            name,
        });
        setDraft(next);
    }

    /* ----------------------------
       Participants: Add (store-native)
       - Increase participantCount (store appends default participant)
       - Rename last participant using updateActivity5Participant
    ---------------------------- */

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

        // 1) Increase count
        const afterCount = updateActivity5Session(draft.runId, {
            participantCount: currentCount + 1,
        });

        // 2) The store will have appended a new participant at the end
        const appended = afterCount.session.participants?.[afterCount.session.participants.length - 1];
        if (!appended?.id) {
            setDraft(afterCount);
            setNewParticipantName("");
            return;
        }

        // 3) Rename appended participant
        const afterRename = updateActivity5Participant(afterCount.runId, appended.id, {name});

        setDraft(afterRename);
        setParticipantCountRaw(String(afterRename.session.participantCount));
        setNewParticipantName("");
    }

    /* ----------------------------
       Participants: Remove
       We rebuild participants array and decrement participantCount,
       then call updateActivity5Session(...) with both fields.
    ---------------------------- */

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
                    const filtered: A5ParticipantDraft[] = (draft.session.participants ?? []).filter(
                        (p) => p.id !== participantId
                    );

                    const next = updateActivity5Session(draft.runId, {
                        participantCount: currentCount - 1,
                        participants: filtered,
                    });

                    setDraft(next);
                    setParticipantCountRaw(String(next.session.participantCount));
                },
            },
        ]);
    }

    /* ----------------------------
       GPS capture
    ---------------------------- */

    async function onCaptureGps() {
        if (!draft) return;

        if (!gpsEnabled) {
            Alert.alert("GPS disabled", "Enable GPS first to capture coordinates.");
            return;
        }

        try {
            setCapturingGps(true);

            // ensure permission
            let status = gpsPermission;
            if (status === "unknown" || status === "denied") {
                status = await requestGpsPermissionSafe();
                setGpsPermission(status);

                const nextPerm = updateActivity5Session(draft.runId, {gpsPermission: status});
                setDraft(nextPerm);
            }

            if (status !== "granted") {
                Alert.alert(
                    "Permission denied",
                    "Location permission is required for submission. Please enable it in device settings."
                );
                return;
            }

            // capture coordinate
            const g = await getCurrentGeoSafe();
            if (!g) {
                Alert.alert(
                    "Location unavailable",
                    "Could not capture your location. Please ensure Location Services are ON and try again."
                );
                return;
            }

            const next = updateActivity5Session(draft.runId, {
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

    /* ----------------------------
       Toggle GPS (store-consistent)
    ---------------------------- */

    function onToggleGps(nextVal: boolean) {
        setGpsEnabled(nextVal);

        if (!draft) return;

        // Mirror A4 policy: allow running w/o GPS, but clear geo when disabled for clarity.
        const next = updateActivity5Session(draft.runId, {
            gpsEnabled: nextVal,
            geo: nextVal ? draft.session.geo : undefined,
        });

        setDraft(next);
    }

    /* ----------------------------
       Continue -> Prediction
    ---------------------------- */

    function onContinue() {
        if (!user || !draft) return;

        if (sessionError) {
            Alert.alert("Check setup", sessionError);
            return;
        }

        const next = persistSessionBase();
        if (!next) return;

        navigation.navigate("A5Prediction", {
            activityId,
            runId: next.runId,
        });
    }

    /* ----------------------------
       Render guards
    ---------------------------- */

    if (!user) return null;

    if (!draft) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={styles.loadingText}>Loading session…</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Session Setup</Text>
                <Text style={styles.sub}>
                    Configure participants and sensor settings. You must enter a prediction before any guided trials.
                </Text>

                {/* Session */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Session</Text>

                    <Text style={styles.label}>Session label (optional)</Text>
                    <TextInput
                        value={sessionLabel}
                        onChangeText={setSessionLabel}
                        placeholder="e.g. Week 5 – Human Performance Lab"
                        style={styles.input}
                    />

                    <Text style={styles.note}>
                        Tip: Use a clear label so your team can find the submission later.
                    </Text>
                </View>

                {/* Sensor + Guidance */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Sensor Settings</Text>
                    <Text style={styles.help}>
                        Keep these values consistent across participants for fair comparison.
                    </Text>

                    <Text style={styles.label}>Sampling rate (10–100 Hz)</Text>
                    <TextInput
                        value={samplingHzRaw}
                        onChangeText={(t) => setSamplingHzRaw(digitsOnly(t))}
                        placeholder="50"
                        keyboardType="number-pad"
                        style={styles.input}
                        maxLength={3}
                    />

                    <Text style={styles.label}>Movement duration guidance (10–60 sec)</Text>
                    <TextInput
                        value={movementDurationSecRaw}
                        onChangeText={(t) => setMovementDurationSecRaw(digitsOnly(t))}
                        placeholder="20"
                        keyboardType="number-pad"
                        style={styles.input}
                        maxLength={2}
                    />

                    <View style={[styles.row, {marginTop: 12}]}>
                        <Text style={[styles.label, {marginTop: 0}]}>Enable Feedback Mode</Text>
                        <Switch value={feedbackEnabled} onValueChange={setFeedbackEnabled}/>
                    </View>

                    <Text style={styles.note}>
                        Feedback mode provides real-time guidance to encourage smoother movement.
                    </Text>
                </View>

                {/* Participants */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Participants</Text>
                    <Text style={styles.help}>
                        Add team members who will perform trials. Each trial is linked to one participant.
                    </Text>

                    <Text style={styles.label}>Participant count (1–6)</Text>
                    <TextInput
                        value={participantCountRaw}
                        onChangeText={(t) => setParticipantCountRaw(digitsOnly(t))}
                        placeholder="1"
                        keyboardType="number-pad"
                        style={styles.input}
                        maxLength={1}
                        onBlur={() => {
                            // Persist count changes on blur
                            const nextCount = clampInt(Number(participantCountRaw || "1"), 1, 6);
                            const next = updateActivity5Session(draft.runId, {participantCount: nextCount});
                            setDraft(next);
                            setParticipantCountRaw(String(next.session.participantCount));
                        }}
                    />

                    {/* Quick add */}
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

                    {/* Participant list with inline rename */}
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

                    <Text style={styles.note}>
                        At least 1 participant is required. You can run more trials per participant later.
                    </Text>
                </View>

                {/* GPS */}
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

                {/* Continue */}
                <Pressable style={styles.primaryBtn} onPress={onContinue}>
                    <Text style={styles.primaryBtnText}>Continue to Prediction</Text>
                </Pressable>

                {sessionError ? <Text style={styles.errorText}>⚠️ {sessionError}</Text> : null}

                <View style={{height: 40}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

/* =========================================================
   Styles (aligned with A4 style)
========================================================= */

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
    loadingText: {marginTop: 10, opacity: 0.7},

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

    label: {marginTop: 10, fontWeight: "800"},
    input: {
        marginTop: 6,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    note: {marginTop: 10, opacity: 0.65, lineHeight: 18},
    muted: {marginTop: 10, opacity: 0.6},

    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },

    addRow: {
        marginTop: 12,
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 10,
    },

    smallBtn: {
        marginTop: 24,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: "#111",
        alignItems: "center",
        justifyContent: "center",
    },
    smallBtnDisabled: {opacity: 0.6},
    smallBtnText: {color: "white", fontWeight: "900"},

    participantCard: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#eaeaea",
        backgroundColor: "white",
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
    participantMeta: {opacity: 0.6, fontSize: 12},
    removeBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#ddd",
        backgroundColor: "#fafafa",
    },
    removeBtnText: {fontWeight: "900", opacity: 0.85},

    geoRow: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    geoText: {flex: 1, opacity: 0.85, lineHeight: 18},

    primaryBtn: {
        marginTop: 20,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    errorText: {marginTop: 12, color: "#b00020", fontWeight: "800"},
});