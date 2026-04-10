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
    createActivity3RunDraft,
    discardActivity3RunDraft,
    getActivity3RunDraft,
    getLatestRecoverableActivity3RunDraft,
    hydrateActivity3RunDraftFromLocalDb,
    updateActivity3Session,
    updateActivity3FanDesign,
    setActivity3SessionVideo,
    validateA3Session,
    type Activity3RunDraft,
    type FanFoldType,
    type SurfaceContext,
} from "../../../store/activity3RunDraftStore";

import {pickVideoFromLibrary, recordVideoWithCamera} from "../../../services/evidenceService";

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
    try {
        const Location = await import("expo-location");
        const res = await Location.requestForegroundPermissionsAsync();
        return res.status === "granted" ? "granted" : "denied";
    } catch {
        return "denied";
    }
}

export default function A3SessionSetupScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;
    const routeRunId = route.params.runId;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);
    const [bootstrapping, setBootstrapping] = useState(true);

    const hasBootstrappedRef = useRef(false);

    // session fields
    const [surface, setSurface] = useState<SurfaceContext | undefined>(undefined);
    const [designCountRaw, setDesignCountRaw] = useState<string>("3");

    const [advancedMode, setAdvancedMode] = useState<boolean>(false);
    const [stiffnessKRaw, setStiffnessKRaw] = useState<string>("");

    const [gpsEnabled, setGpsEnabled] = useState<boolean>(true);
    const [gpsPermission, setGpsPermission] = useState<"unknown" | "granted" | "denied">("unknown");
    const [askingGps, setAskingGps] = useState(false);

    const [attachingVideo, setAttachingVideo] = useState(false);

    useEffect(() => {
        if (!user) return;
        if (hasBootstrappedRef.current) return;

        hasBootstrappedRef.current = true;

        const userId = user.uid;

        async function bootstrap() {
            try {
                setBootstrapping(true);

                if (routeRunId) {
                    const existing = getActivity3RunDraft(routeRunId);
                    if (existing) {
                        setDraft(existing);
                        return;
                    }

                    const hydrated = await hydrateActivity3RunDraftFromLocalDb(routeRunId);
                    if (hydrated) {
                        setDraft(hydrated);
                        navigation.setParams({runId: hydrated.runId});
                        return;
                    }

                    const recreated = createActivity3RunDraft({
                        activityId,
                        createdBy: userId,
                        fanDesignCount: 3,
                        advancedMode: false,
                    });
                    setDraft(recreated);
                    navigation.setParams({runId: recreated.runId});
                    return;
                }

                const recoverable = await getLatestRecoverableActivity3RunDraft({
                    activityId,
                    createdBy: userId,
                });

                if (recoverable) {
                    Alert.alert(
                        "Resume previous draft?",
                        "We found an unfinished Activity 3 draft. Would you like to continue it or start a new session?",
                        [
                            {
                                text: "Start New",
                                style: "destructive",
                                onPress: async () => {
                                    try {
                                        await discardActivity3RunDraft(recoverable.runId);
                                    } catch (error) {
                                        console.error("[A3SessionSetup] Failed to discard old draft", error);
                                    }

                                    const created = createActivity3RunDraft({
                                        activityId,
                                        createdBy: userId,
                                        fanDesignCount: 3,
                                        advancedMode: false,
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

                const created = createActivity3RunDraft({
                    activityId,
                    createdBy: userId,
                    fanDesignCount: 3,
                    advancedMode: false,
                });
                setDraft(created);
                navigation.setParams({runId: created.runId});
            } catch (error) {
                console.error("[A3SessionSetup] Failed to bootstrap draft", error);

                const fallback = createActivity3RunDraft({
                    activityId,
                    createdBy: userId,
                    fanDesignCount: 3,
                    advancedMode: false,
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
                    "You can still run the activity, but submission will be blocked unless GPS is enabled and granted."
                );
            }
        } finally {
            setAskingGps(false);
        }
    }

    async function onAttachSessionVideo(source: "camera" | "library") {
        if (!draft) return;

        try {
            setAttachingVideo(true);

            const picked =
                source === "camera"
                    ? await recordVideoWithCamera()
                    : await pickVideoFromLibrary();

            if (!picked) return;

            const next = setActivity3SessionVideo(draft.runId, {
                uri: picked.uri,
                createdAt: Date.now(),
            });

            setDraft(next);
        } catch (e: any) {
            Alert.alert("Video error", e?.message ?? "Could not attach video.");
        } finally {
            setAttachingVideo(false);
        }
    }

    function onRemoveSessionVideo() {
        if (!draft) return;
        const next = setActivity3SessionVideo(draft.runId, undefined);
        setDraft(next);
    }

    function onUpdateDesign(index: number, patch: any) {
        if (!draft) return;
        try {
            const next = updateActivity3FanDesign(draft.runId, index, patch);
            setDraft(next);
        } catch (e: any) {
            Alert.alert("Design update error", e?.message ?? "Could not update design.");
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

        navigation.navigate("A3Prediction", {activityId, runId: next.runId});
    }

    if (!user) return null;

    if (bootstrapping || !draft) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10, opacity: 0.7}}>Loading draft…</Text>
                <Text style={{marginTop: 4, opacity: 0.6}}>Checking for unfinished session...</Text>
            </View>
        );
    }

    const sessionVideoAttached = !!draft.evidence?.sessionVideo?.uri;

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Session Setup</Text>
                <Text style={styles.sub}>
                    Configure the Hand Fan Challenge. You’ll set design details, predict first, then record bend angles.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Context (optional)</Text>
                    <Text style={styles.help}>Airflow behaves differently on floor vs table.</Text>

                    <Text style={styles.label}>Test surface</Text>
                    <View style={styles.segmentWrap}>
                        {(["table", "floor"] as const).map((v) => {
                            const on = surface === v;
                            return (
                                <Pressable
                                    key={v}
                                    onPress={() => setSurface(v)}
                                    style={[styles.segmentBtn, on && styles.segmentBtnActive]}
                                >
                                    <Text style={[styles.segmentText, on && styles.segmentTextActive]}>{v}</Text>
                                </Pressable>
                            );
                        })}
                        <Pressable
                            onPress={() => setSurface(undefined)}
                            style={[styles.segmentBtn, !surface && styles.segmentBtnActive]}
                        >
                            <Text style={[styles.segmentText, !surface && styles.segmentTextActive]}>Not sure</Text>
                        </Pressable>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Fan Designs</Text>
                    <Text style={styles.help}>
                        Default is 3 designs. Increase only if your team built more versions.
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
                        After changing this, press “Continue” to normalize designs.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Design Details (for airflow)</Text>
                    <Text style={styles.help}>
                        Record what makes each fan different (folds, layers, size). This supports the question:
                        “How does fan design influence air velocity and resulting movement?”
                    </Text>

                    <View style={{marginTop: 10, gap: 12}}>
                        {draft.session.fanDesigns.map((d) => (
                            <View key={d.index} style={styles.designBox}>
                                <Text style={{fontWeight: "900"}}>Design {d.index + 1}</Text>

                                <Text style={styles.label}>Name</Text>
                                <TextInput
                                    value={d.name ?? ""}
                                    onChangeText={(t) => onUpdateDesign(d.index, {name: t})}
                                    placeholder={`Design ${d.index + 1}`}
                                    style={styles.input}
                                />

                                <View style={[styles.rowBetween, {marginTop: 10}]}>
                                    <Text style={styles.label}>Has folds?</Text>
                                    <Switch
                                        value={Boolean(d.hasFolds)}
                                        onValueChange={(v) =>
                                            onUpdateDesign(d.index, {
                                                hasFolds: v,
                                                foldType: v ? d.foldType : undefined,
                                            })
                                        }
                                    />
                                </View>

                                <Text style={styles.label}>Fold type</Text>
                                <View style={styles.segmentWrap}>
                                    {(["flat", "folded", "pleated"] as FanFoldType[]).map((v) => {
                                        const on = (d.foldType ?? "flat") === v;
                                        return (
                                            <Pressable
                                                key={v}
                                                onPress={() => onUpdateDesign(d.index, {
                                                    foldType: v,
                                                    hasFolds: v !== "flat",
                                                })}
                                                style={[styles.segmentBtn, on && styles.segmentBtnActive]}
                                            >
                                                <Text style={[styles.segmentText, on && styles.segmentTextActive]}>
                                                    {v}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                <Text style={styles.label}>Fold count (0–60)</Text>
                                <TextInput
                                    value={d.foldCount == null ? "" : String(d.foldCount)}
                                    onChangeText={(t) =>
                                        onUpdateDesign(d.index, {
                                            foldCount: t
                                                ? clampInt(Number(t.replace(/[^\d]/g, "")), 0, 60)
                                                : undefined,
                                        })
                                    }
                                    placeholder="e.g. 12"
                                    keyboardType="number-pad"
                                    style={styles.input}
                                />

                                <Text style={styles.label}>Layers (1–5)</Text>
                                <TextInput
                                    value={d.layers == null ? "" : String(d.layers)}
                                    onChangeText={(t) =>
                                        onUpdateDesign(d.index, {
                                            layers: t
                                                ? clampInt(Number(t.replace(/[^\d]/g, "")), 1, 5)
                                                : undefined,
                                        })
                                    }
                                    placeholder="e.g. 1"
                                    keyboardType="number-pad"
                                    style={styles.input}
                                />

                                <Text style={styles.label}>Notes (optional)</Text>
                                <TextInput
                                    value={d.notes ?? ""}
                                    onChangeText={(t) => onUpdateDesign(d.index, {notes: t})}
                                    placeholder="e.g., no tape, wider fan, stronger handle…"
                                    style={[styles.input, {height: 90, textAlignVertical: "top"}]}
                                    multiline
                                />
                            </View>
                        ))}
                    </View>
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
                                If unknown, leave blank. You can still compare designs using bend angles.
                            </Text>
                        </>
                    ) : (
                        <Text style={styles.note}>
                            Primary-school view: focus on distances, materials, and bend angles.
                        </Text>
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Session Video (Required for submission)</Text>
                    <Text style={styles.help}>
                        Record one video showing your setup and how you test the designs fairly.
                    </Text>

                    <View style={styles.gpsRow}>
                        <Text style={{fontWeight: "900"}}>Status:</Text>
                        <Text style={{opacity: 0.75}}>
                            {sessionVideoAttached ? "Attached ✅" : "Missing ❌"}
                        </Text>
                    </View>

                    <View style={{flexDirection: "row", gap: 10, marginTop: 12}}>
                        <Pressable
                            style={[styles.secondaryBtn, {flex: 1}, attachingVideo && {opacity: 0.7}]}
                            onPress={() => onAttachSessionVideo("camera")}
                            disabled={attachingVideo}
                        >
                            <Text style={styles.secondaryBtnText}>Record</Text>
                        </Pressable>

                        <Pressable
                            style={[styles.secondaryBtn, {flex: 1}, attachingVideo && {opacity: 0.7}]}
                            onPress={() => onAttachSessionVideo("library")}
                            disabled={attachingVideo}
                        >
                            <Text style={styles.secondaryBtnText}>Pick</Text>
                        </Pressable>
                    </View>

                    {sessionVideoAttached ? (
                        <Pressable style={styles.dangerBtn} onPress={onRemoveSessionVideo}>
                            <Text style={styles.dangerBtnText}>Remove video</Text>
                        </Pressable>
                    ) : null}

                    <Text style={styles.note}>
                        Tip: Keep it short (10–30s). Show distance marking (15/30/45 cm) + the material bending.
                    </Text>
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
                            {gpsPermission === "unknown"
                                ? "Not requested"
                                : gpsPermission === "granted"
                                    ? "Granted ✅"
                                    : "Denied ❌"}
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
                            To submit later: enable location permissions in device settings and try again.
                        </Text>
                    ) : null}
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

    designBox: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
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

    dangerBtn: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#b00020",
        backgroundColor: "white",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    dangerBtnText: {fontWeight: "900", color: "#b00020"},

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