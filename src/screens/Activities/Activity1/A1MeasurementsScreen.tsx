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
import {useTranslation} from "react-i18next";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";
import {
    getRunDraft,
    updateAttempt,
    type ActivityRunDraft,
    type AttemptDraft,
    type AttemptMeasurementsDraft,
} from "../../../store/activityRunDraftStore";
import {pickVideoFromLibrary, recordVideoWithCamera} from "../../../services/evidenceService";

type Props = NativeStackScreenProps<AppStackParamList, "A1Measurements">;

function toNumberOrUndefined(raw: string): number | undefined {
    const value = raw.trim();
    if (!value) return undefined;

    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}

export default function A1MeasurementsScreen({route, navigation}: Props) {
    const {t} = useTranslation(["activities", "common", "navigation"]);
    const user = auth.currentUser;
    const {activityId, runId, attemptIndex} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);
    const [attempt, setAttempt] = useState<AttemptDraft | null>(null);

    const [tHitRaw, setTHitRaw] = useState<string>("");
    const [tStopRaw, setTStopRaw] = useState<string>("");

    const [inZone, setInZone] = useState<boolean | null>(null);
    const [distanceRaw, setDistanceRaw] = useState<string>("");

    const [bounceOccurred, setBounceOccurred] = useState<boolean>(false);
    const [tUpRaw, setTUpRaw] = useState<string>("");

    const [savingVideo, setSavingVideo] = useState<boolean>(false);

    const tA1Measurements = (key: string, options?: Record<string, unknown>) =>
        t(`a1.measurements.${key}`, {ns: "activities", ...options});

    const tA1Common = (key: string, options?: Record<string, unknown>) =>
        t(`a1.common.${key}`, {ns: "activities", ...options});

    const tActivityCommon = (key: string, options?: Record<string, unknown>) =>
        t(`common.${key}`, {ns: "activities", ...options});

    const attemptTitle =
        attemptIndex === 0
            ? tA1Common("baselineLabel")
            : tA1Common("prototypeLabel", {index: attemptIndex});

    useEffect(() => {
        if (!user) return;

        const loadedDraft = getRunDraft(runId);
        if (!loadedDraft) {
            Alert.alert(
                tActivityCommon("sessionExpiredTitle"),
                tActivityCommon("sessionExpiredMessage"),
                [
                    {
                        text: t("common:actions.ok"),
                        onPress: () => navigation.replace("A1SessionSetup", {activityId}),
                    },
                ]
            );
            return;
        }

        const loadedAttempt = loadedDraft.attempts?.[attemptIndex];
        if (!loadedAttempt) {
            Alert.alert(
                tA1Common("attemptMissingTitle"),
                tA1Common("attemptMissingMessage"),
                [{text: t("common:actions.ok"), onPress: () => navigation.goBack()}]
            );
            return;
        }

        setDraft(loadedDraft);
        setAttempt(loadedAttempt);
    }, [activityId, attemptIndex, navigation, runId, t, user]);

    useEffect(() => {
        if (!draft || !attempt) return;

        const measurements = attempt.measurements;

        setTHitRaw(measurements?.tHitSec != null ? String(measurements.tHitSec) : "");
        setTStopRaw(measurements?.tStopSec != null ? String(measurements.tStopSec) : "");

        setInZone(typeof measurements?.inTargetZone === "boolean" ? measurements.inTargetZone : null);
        setDistanceRaw(
            measurements?.distanceFromCenterCm != null
                ? String(measurements.distanceFromCenterCm)
                : ""
        );

        setBounceOccurred(Boolean(measurements?.bounceOccurred));
        setTUpRaw(
            measurements?.bounceTimeToPeakSec != null
                ? String(measurements.bounceTimeToPeakSec)
                : ""
        );
    }, [attempt, draft]);

    const targetRequired = useMemo(
        () => Boolean(draft?.session.targetZoneEnabled),
        [draft?.session.targetZoneEnabled]
    );

    function persistMeasurements(next: AttemptMeasurementsDraft) {
        const updatedDraft = updateAttempt(runId, attemptIndex, {measurements: next});
        setDraft(updatedDraft);
        setAttempt(updatedDraft.attempts[attemptIndex]);
    }

    function validate(): string | null {
        const tHit = toNumberOrUndefined(tHitRaw);
        if (tHit == null || tHit <= 0) {
            return tA1Measurements("validationTHit");
        }

        const tStop = toNumberOrUndefined(tStopRaw);
        if (tStop == null || tStop < 0) {
            return tA1Measurements("validationTStop");
        }

        if (targetRequired && inZone === null) {
            return tA1Measurements("validationTarget");
        }

        if (distanceRaw.trim()) {
            const distance = toNumberOrUndefined(distanceRaw);
            if (distance == null || distance < 0) {
                return tA1Measurements("validationDistance");
            }
        }

        if (bounceOccurred) {
            const tUp = toNumberOrUndefined(tUpRaw);
            if (tUp == null || tUp <= 0) {
                return tA1Measurements("validationBounce");
            }
        }

        return null;
    }

    function onCompute() {
        if (!draft || !attempt) return;

        const validationError = validate();
        if (validationError) {
            Alert.alert(tActivityCommon("checkFieldsTitle"), validationError);
            return;
        }

        const nextMeasurements: AttemptMeasurementsDraft = {
            tHitSec: toNumberOrUndefined(tHitRaw),
            tStopSec: toNumberOrUndefined(tStopRaw),
            inTargetZone: targetRequired ? (inZone ?? undefined) : undefined,
            distanceFromCenterCm: distanceRaw.trim()
                ? toNumberOrUndefined(distanceRaw)
                : undefined,
            bounceOccurred: bounceOccurred ? true : undefined,
            bounceTimeToPeakSec: bounceOccurred ? toNumberOrUndefined(tUpRaw) : undefined,
        };

        persistMeasurements(nextMeasurements);
        navigation.navigate("A1Result", {activityId, runId, attemptIndex});
    }

    async function attachVideo(kind: "record" | "pick") {
        try {
            if (!draft || !attempt) return;

            setSavingVideo(true);

            const picked =
                kind === "record"
                    ? await recordVideoWithCamera()
                    : await pickVideoFromLibrary();

            if (!picked) return;

            const now = Date.now();
            const updatedDraft = updateAttempt(runId, attemptIndex, {
                video: {
                    type: "video",
                    uri: picked.uri,
                    createdAt: now,
                },
            });

            setDraft(updatedDraft);
            setAttempt(updatedDraft.attempts[attemptIndex]);

            Alert.alert(
                tActivityCommon("videoAttachedTitle"),
                tActivityCommon("videoAttachedMessage")
            );
        } catch (error: unknown) {
            Alert.alert(
                tActivityCommon("videoErrorTitle"),
                getErrorMessage(error, tActivityCommon("videoErrorMessage"))
            );
        } finally {
            setSavingVideo(false);
        }
    }

    function clearVideo() {
        if (!draft || !attempt) return;

        const updatedDraft = updateAttempt(runId, attemptIndex, {video: undefined});
        setDraft(updatedDraft);
        setAttempt(updatedDraft.attempts[attemptIndex]);
    }

    if (!user) return null;

    if (!draft || !attempt) {
        return (
            <View style={styles.center}>
                <Text style={styles.loadingDraftText}>{tActivityCommon("loadingDraft")}</Text>
            </View>
        );
    }

    const hasVideo = typeof attempt.video?.uri === "string" && attempt.video.uri.length > 0;

    return (
        <KeyboardAvoidingView
            style={styles.screen}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{tActivityCommon("measurementsTitle")}</Text>
                <Text style={styles.sub}>{attemptTitle}</Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{tActivityCommon("evidenceVideoTitle")}</Text>
                    <Text style={styles.help}>{tActivityCommon("evidenceVideoHelp")}</Text>

                    <View style={styles.actionStack}>
                        <Pressable
                            style={[styles.secondaryBtn, savingVideo && styles.dimmed]}
                            onPress={() => attachVideo("record")}
                            disabled={savingVideo}
                        >
                            <Text style={styles.secondaryBtnText}>
                                {tActivityCommon("recordVideo")}
                            </Text>
                        </Pressable>

                        <Pressable
                            style={[styles.secondaryBtn, savingVideo && styles.dimmed]}
                            onPress={() => attachVideo("pick")}
                            disabled={savingVideo}
                        >
                            <Text style={styles.secondaryBtnText}>
                                {tActivityCommon("pickFromLibrary")}
                            </Text>
                        </Pressable>

                        {savingVideo ? (
                            <View style={styles.videoStatusRow}>
                                <ActivityIndicator/>
                                <Text style={styles.videoStatusText}>
                                    {tActivityCommon("preparingVideo")}
                                </Text>
                            </View>
                        ) : null}

                        <View style={styles.evidenceRow}>
                            <Text style={styles.statusLabel}>
                                {tActivityCommon("status")}:
                            </Text>
                            <Text style={styles.statusValue}>
                                {hasVideo
                                    ? tActivityCommon("videoAttached")
                                    : tActivityCommon("noVideoYet")}
                            </Text>
                        </View>

                        {hasVideo ? (
                            <Pressable style={styles.dangerBtn} onPress={clearVideo}>
                                <Text style={styles.dangerBtnText}>
                                    {tActivityCommon("removeVideo")}
                                </Text>
                            </Pressable>
                        ) : null}
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{tA1Measurements("part1Title")}</Text>
                    <Text style={styles.help}>{tA1Measurements("part1Help")}</Text>

                    <Text style={styles.label}>{tA1Measurements("tHitLabel")}</Text>
                    <TextInput
                        value={tHitRaw}
                        onChangeText={setTHitRaw}
                        placeholder={tA1Measurements("tHitPlaceholder")}
                        keyboardType="decimal-pad"
                        style={styles.input}
                    />
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{tA1Measurements("part2Title")}</Text>
                    <Text style={styles.help}>{tA1Measurements("part2Help")}</Text>

                    <Text style={styles.label}>{tA1Measurements("tStopLabel")}</Text>
                    <TextInput
                        value={tStopRaw}
                        onChangeText={setTStopRaw}
                        placeholder={tA1Measurements("tStopPlaceholder")}
                        keyboardType="decimal-pad"
                        style={styles.input}
                    />
                </View>

                {targetRequired ? (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>{tA1Measurements("part3Title")}</Text>
                        <Text style={styles.help}>{tA1Measurements("part3Help")}</Text>

                        <View style={styles.choiceRow}>
                            <Pressable
                                style={[styles.choiceBtn, inZone === true && styles.choiceBtnOn]}
                                onPress={() => setInZone(true)}
                            >
                                <Text style={[styles.choiceText, inZone === true && styles.choiceTextOn]}>
                                    {tActivityCommon("yes")}
                                </Text>
                            </Pressable>

                            <Pressable
                                style={[styles.choiceBtn, inZone === false && styles.choiceBtnOn]}
                                onPress={() => setInZone(false)}
                            >
                                <Text style={[styles.choiceText, inZone === false && styles.choiceTextOn]}>
                                    {tActivityCommon("no")}
                                </Text>
                            </Pressable>
                        </View>

                        <Text style={styles.label}>{tA1Measurements("distanceLabel")}</Text>
                        <TextInput
                            value={distanceRaw}
                            onChangeText={setDistanceRaw}
                            placeholder={tA1Measurements("distancePlaceholder")}
                            keyboardType="decimal-pad"
                            style={styles.input}
                        />
                    </View>
                ) : (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>{tA1Measurements("landingAccuracyTitle")}</Text>
                        <Text style={styles.help}>{tA1Measurements("landingAccuracyHelp")}</Text>
                    </View>
                )}

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{tA1Measurements("bounceTitle")}</Text>
                    <Text style={styles.help}>{tA1Measurements("bounceHelp")}</Text>

                    <View style={styles.rowBetween}>
                        <Text style={styles.label}>{tA1Measurements("bounceOccurredLabel")}</Text>
                        <Switch
                            value={bounceOccurred}
                            onValueChange={(value) => {
                                setBounceOccurred(value);
                                if (!value) {
                                    setTUpRaw("");
                                }
                            }}
                        />
                    </View>

                    {bounceOccurred ? (
                        <>
                            <Text style={styles.label}>{tA1Measurements("tUpLabel")}</Text>
                            <TextInput
                                value={tUpRaw}
                                onChangeText={setTUpRaw}
                                placeholder={tA1Measurements("tUpPlaceholder")}
                                keyboardType="decimal-pad"
                                style={styles.input}
                            />
                        </>
                    ) : null}
                </View>

                <Pressable style={styles.primaryBtn} onPress={onCompute}>
                    <Text style={styles.primaryBtnText}>{tA1Measurements("computeResults")}</Text>
                </Pressable>

                <Text style={styles.footerHint}>{tA1Measurements("footerHint")}</Text>

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
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    loadingDraftText: {
        fontWeight: "900",
    },
    title: {
        fontSize: 26,
        fontWeight: "900",
        marginTop: 6,
    },
    sub: {
        marginTop: 8,
        opacity: 0.75,
        lineHeight: 18,
        fontWeight: "800",
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
    label: {
        marginTop: 12,
        fontWeight: "800",
    },
    help: {
        marginTop: 6,
        opacity: 0.7,
        lineHeight: 18,
    },
    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === "ios" ? 12 : 10,
    },
    choiceRow: {
        flexDirection: "row",
        gap: 10,
        marginTop: 12,
    },
    choiceBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
    },
    choiceBtnOn: {
        backgroundColor: "#111",
        borderColor: "#111",
    },
    choiceText: {
        fontWeight: "900",
        opacity: 0.85,
    },
    choiceTextOn: {
        color: "white",
        opacity: 1,
    },
    rowBetween: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {
        color: "white",
        fontWeight: "900",
        fontSize: 16,
    },
    footerHint: {
        marginTop: 10,
        opacity: 0.7,
        lineHeight: 18,
    },
    secondaryBtn: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
    },
    secondaryBtnText: {
        fontWeight: "900",
        opacity: 0.9,
    },
    dangerBtn: {
        backgroundColor: "#ffecec",
        borderWidth: 1,
        borderColor: "#ffbdbd",
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: "center",
    },
    dangerBtnText: {
        fontWeight: "900",
        color: "#b00020",
    },
    evidenceRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 4,
    },
    statusLabel: {
        fontWeight: "900",
    },
    statusValue: {
        opacity: 0.75,
    },
    actionStack: {
        marginTop: 10,
        gap: 10,
    },
    videoStatusRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    videoStatusText: {
        opacity: 0.75,
    },
    dimmed: {
        opacity: 0.6,
    },
    bottomSpacer: {
        height: 30,
    },
});