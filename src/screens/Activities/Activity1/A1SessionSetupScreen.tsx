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
import {useTranslation} from "react-i18next";

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
    const value = raw.trim();
    if (!value) return undefined;

    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
}

function formatMmSs(msLeft: number): string {
    const totalSeconds = Math.max(0, Math.floor(msLeft / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
}

type TimerState =
    | { status: "not_started"; label: string; msLeft: number }
    | { status: "running"; label: string; msLeft: number }
    | { status: "ended"; label: string; msLeft: number };

export default function A1SessionSetupScreen({route, navigation}: Props) {
    const {t} = useTranslation(["activities", "common", "navigation"]);
    const user = auth.currentUser;
    const {activityId} = route.params;

    const [runId, setRunId] = useState<string | null>(route.params.runId ?? null);
    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);

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

    const [nowMs, setNowMs] = useState<number>(Date.now());
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const tA1Session = (key: string, options?: Record<string, unknown>) =>
        t(`a1.sessionSetup.${key}`, {ns: "activities", ...options});

    const tActivityCommon = (key: string, options?: Record<string, unknown>) =>
        t(`common.${key}`, {ns: "activities", ...options});

    useEffect(() => {
        if (!user) return;

        const existingId = route.params.runId;
        if (existingId) {
            const existingDraft = getRunDraft(existingId);

            if (existingDraft) {
                setRunId(existingId);
                setDraft(existingDraft);
                return;
            }

            const recreatedDraft = createRunDraft(activityId, user.uid);
            setRunId(recreatedDraft.runId);
            setDraft(recreatedDraft);
            navigation.setParams({runId: recreatedDraft.runId});
            return;
        }

        const createdDraft = createRunDraft(activityId, user.uid);
        setRunId(createdDraft.runId);
        setDraft(createdDraft);
        navigation.setParams({runId: createdDraft.runId});
    }, [activityId, navigation, route.params.runId, user]);

    useEffect(() => {
        const hasRunningTimer = Boolean(draft?.session.startedAt && draft?.session.endsAt);

        if (!hasRunningTimer) {
            if (tickRef.current) {
                clearInterval(tickRef.current);
                tickRef.current = null;
            }
            return;
        }

        if (tickRef.current) {
            clearInterval(tickRef.current);
        }

        tickRef.current = setInterval(() => {
            setNowMs(Date.now());
        }, 250);

        return () => {
            if (tickRef.current) {
                clearInterval(tickRef.current);
                tickRef.current = null;
            }
        };
    }, [draft?.session.startedAt, draft?.session.endsAt]);

    useEffect(() => {
        if (!draft) return;

        const session = draft.session;

        setDropHeightRaw(session.dropHeightM != null ? String(session.dropHeightM) : "");
        setTargetEnabled(Boolean(session.targetZoneEnabled));
        setTargetPreset(session.targetPreset ?? "none");
        setEnvironment((session.environment ?? "indoor") as SessionDraft["environment"]);
        setPayloadType(session.payloadType ?? "");

        setMassUnknown(Boolean(session.payloadMassUnknown));
        setPayloadMassRaw(session.payloadMassG != null ? String(session.payloadMassG) : "");

        setSafetyStableSurface(Boolean(session.safety?.stableSurface));
        setSafetyKeepAreaClear(Boolean(session.safety?.keepAreaClear));
        setSafetyDoNotThrow(Boolean(session.safety?.doNotThrow));
    }, [draft]);

    const timer = useMemo<TimerState>(() => {
        const session = draft?.session;
        const {startedAt, endsAt} = session ?? {};

        if (!startedAt || !endsAt) {
            return {
                status: "not_started",
                label: "20:00",
                msLeft: 20 * 60 * 1000,
            };
        }

        const msLeft = endsAt - nowMs;

        if (msLeft <= 0) {
            return {
                status: "ended",
                label: "00:00",
                msLeft: 0,
            };
        }

        return {
            status: "running",
            label: formatMmSs(msLeft),
            msLeft,
        };
    }, [draft?.session, nowMs]);

    function persistSessionPatch(patch: Partial<SessionDraft>) {
        if (!runId) return;
        const nextDraft = updateSession(runId, patch);
        setDraft(nextDraft);
    }

    function onStartChallenge() {
        if (!runId || !draft) return;

        const alreadyStarted = Boolean(draft.session.startedAt && draft.session.endsAt);
        if (alreadyStarted) return;

        const now = Date.now();
        const durationMinutes = draft.session.durationMin ?? 20;
        const endsAt = now + durationMinutes * 60 * 1000;

        persistSessionPatch({
            startedAt: now,
            endsAt,
        });
    }

    function validateBeforeContinue(): { ok: true } | { ok: false; message: string } {
        const dropHeightM = toNumberOrUndefined(dropHeightRaw);
        if (dropHeightM == null || dropHeightM <= 0) {
            return {ok: false, message: tA1Session("validationDropHeight")};
        }

        if (targetEnabled && (!targetPreset || targetPreset === "none")) {
            return {ok: false, message: tA1Session("validationTargetPreset")};
        }

        if (!massUnknown) {
            const payloadMassG = toNumberOrUndefined(payloadMassRaw);
            if (payloadMassG == null || payloadMassG <= 0) {
                return {ok: false, message: tA1Session("validationPayloadMass")};
            }
        }

        if (!safetyStableSurface || !safetyKeepAreaClear || !safetyDoNotThrow) {
            return {ok: false, message: tA1Session("validationSafety")};
        }

        return {ok: true};
    }

    function onContinue() {
        if (!user || !runId) return;

        const validation = validateBeforeContinue();
        if (!validation.ok) {
            Alert.alert(tActivityCommon("checkFieldsTitle"), validation.message);
            return;
        }

        const dropHeightM = toNumberOrUndefined(dropHeightRaw);
        const payloadMassG = massUnknown ? undefined : toNumberOrUndefined(payloadMassRaw);

        persistSessionPatch({
            dropHeightM,
            targetZoneEnabled: targetEnabled,
            targetPreset: targetEnabled ? targetPreset : "none",
            environment,
            payloadType: payloadType.trim() ? payloadType.trim() : undefined,
            payloadMassUnknown: massUnknown,
            payloadMassG,
            safety: {
                stableSurface: safetyStableSurface,
                keepAreaClear: safetyKeepAreaClear,
                doNotThrow: safetyDoNotThrow,
            },
        });

        navigation.navigate("A1AttemptPlan", {
            activityId,
            runId,
            attemptIndex: 0,
        });
    }

    if (!user) return null;

    return (
        <KeyboardAvoidingView
            style={styles.screen}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{tA1Session("title")}</Text>
                <Text style={styles.sub}>{tA1Session("subtitle")}</Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{tA1Session("timedChallengeTitle")}</Text>
                    <Text style={styles.timer}>{timer.label}</Text>
                    <Text style={styles.timerHint}>
                        {timer.status === "not_started"
                            ? tA1Session("timerNotStarted")
                            : timer.status === "running"
                                ? tA1Session("timerRunning")
                                : tA1Session("timerEnded")}
                    </Text>

                    <Pressable
                        style={[
                            styles.primaryBtn,
                            (timer.status !== "not_started" || !draft) && styles.primaryBtnDisabled,
                        ]}
                        disabled={timer.status !== "not_started" || !draft}
                        onPress={onStartChallenge}
                    >
                        <Text style={styles.primaryBtnText}>{tA1Session("startChallenge")}</Text>
                    </Pressable>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{tA1Session("requiredInputsTitle")}</Text>

                    <Text style={styles.label}>{tA1Session("dropHeightLabel")}</Text>
                    <TextInput
                        value={dropHeightRaw}
                        onChangeText={setDropHeightRaw}
                        placeholder={tA1Session("dropHeightPlaceholder")}
                        keyboardType="decimal-pad"
                        style={styles.input}
                    />
                    <Text style={styles.help}>{tA1Session("dropHeightHelp")}</Text>

                    <View style={styles.rowBetween}>
                        <View style={styles.flexOne}>
                            <Text style={styles.label}>{tA1Session("landingTargetZoneLabel")}</Text>
                            <Text style={styles.help}>{tA1Session("landingTargetZoneHelp")}</Text>
                        </View>
                        <Switch value={targetEnabled} onValueChange={setTargetEnabled}/>
                    </View>

                    {targetEnabled ? (
                        <View style={styles.sectionSpacing}>
                            <Text style={styles.label}>{tA1Session("targetPresetLabel")}</Text>

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
                                        {tA1Session("targetPreset50cm")}
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
                                        {tA1Session("targetPreset1m")}
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    ) : null}

                    <View style={styles.sectionSpacingSm}>
                        <Text style={styles.label}>{tA1Session("environmentLabel")}</Text>
                        <View style={styles.segment}>
                            <Pressable
                                style={[
                                    styles.segmentBtn,
                                    environment === "indoor" && styles.segmentBtnActive,
                                ]}
                                onPress={() => setEnvironment("indoor")}
                            >
                                <Text
                                    style={[
                                        styles.segmentText,
                                        environment === "indoor" && styles.segmentTextActive,
                                    ]}
                                >
                                    {tA1Session("environmentIndoor")}
                                </Text>
                            </Pressable>

                            <Pressable
                                style={[
                                    styles.segmentBtn,
                                    environment === "outdoor" && styles.segmentBtnActive,
                                ]}
                                onPress={() => setEnvironment("outdoor")}
                            >
                                <Text
                                    style={[
                                        styles.segmentText,
                                        environment === "outdoor" && styles.segmentTextActive,
                                    ]}
                                >
                                    {tA1Session("environmentOutdoor")}
                                </Text>
                            </Pressable>
                        </View>
                    </View>

                    <Text style={[styles.label, styles.sectionSpacingSm]}>
                        {tA1Session("payloadTypeLabel")}
                    </Text>
                    <TextInput
                        value={payloadType}
                        onChangeText={setPayloadType}
                        placeholder={tA1Session("payloadTypePlaceholder")}
                        style={styles.input}
                    />

                    <View style={[styles.rowBetween, styles.sectionSpacingXs]}>
                        <View style={styles.flexOne}>
                            <Text style={styles.label}>{tA1Session("payloadMassLabel")}</Text>
                            <Text style={styles.help}>{tA1Session("payloadMassHelp")}</Text>
                        </View>

                        <View style={styles.inlineRow}>
                            <Text style={styles.toggleLabel}>{tA1Session("unknownToggleLabel")}</Text>
                            <Switch value={massUnknown} onValueChange={setMassUnknown}/>
                        </View>
                    </View>

                    <TextInput
                        value={payloadMassRaw}
                        onChangeText={setPayloadMassRaw}
                        placeholder={tA1Session("payloadMassPlaceholder")}
                        keyboardType="number-pad"
                        style={[styles.input, massUnknown && styles.inputDisabled]}
                        editable={!massUnknown}
                    />
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{tA1Session("safetyChecklistTitle")}</Text>

                    <Pressable style={styles.checkRow} onPress={() => setSafetyStableSurface((prev) => !prev)}>
                        <View style={[styles.checkbox, safetyStableSurface && styles.checkboxOn]}/>
                        <Text style={styles.checkText}>{tA1Session("safetyStableSurface")}</Text>
                    </Pressable>

                    <Pressable style={styles.checkRow} onPress={() => setSafetyKeepAreaClear((prev) => !prev)}>
                        <View style={[styles.checkbox, safetyKeepAreaClear && styles.checkboxOn]}/>
                        <Text style={styles.checkText}>{tA1Session("safetyKeepAreaClear")}</Text>
                    </Pressable>

                    <Pressable style={styles.checkRow} onPress={() => setSafetyDoNotThrow((prev) => !prev)}>
                        <View style={[styles.checkbox, safetyDoNotThrow && styles.checkboxOn]}/>
                        <Text style={styles.checkText}>{tA1Session("safetyDoNotThrow")}</Text>
                    </Pressable>
                </View>

                <Pressable style={styles.primaryBtn} onPress={onContinue}>
                    <Text style={styles.primaryBtnText}>{t("common:actions.continue")}</Text>
                </Pressable>

                <Text style={styles.footerHint}>{tA1Session("footerHint")}</Text>

                <View style={styles.bottomSpacer}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    container: {
        flexGrow: 1,
        padding: 20,
    },
    title: {
        marginTop: 6,
        fontSize: 26,
        fontWeight: "900",
    },
    sub: {
        marginTop: 8,
        opacity: 0.75,
        lineHeight: 18,
    },
    card: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: "900",
    },
    timer: {
        marginTop: 12,
        fontSize: 32,
        fontWeight: "900",
        letterSpacing: 1,
    },
    timerHint: {
        marginTop: 4,
        opacity: 0.7,
    },
    label: {
        marginTop: 12,
        marginBottom: 6,
        fontWeight: "800",
    },
    help: {
        marginTop: 6,
        opacity: 0.72,
        lineHeight: 18,
    },
    input: {
        borderWidth: 1,
        borderColor: "#ddd",
        backgroundColor: "#fff",
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 11,
    },
    inputDisabled: {
        opacity: 0.5,
    },
    rowBetween: {
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },
    inlineRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    flexOne: {
        flex: 1,
    },
    toggleLabel: {
        marginRight: 8,
        opacity: 0.8,
    },
    segment: {
        marginTop: 6,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    segmentBtn: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "#ddd",
        backgroundColor: "#fff",
    },
    segmentBtnActive: {
        backgroundColor: "#111",
        borderColor: "#111",
    },
    segmentText: {
        fontWeight: "700",
        color: "#111",
    },
    segmentTextActive: {
        color: "#fff",
    },
    checkRow: {
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
    },
    checkbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: "#bbb",
        backgroundColor: "#fff",
        marginRight: 10,
    },
    checkboxOn: {
        backgroundColor: "#111",
        borderColor: "#111",
    },
    checkText: {
        flex: 1,
        lineHeight: 20,
    },
    primaryBtn: {
        marginTop: 16,
        borderRadius: 12,
        backgroundColor: "#111",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    primaryBtnDisabled: {
        opacity: 0.5,
    },
    primaryBtnText: {
        color: "#fff",
        fontWeight: "900",
        fontSize: 15,
    },
    footerHint: {
        marginTop: 14,
        opacity: 0.7,
        lineHeight: 18,
    },
    sectionSpacing: {
        marginTop: 10,
    },
    sectionSpacingSm: {
        marginTop: 14,
    },
    sectionSpacingXs: {
        marginTop: 10,
    },
    bottomSpacer: {
        height: 30,
    },
});