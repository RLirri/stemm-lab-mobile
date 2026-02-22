import React, {useEffect, useState} from "react";
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
    createActivity2RunDraft,
    getActivity2RunDraft,
    updateActivity2Session,
    type Activity2RunDraft,
} from "../../../store/activity2RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A2SessionSetup">;

function normalizeLabel(x: string): string | undefined {
    const s = x.trim();
    return s.length ? s : undefined;
}

export default function A2SessionSetupScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;

    const [runId, setRunId] = useState<string | null>(route.params.runId ?? null);
    const [draft, setDraft] = useState<Activity2RunDraft | null>(null);

    // Form fields
    const [sessionLabel, setSessionLabel] = useState<string>("");
    const [gpsEnabled, setGpsEnabled] = useState<boolean>(true);

    useEffect(() => {
        if (!user) return;

        const existingId = route.params.runId;

        // Case A: route has runId -> try load
        if (existingId) {
            const existing = getActivity2RunDraft(existingId);
            if (existing) {
                setRunId(existingId);
                setDraft(existing);
                return;
            }

            // Store reset: recreate and replace params
            const recreated = createActivity2RunDraft(activityId, user.uid);
            setRunId(recreated.runId);
            setDraft(recreated);
            navigation.setParams({runId: recreated.runId});
            return;
        }

        // Case B: no runId -> create new
        const created = createActivity2RunDraft(activityId, user.uid);
        setRunId(created.runId);
        setDraft(created);
        navigation.setParams({runId: created.runId});
    }, [activityId, navigation, route.params.runId, user]);

    useEffect(() => {
        if (!draft) return;

        // hydrate UI from draft
        setSessionLabel(draft.session.sessionLabel ?? "");
        setGpsEnabled(Boolean(draft.session.gpsEnabled));
    }, [draft]);

    function persistSessionPatch(patch: Partial<Activity2RunDraft["session"]>) {
        if (!runId) return;
        const next = updateActivity2Session(runId, patch);
        setDraft(next);
    }

    function validateBeforeContinue(): { ok: true } | { ok: false; message: string } {
        // Label is optional, but strongly recommended (helps leaderboard / class sessions)
        // We keep it optional per your spec; enforce only max length.
        const label = sessionLabel.trim();
        if (label.length > 60) {
            return {ok: false, message: "Session label is too long. Please keep it under 60 characters."};
        }

        return {ok: true};
    }

    function onContinue() {
        if (!user) return;
        if (!runId || !draft) return;

        const v = validateBeforeContinue();
        if (!v.ok) {
            Alert.alert("Check fields", v.message);
            return;
        }

        // Persist session setup
        persistSessionPatch({
            sessionLabel: normalizeLabel(sessionLabel),
            gpsEnabled,
        });

        // Next screen (we’ll build next): Prediction
        navigation.navigate("A2Prediction", {activityId, runId});
    }

    if (!user) return null;

    if (!draft) {
        return (
            <View style={styles.center}>
                <Text style={{fontWeight: "900"}}>Loading draft…</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Session Setup</Text>
                <Text style={styles.sub}>
                    Set a session label and choose whether GPS is enabled. GPS helps you map loud vs quiet zones.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Session Label</Text>
                    <Text style={styles.help}>
                        Optional but recommended (e.g., “Classroom A – front row”, “Library corner”, “Week 3 lab”).
                    </Text>

                    <Text style={styles.label}>Label</Text>
                    <TextInput
                        value={sessionLabel}
                        onChangeText={setSessionLabel}
                        placeholder="e.g. Week 3 — Classroom 210"
                        style={styles.input}
                        maxLength={60}
                    />

                    <Text style={styles.note}>
                        Tip: use labels to compare different locations or times.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>GPS</Text>
                    <Text style={styles.help}>
                        If enabled, each measurement can store coordinates and show up on the map. You can still
                        continue without GPS.
                    </Text>

                    <View style={styles.rowBetween}>
                        <View style={{flex: 1}}>
                            <Text style={styles.label}>Enable GPS tagging</Text>
                            <Text style={styles.helpSmall}>
                                Recommended for “loud vs quiet zone” mapping.
                            </Text>
                        </View>
                        <Switch
                            value={gpsEnabled}
                            onValueChange={(v) => {
                                setGpsEnabled(v);
                            }}
                        />
                    </View>

                    {!gpsEnabled ? (
                        <View style={styles.warningBox}>
                            <Text style={styles.warningTitle}>GPS disabled</Text>
                            <Text style={styles.warningText}>
                                Map view will still work, but pins will show “No location” and filtering by location
                                won’t be meaningful.
                            </Text>
                        </View>
                    ) : null}
                </View>

                <Pressable style={styles.primaryBtn} onPress={onContinue}>
                    <Text style={styles.primaryBtnText}>Continue</Text>
                </Pressable>

                <Text style={styles.footerHint}>
                    Next: Prediction → Measurement loop (min 3 actions) → Map → Results → Reflection & Submit.
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
    helpSmall: {marginTop: 4, opacity: 0.65, lineHeight: 18},

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

    note: {marginTop: 10, opacity: 0.75, lineHeight: 18},

    warningBox: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    warningTitle: {fontWeight: "900"},
    warningText: {marginTop: 6, opacity: 0.75, lineHeight: 18},

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    footerHint: {marginTop: 10, opacity: 0.7, lineHeight: 18},
});