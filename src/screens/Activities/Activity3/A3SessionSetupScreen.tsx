// src/screens/Activities/Activity3/A3SessionSetup.tsx
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
    createActivity3RunDraft,
    getActivity3RunDraft,
    updateActivity3Session,
    validateA3Session,
    type Activity3RunDraft,
    type FanDistanceCm,
    type FanMaterial,
    type SurfaceContext,
} from "../../../store/activity3RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A3SessionSetup">;

function toNumberOrUndefined(raw: string): number | undefined {
    const v = raw.trim();
    if (!v) return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

async function requestGpsPermissionSafe(): Promise<"granted" | "denied"> {
    /**
     * Production-safe:
     * - If expo-location is installed, request permission
     * - If not installed, gracefully deny with a useful message
     */
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Location = await import("expo-location");
        const res = await Location.requestForegroundPermissionsAsync();
        return res.status === "granted" ? "granted" : "denied";
    } catch {
        return "denied";
    }
}

export default function A3SessionSetup({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);

    // form fields
    const [surface, setSurface] = useState<SurfaceContext | undefined>(undefined);
    const [designCountRaw, setDesignCountRaw] = useState<string>("3");

    const [advancedMode, setAdvancedMode] = useState<boolean>(false);
    const [stiffnessKRaw, setStiffnessKRaw] = useState<string>("");

    const [gpsEnabled, setGpsEnabled] = useState<boolean>(true);
    const [gpsPermission, setGpsPermission] = useState<"unknown" | "granted" | "denied">("unknown");
    const [askingGps, setAskingGps] = useState(false);

    // optional: pick defaults for first measurement (nice UX for next screen)
    const [defaultDistance, setDefaultDistance] = useState<FanDistanceCm>(15);
    const [defaultMaterial, setDefaultMaterial] = useState<FanMaterial>("paper");

    useEffect(() => {
        if (!user) return;

        let d = runId ? getActivity3RunDraft(runId) : null;
        if (!d) {
            // Create draft if missing (matches “session expired → recreate” behavior but more user-friendly here)
            d = createActivity3RunDraft({
                activityId,
                createdBy: user.uid,
                fanDesignCount: 3,
                advancedMode: false,
            });
        }
        setDraft(d);
    }, [activityId, runId, user]);

    useEffect(() => {
        if (!draft) return;
        const s = draft.session;

        setSurface(s.surfaceContext);
        setDesignCountRaw(String(s.fanDesignCount));

        setAdvancedMode(Boolean(s.advancedMode));
        setStiffnessKRaw(s.stiffnessK != null ? String(s.stiffnessK) : "");

        setGpsEnabled(Boolean(s.gpsEnabled));
        setGpsPermission(s.gpsPermission);
    }, [draft]);

    const sessionError = useMemo(() => {
        if (!draft) return null;
        // Build a “what would be persisted” view for validation
        const fanDesignCount = clampInt(Number(designCountRaw || "3"), 1, 8);
        const stiffnessK = advancedMode ? toNumberOrUndefined(stiffnessKRaw) : undefined;

        const shadow: Activity3RunDraft = {
            ...draft,
            session: {
                ...draft.session,
                surfaceContext: surface,
                fanDesignCount,
                advancedMode,
                stiffnessK,
                gpsEnabled,
                gpsPermission,
            },
        };

        return validateA3Session(shadow);
    }, [advancedMode, designCountRaw, draft, gpsEnabled, gpsPermission, stiffnessKRaw, surface]);

    function persistSession() {
        if (!draft) return;

        const fanDesignCount = clampInt(Number(designCountRaw || "3"), 1, 8);
        const stiffnessK = advancedMode ? toNumberOrUndefined(stiffnessKRaw) : undefined;

        const next = updateActivity3Session(draft.runId, {
            surfaceContext: surface,
            fanDesignCount,
            advancedMode,
            stiffnessK,
            gpsEnabled,
            gpsPermission,
        });
        setDraft(next);
        return next;
    }

    async function onRequestGps() {
        if (!draft) return;

        try {
            setAskingGps(true);
            const status = await requestGpsPermissionSafe();
            const next = updateActivity3Session(draft.runId, {
                gpsPermission: status === "granted" ? "granted" : "denied",
            });
            setDraft(next);
            setGpsPermission(next.session.gpsPermission);

            if (status !== "granted") {
                Alert.alert(
                    "GPS not granted",
                    "You can still run the activity, but submission will be blocked unless GPS is enabled and granted (per policy)."
                );
            }
        } finally {
            setAskingGps(false);
        }
    }

    function onContinue() {
        if (!user) return;
        if (!draft) return;

        const err = sessionError;
        if (err) {
            Alert.alert("Check setup", err);
            return;
        }

        const next = persistSession();
        if (!next) return;

        // Next screen in your SRS flow: Prediction required before results.
        // (You’ll implement A3PredictionScreen next.)
        navigation.navigate("A3Prediction", {
            activityId,
            runId: next.runId,
            // Optional defaults for next screen(s)
            defaultDistance,
            defaultMaterial,
        } as never);
    }

    if (!user) return null;

    if (!draft) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10, opacity: 0.7}}>Loading draft…</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Measurement Setup</Text>
                <Text style={styles.sub}>
                    Configure the Hand Fan Challenge session. You’ll predict first, then record bend angles for each
                    design.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Context (optional)</Text>
                    <Text style={styles.help}>This helps interpretation (airflow behaves differently on floor vs
                        table).</Text>

                    <Text style={styles.label}>Test surface</Text>
                    <View style={styles.segmentWrap}>
                        {(["table", "floor"] as const).map((v) => {
                            const on = surface === v;
                            return (
                                <Pressable key={v} onPress={() => setSurface(v)}
                                           style={[styles.segmentBtn, on && styles.segmentBtnActive]}>
                                    <Text style={[styles.segmentText, on && styles.segmentTextActive]}>{v}</Text>
                                </Pressable>
                            );
                        })}
                        <Pressable onPress={() => setSurface(undefined)}
                                   style={[styles.segmentBtn, !surface && styles.segmentBtnActive]}>
                            <Text style={[styles.segmentText, !surface && styles.segmentTextActive]}>Not sure</Text>
                        </Pressable>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Fan Designs</Text>
                    <Text style={styles.help}>
                        Default is 3 designs. You can increase if your team built more versions.
                    </Text>

                    <Text style={styles.label}>Number of designs (1–8)</Text>
                    <TextInput
                        value={designCountRaw}
                        onChangeText={(t) => setDesignCountRaw(t.replace(/[^\d]/g, ""))}
                        placeholder="3"
                        keyboardType="number-pad"
                        style={styles.input}
                        maxLength={1}
                    />

                    <Text style={styles.note}>
                        Tip: Keep design count realistic — your results view will compare averages per design.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Advanced Mode</Text>
                    <Text style={styles.help}>
                        Turn ON for high-school view. Enables stiffness coefficient <Text style={styles.bold}>k</Text>.
                    </Text>

                    <View style={styles.rowBetween}>
                        <Text style={styles.label}>Advanced mode</Text>
                        <Switch value={advancedMode} onValueChange={setAdvancedMode}/>
                    </View>

                    {advancedMode ? (
                        <>
                            <Text style={styles.label}>Stiffness coefficient k (optional)</Text>
                            <TextInput
                                value={stiffnessKRaw}
                                onChangeText={setStiffnessKRaw}
                                placeholder="e.g. 0.8"
                                keyboardType="decimal-pad"
                                style={styles.input}
                            />
                            <Text style={styles.note}>
                                If unknown, leave blank. You can still record bend angles and compare designs.
                            </Text>
                        </>
                    ) : (
                        <Text style={styles.note}>Primary-school view: focus on distances, materials, and bend
                            angles.</Text>
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>GPS (Required for submission)</Text>
                    <Text style={styles.help}>
                        Policy: session can run without GPS, but submission will be blocked until GPS is granted.
                    </Text>

                    <View style={styles.rowBetween}>
                        <Text style={styles.label}>Enable GPS for this run</Text>
                        <Switch value={gpsEnabled} onValueChange={setGpsEnabled}/>
                    </View>

                    <View style={styles.gpsRow}>
                        <Text style={{fontWeight: "900"}}>Permission:</Text>
                        <Text style={{opacity: 0.75}}>
                            {gpsPermission === "unknown" ? "Not requested" : gpsPermission === "granted" ? "Granted ✅" : "Denied ❌"}
                        </Text>
                    </View>

                    <Pressable
                        style={[styles.secondaryBtn, askingGps && {opacity: 0.7}]}
                        onPress={onRequestGps}
                        disabled={askingGps}
                    >
                        {askingGps ? (
                            <View style={{flexDirection: "row", alignItems: "center", gap: 10}}>
                                <ActivityIndicator/>
                                <Text style={styles.secondaryBtnText}>Requesting…</Text>
                            </View>
                        ) : (
                            <Text style={styles.secondaryBtnText}>Request GPS Permission</Text>
                        )}
                    </Pressable>

                    {gpsPermission === "denied" ? (
                        <Text style={styles.note}>
                            If you want to submit later, enable location permissions in device settings and try again.
                        </Text>
                    ) : null}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Defaults for first measurement</Text>
                    <Text style={styles.help}>
                        These defaults help the next screen start faster. You can change per measurement later.
                    </Text>

                    <Text style={styles.label}>Distance</Text>
                    <View style={styles.segmentWrap}>
                        {([15, 30, 45] as const).map((v) => {
                            const on = defaultDistance === v;
                            return (
                                <Pressable key={v} onPress={() => setDefaultDistance(v)}
                                           style={[styles.segmentBtn, on && styles.segmentBtnActive]}>
                                    <Text style={[styles.segmentText, on && styles.segmentTextActive]}>{v} cm</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.label}>Material</Text>
                    <View style={styles.segmentWrap}>
                        {(["paper", "cardboard"] as const).map((v) => {
                            const on = defaultMaterial === v;
                            return (
                                <Pressable key={v} onPress={() => setDefaultMaterial(v)}
                                           style={[styles.segmentBtn, on && styles.segmentBtnActive]}>
                                    <Text style={[styles.segmentText, on && styles.segmentTextActive]}>{v}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.note}>
                        Reminder: Keep stable, don’t hit others. Follow the distance rule carefully (15/30/45 cm).
                    </Text>
                </View>

                {sessionError ? (
                    <View style={styles.errorCard}>
                        <Text style={{fontWeight: "900"}}>Fix before continuing</Text>
                        <Text style={{marginTop: 6, opacity: 0.8}}>{sessionError}</Text>
                    </View>
                ) : null}

                <Pressable style={styles.primaryBtn} onPress={onContinue}>
                    <Text style={styles.primaryBtnText}>Continue to Prediction</Text>
                </Pressable>

                <Text style={styles.footerHint}>Next: Prediction → Measurements → Results → Reflection & Submit.</Text>

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
    note: {marginTop: 10, opacity: 0.75, lineHeight: 18},
    bold: {fontWeight: "900"},

    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === "ios" ? 12 : 10,
    },

    segmentWrap: {
        marginTop: 10,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    segmentBtn: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    segmentBtnActive: {backgroundColor: "#111", borderColor: "#111"},
    segmentText: {fontWeight: "900", opacity: 0.85, textTransform: "capitalize"},
    segmentTextActive: {color: "white", opacity: 1},

    rowBetween: {flexDirection: "row", alignItems: "center", justifyContent: "space-between"},
    gpsRow: {marginTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center"},

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    secondaryBtn: {
        marginTop: 12,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900", opacity: 0.9},

    errorCard: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#b00020",
        backgroundColor: "#fff5f5",
        borderRadius: 14,
        padding: 14,
    },

    footerHint: {marginTop: 10, opacity: 0.7, lineHeight: 18},
});