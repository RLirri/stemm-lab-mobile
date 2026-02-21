import React, {useEffect, useMemo, useState} from "react";
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
    ActivityIndicator,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

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
    const v = raw.trim();
    if (!v) return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
}

function attemptLabel(index: number) {
    return index === 0 ? "Baseline (No parachute)" : `Prototype ${index}`;
}

export default function A1MeasurementsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId, attemptIndex} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);
    const [attempt, setAttempt] = useState<AttemptDraft | null>(null);

    // numeric inputs as strings
    const [tHitRaw, setTHitRaw] = useState<string>("");
    const [tStopRaw, setTStopRaw] = useState<string>("");

    const [inZone, setInZone] = useState<boolean | null>(null);
    const [distanceRaw, setDistanceRaw] = useState<string>("");

    const [bounceOccurred, setBounceOccurred] = useState<boolean>(false);
    const [tUpRaw, setTUpRaw] = useState<string>("");

    const [savingVideo, setSavingVideo] = useState(false);

    useEffect(() => {
        if (!user) return;

        const d = getRunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Your draft session was reset. Please start again.", [
                {text: "OK", onPress: () => navigation.replace("A1SessionSetup", {activityId})},
            ]);
            return;
        }

        const a = d.attempts?.[attemptIndex];
        if (!a) {
            Alert.alert("Attempt missing", "This attempt slot does not exist.", [
                {text: "OK", onPress: () => navigation.goBack()},
            ]);
            return;
        }

        setDraft(d);
        setAttempt(a);
    }, [activityId, attemptIndex, navigation, runId, user]);

    useEffect(() => {
        if (!draft || !attempt) return;

        const m = attempt.measurements;
        setTHitRaw(m?.tHitSec != null ? String(m.tHitSec) : "");
        setTStopRaw(m?.tStopSec != null ? String(m.tStopSec) : "");

        setInZone(typeof m?.inTargetZone === "boolean" ? m.inTargetZone : null);
        setDistanceRaw(m?.distanceFromCenterCm != null ? String(m.distanceFromCenterCm) : "");

        setBounceOccurred(Boolean(m?.bounceOccurred));
        setTUpRaw(m?.bounceTimeToPeakSec != null ? String(m.bounceTimeToPeakSec) : "");
    }, [attempt, draft]);

    const targetRequired = useMemo(() => Boolean(draft?.session.targetZoneEnabled), [draft?.session.targetZoneEnabled]);

    function persistMeasurements(next: AttemptMeasurementsDraft) {
        const updated = updateAttempt(runId, attemptIndex, {measurements: next});
        setDraft(updated);
        setAttempt(updated.attempts[attemptIndex]);
    }

    function validate(): string | null {
        const tHit = toNumberOrUndefined(tHitRaw);
        if (tHit == null || tHit <= 0) return "Time to First Ground Contact (t_hit) must be > 0.";

        const tStop = toNumberOrUndefined(tStopRaw);
        if (tStop == null || tStop < 0) return "Stopping time (t_stop) must be ≥ 0.";

        if (targetRequired && inZone === null) {
            return "Target zone is enabled. Please answer whether it landed in the target zone.";
        }

        if (distanceRaw.trim()) {
            const d = toNumberOrUndefined(distanceRaw);
            if (d == null || d < 0) return "Distance from center must be a non-negative number.";
        }

        if (bounceOccurred) {
            const tUp = toNumberOrUndefined(tUpRaw);
            if (tUp == null || tUp <= 0) return "Bounce is ON. Please enter time to peak after bounce (t_up) > 0.";
        }

        return null;
    }

    function onCompute() {
        if (!draft || !attempt) return;

        const err = validate();
        if (err) {
            Alert.alert("Check fields", err);
            return;
        }

        const next: AttemptMeasurementsDraft = {
            tHitSec: toNumberOrUndefined(tHitRaw),
            tStopSec: toNumberOrUndefined(tStopRaw),
            inTargetZone: targetRequired ? (inZone ?? undefined) : undefined,
            distanceFromCenterCm: distanceRaw.trim() ? toNumberOrUndefined(distanceRaw) : undefined,
            bounceOccurred: bounceOccurred ? true : undefined,
            bounceTimeToPeakSec: bounceOccurred ? toNumberOrUndefined(tUpRaw) : undefined,
        };

        persistMeasurements(next);
        navigation.navigate("A1Result", {activityId, runId, attemptIndex});
    }

    async function attachVideo(kind: "record" | "pick") {
        try {
            if (!draft || !attempt) return;
            setSavingVideo(true);

            const picked =
                kind === "record" ? await recordVideoWithCamera() : await pickVideoFromLibrary();

            if (!picked) return;

            const now = Date.now();
            const updated = updateAttempt(runId, attemptIndex, {
                video: {type: "video", uri: picked.uri, createdAt: now},
            });

            setDraft(updated);
            setAttempt(updated.attempts[attemptIndex]);

            Alert.alert("Video attached ✅", "This video will be uploaded when you submit.");
        } catch (e: any) {
            Alert.alert("Video error", e?.message ?? "Failed to attach video.");
        } finally {
            setSavingVideo(false);
        }
    }

    function clearVideo() {
        if (!draft || !attempt) return;
        const updated = updateAttempt(runId, attemptIndex, {video: undefined});
        setDraft(updated);
        setAttempt(updated.attempts[attemptIndex]);
    }

    if (!user) return null;

    if (!draft || !attempt) {
        return (
            <View style={styles.center}>
                <Text style={{fontWeight: "900"}}>Loading draft...</Text>
            </View>
        );
    }

    const hasVideo = typeof attempt.video?.uri === "string" && attempt.video.uri.length > 0;

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Measurements</Text>
                <Text style={styles.sub}>{attemptLabel(attemptIndex)}</Text>

                {/* Evidence (Video) */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Evidence — Video</Text>
                    <Text style={styles.help}>
                        Attach one video per attempt. Best tested on a real device for recording.
                    </Text>

                    <View style={{marginTop: 10, gap: 10}}>
                        <Pressable
                            style={[styles.secondaryBtn, savingVideo && {opacity: 0.6}]}
                            onPress={() => attachVideo("record")}
                            disabled={savingVideo}
                        >
                            <Text style={styles.secondaryBtnText}>Record Video</Text>
                        </Pressable>

                        <Pressable
                            style={[styles.secondaryBtn, savingVideo && {opacity: 0.6}]}
                            onPress={() => attachVideo("pick")}
                            disabled={savingVideo}
                        >
                            <Text style={styles.secondaryBtnText}>Pick From Library</Text>
                        </Pressable>

                        {savingVideo ? (
                            <View style={{flexDirection: "row", alignItems: "center", gap: 8}}>
                                <ActivityIndicator/>
                                <Text style={{opacity: 0.75}}>Preparing video…</Text>
                            </View>
                        ) : null}

                        <View style={styles.evidenceRow}>
                            <Text style={{fontWeight: "900"}}>Status:</Text>
                            <Text style={{opacity: 0.75}}>{hasVideo ? "Video attached ✅" : "No video yet"}</Text>
                        </View>

                        {hasVideo ? (
                            <Pressable style={styles.dangerBtn} onPress={clearVideo}>
                                <Text style={styles.dangerBtnText}>Remove Video</Text>
                            </Pressable>
                        ) : null}
                    </View>
                </View>

                {/* Flight time */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Part 1 — Flight time</Text>
                    <Text style={styles.help}>Time to First Ground Contact (t_hit), in seconds.</Text>

                    <Text style={styles.label}>t_hit (seconds)</Text>
                    <TextInput
                        value={tHitRaw}
                        onChangeText={setTHitRaw}
                        placeholder="e.g. 1.2"
                        keyboardType="decimal-pad"
                        style={styles.input}
                    />
                </View>

                {/* Stop time */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Part 2 — Stopping time</Text>
                    <Text style={styles.help}>
                        Time from First Contact to Stop Moving (t_stop), in seconds (slow-motion recommended).
                    </Text>

                    <Text style={styles.label}>t_stop (seconds)</Text>
                    <TextInput
                        value={tStopRaw}
                        onChangeText={setTStopRaw}
                        placeholder="e.g. 0.05"
                        keyboardType="decimal-pad"
                        style={styles.input}
                    />
                </View>

                {/* Target zone */}
                {targetRequired ? (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Part 3 — Landing accuracy (target zone)</Text>
                        <Text style={styles.help}>Required because target zone is enabled in Session Setup.</Text>

                        <View style={styles.choiceRow}>
                            <Pressable style={[styles.choiceBtn, inZone === true && styles.choiceBtnOn]}
                                       onPress={() => setInZone(true)}>
                                <Text style={[styles.choiceText, inZone === true && styles.choiceTextOn]}>Yes</Text>
                            </Pressable>
                            <Pressable style={[styles.choiceBtn, inZone === false && styles.choiceBtnOn]}
                                       onPress={() => setInZone(false)}>
                                <Text style={[styles.choiceText, inZone === false && styles.choiceTextOn]}>No</Text>
                            </Pressable>
                        </View>

                        <Text style={styles.label}>Distance from center (cm) (optional)</Text>
                        <TextInput
                            value={distanceRaw}
                            onChangeText={setDistanceRaw}
                            placeholder="e.g. 35"
                            keyboardType="decimal-pad"
                            style={styles.input}
                        />
                    </View>
                ) : (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Landing accuracy</Text>
                        <Text style={styles.help}>Target zone is not enabled. You can skip accuracy scoring for this
                            session.</Text>
                    </View>
                )}

                {/* Bounce */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Bounce (optional)</Text>
                    <Text style={styles.help}>If a bounce occurred, we estimate extra impact using time to peak after
                        bounce.</Text>

                    <View style={styles.rowBetween}>
                        <Text style={styles.label}>Bounce occurred?</Text>
                        <Switch
                            value={bounceOccurred}
                            onValueChange={(v) => {
                                setBounceOccurred(v);
                                if (!v) setTUpRaw("");
                            }}
                        />
                    </View>

                    {bounceOccurred ? (
                        <>
                            <Text style={styles.label}>t_up (seconds) — time to peak after bounce</Text>
                            <TextInput
                                value={tUpRaw}
                                onChangeText={setTUpRaw}
                                placeholder="e.g. 0.15"
                                keyboardType="decimal-pad"
                                style={styles.input}
                            />
                        </>
                    ) : null}
                </View>

                <Pressable style={styles.primaryBtn} onPress={onCompute}>
                    <Text style={styles.primaryBtnText}>Compute Results</Text>
                </Pressable>

                <Text style={styles.footerHint}>
                    Next: Results (computed values + interpretation). Then save attempt and continue.
                </Text>

                <View style={{height: 30}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20},
    center: {flex: 1, alignItems: "center", justifyContent: "center"},

    title: {fontSize: 26, fontWeight: "900", marginTop: 6},
    sub: {marginTop: 8, opacity: 0.75, lineHeight: 18, fontWeight: "800"},

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

    choiceRow: {flexDirection: "row", gap: 10, marginTop: 12},
    choiceBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
    },
    choiceBtnOn: {backgroundColor: "#111", borderColor: "#111"},
    choiceText: {fontWeight: "900", opacity: 0.85},
    choiceTextOn: {color: "white", opacity: 1},

    rowBetween: {flexDirection: "row", alignItems: "center", justifyContent: "space-between"},

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    footerHint: {marginTop: 10, opacity: 0.7, lineHeight: 18},

    secondaryBtn: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900", opacity: 0.9},

    dangerBtn: {
        backgroundColor: "#ffecec",
        borderWidth: 1,
        borderColor: "#ffbdbd",
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: "center",
    },
    dangerBtnText: {fontWeight: "900", color: "#b00020"},

    evidenceRow: {flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4},
});