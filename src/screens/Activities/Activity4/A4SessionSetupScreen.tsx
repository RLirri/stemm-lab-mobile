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
    createActivity4RunDraft,
    discardActivity4RunDraft,
    getActivity4RunDraft,
    getLatestRecoverableActivity4RunDraft,
    hydrateActivity4RunDraftFromLocalDb,
    updateActivity4Session,
    updateActivity4Design,
    validateA4Session,
    type Activity4RunDraft,
    type A4MaterialContext,
} from "../../../store/activity4RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A4SessionSetup">;

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

function formatGeoText(geo: Activity4RunDraft["session"]["geo"] | undefined): string {
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

async function getCurrentGeoSafe(): Promise<
    | { lat: number; lng: number; accuracyM?: number }
    | null
> {
    try {
        const Location = await import("expo-location");

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
            return null;
        }

        const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });

        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;

        const acc = pos?.coords?.accuracy ?? undefined;
        const accuracyM = typeof acc === "number" && Number.isFinite(acc) ? acc : undefined;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        return {
            lat,
            lng,
            accuracyM,
        };
    } catch {
        return null;
    }
}

export default function A4SessionSetupScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;
    const routeRunId = route.params.runId;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);
    const [bootstrapping, setBootstrapping] = useState(true);

    const hasBootstrappedRef = useRef(false);

    // session fields
    const [surface, setSurface] = useState<A4MaterialContext | undefined>(undefined);
    const [designCountRaw, setDesignCountRaw] = useState<string>("3");

    const [gpsEnabled, setGpsEnabled] = useState<boolean>(true);
    const [gpsPermission, setGpsPermission] = useState<"unknown" | "granted" | "denied">("unknown");
    const [askingGps, setAskingGps] = useState(false);

    const geo = draft?.session.geo;
    const geoCaptured =
        !!geo && isFiniteNumber(geo.lat) && isFiniteNumber(geo.lng);

    const [expanded, setExpanded] = useState<Record<number, boolean>>({0: true});

    useEffect(() => {
        if (!user) return;
        if (hasBootstrappedRef.current) return;

        hasBootstrappedRef.current = true;

        const userId = user.uid;

        async function bootstrap() {
            try {
                setBootstrapping(true);

                if (routeRunId) {
                    const existing = getActivity4RunDraft(routeRunId);
                    if (existing) {
                        setDraft(existing);
                        return;
                    }

                    const hydrated = await hydrateActivity4RunDraftFromLocalDb(routeRunId);
                    if (hydrated) {
                        setDraft(hydrated);
                        navigation.setParams({runId: hydrated.runId});
                        return;
                    }

                    const recreated = createActivity4RunDraft({
                        activityId,
                        createdBy: userId,
                        designCount: 3,
                        gpsEnabled: true,
                    });
                    setDraft(recreated);
                    navigation.setParams({runId: recreated.runId});
                    return;
                }

                const recoverable = await getLatestRecoverableActivity4RunDraft({
                    activityId,
                    createdBy: userId,
                });

                if (recoverable) {
                    Alert.alert(
                        "Resume previous draft?",
                        "We found an unfinished Activity 4 draft. Would you like to continue it or start a new session?",
                        [
                            {
                                text: "Start New",
                                style: "destructive",
                                onPress: async () => {
                                    try {
                                        await discardActivity4RunDraft(recoverable.runId);
                                    } catch (error) {
                                        console.error("[A4SessionSetup] Failed to discard old draft", error);
                                    }

                                    const created = createActivity4RunDraft({
                                        activityId,
                                        createdBy: userId,
                                        designCount: 3,
                                        gpsEnabled: true,
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

                const created = createActivity4RunDraft({
                    activityId,
                    createdBy: userId,
                    designCount: 3,
                    gpsEnabled: true,
                });
                setDraft(created);
                navigation.setParams({runId: created.runId});
            } catch (error) {
                console.error("[A4SessionSetup] Failed to bootstrap draft", error);

                const fallback = createActivity4RunDraft({
                    activityId,
                    createdBy: userId,
                    designCount: 3,
                    gpsEnabled: true,
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

        setSurface(draft.session.surfaceContext);
        setDesignCountRaw(String(draft.session.designCount));

        setGpsEnabled(Boolean(draft.session.gpsEnabled));
        setGpsPermission(draft.session.gpsPermission);

        const nextExp: Record<number, boolean> = {};
        for (let i = 0; i < Math.min(3, draft.session.designCount); i++) nextExp[i] = true;
        setExpanded((prev) => ({...nextExp, ...prev}));
    }, [draft]);

    useEffect(() => {
        if (!draft) return;

        if (gpsEnabled === false) {
            const next = updateActivity4Session(draft.runId, {
                gpsEnabled: false,
                geo: undefined,
            });
            setDraft(next);
        }

        if (gpsEnabled === true) {
            const next = updateActivity4Session(draft.runId, {gpsEnabled: true});
            setDraft(next);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gpsEnabled]);

    const sessionError = useMemo(() => {
        if (!draft) return null;

        const designCount = clampInt(Number(designCountRaw || "3"), 3, 8);

        const shadow: Activity4RunDraft = {
            ...draft,
            session: {
                ...draft.session,
                surfaceContext: surface,
                designCount,
                gpsEnabled,
                gpsPermission,
            },
        };

        return validateA4Session(shadow);
    }, [designCountRaw, draft, gpsEnabled, gpsPermission, surface]);

    function persistSession(): Activity4RunDraft | null {
        if (!draft) return null;

        const designCount = clampInt(Number(designCountRaw || "3"), 3, 8);

        const next = updateActivity4Session(draft.runId, {
            surfaceContext: surface,
            designCount,
            gpsEnabled,
            gpsPermission,
        });

        setDraft(next);
        return next;
    }

    async function onRequestGpsPermissionOnly() {
        if (!draft) return;

        if (!gpsEnabled) {
            Alert.alert("GPS is off", "Enable GPS first if you want to request permission.");
            return;
        }

        try {
            setAskingGps(true);
            const status = await requestGpsPermissionSafe();

            const next = updateActivity4Session(draft.runId, {
                gpsPermission: status,
            });

            setDraft(next);
            setGpsPermission(next.session.gpsPermission);

            if (status !== "granted") {
                Alert.alert(
                    "GPS not granted",
                    "You can still run the activity, but submission will be blocked unless GPS is enabled, granted, and a coordinate is captured."
                );
            }
        } finally {
            setAskingGps(false);
        }
    }

    async function onCaptureLocation() {
        if (!draft) return;

        if (!gpsEnabled) {
            Alert.alert("GPS is off", "Enable GPS first, then capture location.");
            return;
        }

        try {
            setAskingGps(true);

            let status = gpsPermission;
            if (status === "unknown" || status === "denied") {
                status = await requestGpsPermissionSafe();
                const nextPermission = updateActivity4Session(draft.runId, {gpsPermission: status});
                setDraft(nextPermission);
                setGpsPermission(status);
            }

            if (status !== "granted") {
                Alert.alert(
                    "Permission denied",
                    "Location permission is required to capture coordinates. Please enable it in your device settings."
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

            const next = updateActivity4Session(draft.runId, {
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
            setAskingGps(false);
        }
    }

    function onContinue() {
        if (!user || !draft) return;

        if (sessionError) {
            Alert.alert("Check setup", sessionError);
            return;
        }

        const next = persistSession();
        if (!next) return;

        navigation.navigate("A4Prediction", {activityId, runId: next.runId});
    }

    function toggleExpanded(i: number) {
        setExpanded((prev) => ({...prev, [i]: !prev[i]}));
    }

    function onDesignFieldChange(
        designIndex: number,
        patch: { name?: string; foldCount?: number; pillarCount?: number; layers?: number; notes?: string }
    ) {
        if (!draft) return;

        const next = updateActivity4Design(draft.runId, designIndex, patch);
        setDraft(next);
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

    const designs = draft.session.designs ?? [];

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Session Setup</Text>
                <Text style={styles.sub}>
                    Configure your earthquake test session. Build ≥3 designs, predict first, then measure vibration
                    movement.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Material Context</Text>
                    <Text style={styles.help}>Material designs affect vibration transfer (paper vs plastic).</Text>

                    <Text style={styles.label}>Test material</Text>
                    <View style={styles.segmentWrap}>
                        {(["paper", "plastic"] as const).map((v) => {
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
                    <Text style={styles.cardTitle}>Designs</Text>
                    <Text style={styles.help}>Minimum 3 designs required for comparison.</Text>

                    <Text style={styles.label}>Number of designs (3–8)</Text>
                    <TextInput
                        value={designCountRaw}
                        onChangeText={(t) => setDesignCountRaw(digitsOnly(t))}
                        placeholder="3"
                        keyboardType="number-pad"
                        style={styles.input}
                        maxLength={1}
                    />

                    <Text style={styles.note}>
                        Tip: Keep it realistic — you’ll run a 10-second vibration test for each design.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Design Builder</Text>
                    <Text style={styles.help}>
                        Record your structure parameters so your results and reflection are meaningful.
                    </Text>

                    {designs.map((d, i) => {
                        const isOpen = Boolean(expanded[i]);

                        return (
                            <View key={i} style={styles.designCard}>
                                <Pressable onPress={() => toggleExpanded(i)} style={styles.designHeader}>
                                    <View style={{flex: 1}}>
                                        <Text style={styles.designTitle}>
                                            {d.name?.trim() ? d.name : `Design ${i + 1}`}
                                        </Text>
                                        <Text style={styles.designMeta}>
                                            Folds: {d.foldCount ?? "—"} • Pillars: {d.pillarCount ?? "—"} •
                                            Layers: {d.layers ?? "—"}
                                        </Text>
                                    </View>
                                    <Text style={styles.chev}>{isOpen ? "▾" : "▸"}</Text>
                                </Pressable>

                                {isOpen ? (
                                    <View style={{marginTop: 10}}>
                                        <Text style={styles.label}>Design name</Text>
                                        <TextInput
                                            value={d.name ?? ""}
                                            onChangeText={(t) => onDesignFieldChange(i, {name: t})}
                                            placeholder={`Design ${i + 1}`}
                                            style={styles.input}
                                        />

                                        <View style={styles.grid}>
                                            <View style={styles.gridCol}>
                                                <Text style={styles.label}>Fold count</Text>
                                                <TextInput
                                                    value={d.foldCount == null ? "" : String(d.foldCount)}
                                                    onChangeText={(t) =>
                                                        onDesignFieldChange(i, {
                                                            foldCount: clampInt(Number(digitsOnly(t) || "0"), 0, 60),
                                                        })
                                                    }
                                                    placeholder="e.g. 10"
                                                    keyboardType="number-pad"
                                                    style={styles.input}
                                                />
                                                <Text style={styles.noteSmall}>0–60 (paper/cardboard folds)</Text>
                                            </View>

                                            <View style={styles.gridCol}>
                                                <Text style={styles.label}>Pillar count</Text>
                                                <TextInput
                                                    value={d.pillarCount == null ? "" : String(d.pillarCount)}
                                                    onChangeText={(t) =>
                                                        onDesignFieldChange(i, {
                                                            pillarCount: clampInt(Number(digitsOnly(t) || "0"), 0, 30),
                                                        })
                                                    }
                                                    placeholder="e.g. 4"
                                                    keyboardType="number-pad"
                                                    style={styles.input}
                                                />
                                                <Text style={styles.noteSmall}>0–30 (cups/paper pillars)</Text>
                                            </View>
                                        </View>

                                        <Text style={styles.label}>Layers (optional)</Text>
                                        <TextInput
                                            value={d.layers == null ? "" : String(d.layers)}
                                            onChangeText={(t) =>
                                                onDesignFieldChange(i, {
                                                    layers: clampInt(Number(digitsOnly(t) || "1"), 1, 10),
                                                })
                                            }
                                            placeholder="e.g. 2"
                                            keyboardType="number-pad"
                                            style={styles.input}
                                        />

                                        <Text style={styles.label}>Notes (optional)</Text>
                                        <TextInput
                                            value={d.notes ?? ""}
                                            onChangeText={(t) => onDesignFieldChange(i, {notes: t})}
                                            placeholder="e.g. thicker base, wider pillars, extra tape..."
                                            style={[styles.input, {height: 90, textAlignVertical: "top"}]}
                                            multiline
                                        />
                                    </View>
                                ) : null}
                            </View>
                        );
                    })}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>GPS (Required for submission)</Text>
                    <Text style={styles.help}>
                        You can run without GPS, but submission will be blocked unless GPS is enabled, granted, and a
                        coordinate is captured.
                    </Text>

                    <View style={styles.rowBetween}>
                        <Text style={styles.label}>Enable GPS</Text>
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

                    <View style={styles.gpsRow}>
                        <Text style={{fontWeight: "900"}}>Coordinate:</Text>
                        <Text style={{opacity: 0.75}}>
                            {!gpsEnabled ? "GPS off" : geoCaptured ? "Captured ✅" : "Not captured yet"}
                        </Text>
                    </View>

                    <View style={styles.badgeRow}>
                        <Text style={styles.badgeLabel}>Saved coordinate</Text>
                        <View style={[styles.badge, geoCaptured ? styles.badgeYes : styles.badgeNo]}>
                            <Text style={styles.badgeText}>{formatGeoText(draft.session.geo)}</Text>
                        </View>
                    </View>

                    <Pressable
                        style={[styles.secondaryBtn, askingGps && {opacity: 0.7}]}
                        onPress={onRequestGpsPermissionOnly}
                        disabled={askingGps}
                    >
                        {askingGps ? (
                            <View style={{flexDirection: "row", alignItems: "center", gap: 10}}>
                                <ActivityIndicator/>
                                <Text style={styles.secondaryBtnText}>Processing…</Text>
                            </View>
                        ) : (
                            <Text style={styles.secondaryBtnText}>Request GPS Permission</Text>
                        )}
                    </Pressable>

                    <Pressable
                        style={[styles.secondaryBtn, askingGps && {opacity: 0.7}]}
                        onPress={onCaptureLocation}
                        disabled={askingGps || !gpsEnabled}
                    >
                        {askingGps ? (
                            <View style={{flexDirection: "row", alignItems: "center", gap: 10}}>
                                <ActivityIndicator/>
                                <Text style={styles.secondaryBtnText}>Capturing…</Text>
                            </View>
                        ) : (
                            <Text style={styles.secondaryBtnText}>
                                {geoCaptured ? "Refresh Location" : "Capture Location"}
                            </Text>
                        )}
                    </Pressable>

                    {gpsPermission === "denied" ? (
                        <Text style={styles.note}>
                            Enable location permissions in device settings, then try again.
                        </Text>
                    ) : null}

                    {!gpsEnabled ? (
                        <Text style={styles.note}>
                            GPS is off. Turn it on if you want to capture coordinates for submission.
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
    noteSmall: {marginTop: 6, opacity: 0.7, fontSize: 12, lineHeight: 16},

    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === "ios" ? 12 : 10,
    },

    segmentWrap: {marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8},
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

    designCard: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#e8e8e8",
        borderRadius: 14,
        backgroundColor: "white",
        padding: 12,
    },
    designHeader: {flexDirection: "row", alignItems: "center"},
    designTitle: {fontWeight: "900", fontSize: 14},
    designMeta: {marginTop: 4, opacity: 0.7, fontSize: 12},
    chev: {fontSize: 18, fontWeight: "900", opacity: 0.7, paddingLeft: 10},

    grid: {flexDirection: "row", gap: 12},
    gridCol: {flex: 1},

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

    badgeRow: {marginTop: 12, gap: 8},
    badgeLabel: {fontWeight: "800", opacity: 0.9},
    badge: {borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10},
    badgeYes: {backgroundColor: "#111"},
    badgeNo: {backgroundColor: "#777"},
    badgeText: {color: "white", fontWeight: "900"},
});