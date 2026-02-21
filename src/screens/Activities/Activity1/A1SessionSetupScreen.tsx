import React, {useEffect, useMemo, useRef, useState} from "react";
import {
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
    createRunDraft,
    getRunDraft,
    updateSession,
    type ActivityRunDraft,
    type SessionDraft,
} from "../../../store/activityRunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A1SessionSetup">;

function toNumberOrUndefined(raw: string): number | undefined {
    const v = raw.trim();
    if (!v) return undefined;
    const n = Number(v);
    if (Number.isNaN(n)) return undefined;
    return n;
}

function formatMmSs(msLeft: number) {
    const totalSec = Math.max(0, Math.floor(msLeft / 1000));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const ss = String(totalSec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
}

export default function A1SessionSetupScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;

    const [runId, setRunId] = useState<string | null>(route.params.runId ?? null);
    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);

    // Form fields (keep UI state as strings where needed)
    const [dropHeightRaw, setDropHeightRaw] = useState<string>("");
    const [targetEnabled, setTargetEnabled] = useState<boolean>(false);
    const [targetPreset, setTargetPreset] = useState<SessionDraft["targetPreset"]>("none");
    const [environment, setEnvironment] = useState<SessionDraft["environment"]>("indoor");
    const [payloadType, setPayloadType] = useState<string>("");

    const [massUnknown, setMassUnknown] = useState<boolean>(false);
    const [payloadMassRaw, setPayloadMassRaw] = useState<string>("");

    const [safetyStableSurface, setSafetyStableSurface] = useState<boolean>(false);
    const [safetyKeepAreaClear, setSafetyKeepAreaClear] = useState<boolean>(false);
    const [safetyDoNotThrow, setSafetyDoNotThrow] = useState<boolean>(false);

    // Timer
    const [nowMs, setNowMs] = useState<number>(Date.now());
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        // Resolve / create run draft safely (avoids "Run draft not found" on fast refresh)
        if (!user) return;

        const existingId = route.params.runId;
        if (existingId) {
            const existing = getRunDraft(existingId);
            if (existing) {
                setRunId(existingId);
                setDraft(existing);
                return;
            }

            // If route has runId but store was reset, recreate and replace params
            const recreated = createRunDraft(activityId, user.uid);
            setRunId(recreated.runId);
            setDraft(recreated);

            navigation.setParams({runId: recreated.runId});
            return;
        }

        // No runId provided: create new
        const created = createRunDraft(activityId, user.uid);
        setRunId(created.runId);
        setDraft(created);
        navigation.setParams({runId: created.runId});
    }, [activityId, navigation, route.params.runId, user]);

    useEffect(() => {
        // Start ticking if session started
        if (!draft?.session.startedAt || !draft.session.endsAt) return;

        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = setInterval(() => setNowMs(Date.now()), 250);

        return () => {
            if (tickRef.current) clearInterval(tickRef.current);
            tickRef.current = null;
        };
    }, [draft?.session.endsAt, draft?.session.startedAt]);

    useEffect(() => {
        // Hydrate form from draft when ready
        if (!draft) return;

        const s = draft.session;

        setDropHeightRaw(s.dropHeightM != null ? String(s.dropHeightM) : "");
        setTargetEnabled(Boolean(s.targetZoneEnabled));
        setTargetPreset(s.targetPreset ?? "none");
        setEnvironment((s.environment ?? "indoor") as SessionDraft["environment"]);
        setPayloadType(s.payloadType ?? "");

        setMassUnknown(Boolean(s.payloadMassUnknown));
        setPayloadMassRaw(s.payloadMassG != null ? String(s.payloadMassG) : "");

        setSafetyStableSurface(Boolean(s.safety?.stableSurface));
        setSafetyKeepAreaClear(Boolean(s.safety?.keepAreaClear));
        setSafetyDoNotThrow(Boolean(s.safety?.doNotThrow));
    }, [draft]);

    const timer = useMemo(() => {
        const s = draft?.session;
        const endsAt = s?.endsAt;
        const startedAt = s?.startedAt;

        if (!startedAt || !endsAt) {
            return {status: "not_started" as const, label: "20:00", msLeft: 20 * 60 * 1000};
        }

        const msLeft = endsAt - nowMs;
        if (msLeft <= 0) {
            return {status: "ended" as const, label: "00:00", msLeft: 0};
        }

        return {status: "running" as const, label: formatMmSs(msLeft), msLeft};
    }, [draft?.session, nowMs]);

    function persistSessionPatch(patch: Partial<SessionDraft>) {
        if (!runId) return;
        const next = updateSession(runId, patch);
        setDraft(next);
    }

    function onStartChallenge() {
        if (!runId || !draft) return;

        const alreadyStarted = Boolean(draft.session.startedAt && draft.session.endsAt);
        if (alreadyStarted) return;

        const now = Date.now();
        const durationMin = draft.session.durationMin ?? 20;
        const endsAt = now + durationMin * 60 * 1000;

        persistSessionPatch({
            startedAt: now,
            endsAt,
        });
    }

    function validateBeforeContinue(): { ok: true } | { ok: false; message: string } {
        const h = toNumberOrUndefined(dropHeightRaw);
        if (h == null || h <= 0) {
            return {ok: false, message: "Please enter Drop Height (m). It must be > 0."};
        }

        if (targetEnabled) {
            if (!targetPreset || targetPreset === "none") {
                return {
                    ok: false,
                    message: "Target zone is enabled. Please choose a target preset (50cm or 1m).",
                };
            }
        }

        if (!massUnknown) {
            const m = toNumberOrUndefined(payloadMassRaw);
            if (m == null || m <= 0) {
                return {ok: false, message: "Please enter Payload Mass (g), or toggle Unknown."};
            }
        }

        if (!safetyStableSurface || !safetyKeepAreaClear || !safetyDoNotThrow) {
            return {ok: false, message: "Please confirm all safety checklist items."};
        }

        return {ok: true};
    }

    function onContinue() {
        if (!user) return;
        if (!runId) return;

        const v = validateBeforeContinue();
        if (!v.ok) {
            Alert.alert("Check required fields", v.message);
            return;
        }

        const dropHeightM = toNumberOrUndefined(dropHeightRaw);
        const payloadMassG = massUnknown ? undefined : toNumberOrUndefined(payloadMassRaw);

        // Persist everything
        persistSessionPatch({
            dropHeightM: dropHeightM,
            targetZoneEnabled: targetEnabled,
            targetPreset: targetEnabled ? (targetPreset ?? "none") : "none",
            environment,
            payloadType: payloadType.trim() ? payloadType.trim() : undefined,
            payloadMassUnknown: massUnknown,
            payloadMassG: payloadMassG,
            safety: {
                stableSurface: safetyStableSurface,
                keepAreaClear: safetyKeepAreaClear,
                doNotThrow: safetyDoNotThrow,
            },
        });

        navigation.navigate("A1AttemptPlan", {activityId, runId, attemptIndex: 0});
    }

    if (!user) return null;

    return (
        <KeyboardAvoidingView
            style={{flex: 1}}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Session Setup</Text>
                <Text style={styles.sub}>
                    Configure the session first. You can start the 20-minute challenge timer anytime.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Timed Challenge</Text>
                    <Text style={styles.timer}>{timer.label}</Text>
                    <Text style={styles.timerHint}>
                        {timer.status === "not_started"
                            ? "Not started yet"
                            : timer.status === "running"
                                ? "Running"
                                : "Ended"}
                    </Text>

                    <Pressable
                        style={[
                            styles.primaryBtn,
                            (timer.status !== "not_started" || !draft) && {opacity: 0.5},
                        ]}
                        disabled={timer.status !== "not_started" || !draft}
                        onPress={onStartChallenge}
                    >
                        <Text style={styles.primaryBtnText}>Start 20-minute Challenge</Text>
                    </Pressable>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Required Inputs</Text>

                    <Text style={styles.label}>Drop Height (m)</Text>
                    <TextInput
                        value={dropHeightRaw}
                        onChangeText={setDropHeightRaw}
                        placeholder="e.g. 1.5"
                        keyboardType="decimal-pad"
                        style={styles.input}
                    />
                    <Text style={styles.help}>
                        You may “measure later”, but it must be filled before attempts are saved.
                    </Text>

                    <View style={styles.rowBetween}>
                        <View style={{flex: 1}}>
                            <Text style={styles.label}>Landing Target Zone</Text>
                            <Text style={styles.help}>Enable if you want accuracy scoring.</Text>
                        </View>
                        <Switch value={targetEnabled} onValueChange={setTargetEnabled}/>
                    </View>

                    {targetEnabled ? (
                        <View style={{marginTop: 10}}>
                            <Text style={styles.label}>Target preset</Text>

                            <View style={styles.segment}>
                                <Pressable
                                    style={[
                                        styles.segmentBtn,
                                        targetPreset === "50cm_circle" && styles.segmentBtnActive,
                                    ]}
                                    onPress={() => setTargetPreset("50cm_circle")}
                                >
                                    <Text
                                        style={[
                                            styles.segmentText,
                                            targetPreset === "50cm_circle" && styles.segmentTextActive,
                                        ]}
                                    >
                                        Within 50cm circle
                                    </Text>
                                </Pressable>

                                <Pressable
                                    style={[
                                        styles.segmentBtn,
                                        targetPreset === "1m_circle" && styles.segmentBtnActive,
                                    ]}
                                    onPress={() => setTargetPreset("1m_circle")}
                                >
                                    <Text
                                        style={[
                                            styles.segmentText,
                                            targetPreset === "1m_circle" && styles.segmentTextActive,
                                        ]}
                                    >
                                        Within 1m circle
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    ) : null}

                    <View style={{marginTop: 14}}>
                        <Text style={styles.label}>Environment</Text>
                        <View style={styles.segment}>
                            <Pressable
                                style={[styles.segmentBtn, environment === "indoor" && styles.segmentBtnActive]}
                                onPress={() => setEnvironment("indoor")}
                            >
                                <Text
                                    style={[
                                        styles.segmentText,
                                        environment === "indoor" && styles.segmentTextActive,
                                    ]}
                                >
                                    Indoor
                                </Text>
                            </Pressable>

                            <Pressable
                                style={[styles.segmentBtn, environment === "outdoor" && styles.segmentBtnActive]}
                                onPress={() => setEnvironment("outdoor")}
                            >
                                <Text
                                    style={[
                                        styles.segmentText,
                                        environment === "outdoor" && styles.segmentTextActive,
                                    ]}
                                >
                                    Outdoor
                                </Text>
                            </Pressable>
                        </View>
                    </View>

                    <Text style={[styles.label, {marginTop: 14}]}>Payload (toy type)</Text>
                    <TextInput
                        value={payloadType}
                        onChangeText={setPayloadType}
                        placeholder="e.g. toy soldier"
                        style={styles.input}
                    />

                    <View style={[styles.rowBetween, {marginTop: 10}]}>
                        <View style={{flex: 1}}>
                            <Text style={styles.label}>Payload Mass (g)</Text>
                            <Text style={styles.help}>If unknown, calculations will be limited.</Text>
                        </View>
                        <View style={styles.row}>
                            <Text style={{marginRight: 8, opacity: 0.8}}>Unknown</Text>
                            <Switch value={massUnknown} onValueChange={setMassUnknown}/>
                        </View>
                    </View>

                    <TextInput
                        value={payloadMassRaw}
                        onChangeText={setPayloadMassRaw}
                        placeholder="e.g. 20"
                        keyboardType="number-pad"
                        style={[styles.input, massUnknown && {opacity: 0.5}]}
                        editable={!massUnknown}
                    />
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Safety Checklist</Text>

                    <Pressable style={styles.checkRow} onPress={() => setSafetyStableSurface((v) => !v)}>
                        <View style={[styles.checkbox, safetyStableSurface && styles.checkboxOn]}/>
                        <Text style={styles.checkText}>Drop from stable surface</Text>
                    </Pressable>

                    <Pressable style={styles.checkRow} onPress={() => setSafetyKeepAreaClear((v) => !v)}>
                        <View style={[styles.checkbox, safetyKeepAreaClear && styles.checkboxOn]}/>
                        <Text style={styles.checkText}>Keep area clear</Text>
                    </Pressable>

                    <Pressable style={styles.checkRow} onPress={() => setSafetyDoNotThrow((v) => !v)}>
                        <View style={[styles.checkbox, safetyDoNotThrow && styles.checkboxOn]}/>
                        <Text style={styles.checkText}>Do not throw the toy</Text>
                    </Pressable>
                </View>

                <Pressable style={styles.primaryBtn} onPress={onContinue}>
                    <Text style={styles.primaryBtnText}>Continue</Text>
                </Pressable>

                <Text style={styles.footerHint}>
                    Next: Baseline attempt plan → record video → measurements → results. You can run up to 3
                    prototypes within the timer.
                </Text>

                <View style={{height: 30}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20},
    title: {fontSize: 26, fontWeight: "900", marginTop: 6},
    sub: {marginTop: 8, opacity: 0.75, lineHeight: 18},

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

    row: {flexDirection: "row", alignItems: "center"},
    rowBetween: {flexDirection: "row", alignItems: "center", justifyContent: "space-between"},

    segment: {
        marginTop: 8,
        flexDirection: "row",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "white",
    },
    segmentBtn: {flex: 1, paddingVertical: 10, alignItems: "center"},
    segmentBtnActive: {backgroundColor: "#111"},
    segmentText: {fontWeight: "800", opacity: 0.85},
    segmentTextActive: {color: "white", opacity: 1},

    timer: {marginTop: 10, fontSize: 34, fontWeight: "900", letterSpacing: 1},
    timerHint: {marginTop: 6, opacity: 0.7},

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    checkRow: {flexDirection: "row", alignItems: "center", paddingVertical: 10},
    checkbox: {
        width: 18,
        height: 18,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: "#111",
        marginRight: 10,
        backgroundColor: "transparent",
    },
    checkboxOn: {backgroundColor: "#111"},
    checkText: {fontWeight: "700"},

    footerHint: {marginTop: 10, opacity: 0.7, lineHeight: 18},
});