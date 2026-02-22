import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";
import {useFocusEffect} from "@react-navigation/native";
import MapView, {Marker, PROVIDER_DEFAULT, type Region} from "react-native-maps";
import * as Location from "expo-location";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";

import {getActivity2RunDraft, type Activity2RunDraft, type A2GpsPoint} from "../../../store/activity2RunDraftStore";

import {SOUND_RISK_BANDS, type SoundRiskCategory} from "../../../services/scoringService";

type Props = NativeStackScreenProps<AppStackParamList, "A2Map">;

type RiskFilter = SoundRiskCategory | "ALL";
type ActionFilter = string | "ALL";

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function hasGps(gps: unknown): gps is A2GpsPoint {
    if (!gps || typeof gps !== "object") return false;
    const g = gps as any;
    return isFiniteNumber(g.lat) && isFiniteNumber(g.lng);
}

function safeRegionFromPoints(points: Array<{ lat: number; lng: number }>): Region {
    const avgLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
    const avgLng = points.reduce((s, p) => s + p.lng, 0) / points.length;

    return {
        latitude: avgLat,
        longitude: avgLng,
        latitudeDelta: 0.0025,
        longitudeDelta: 0.0025,
    };
}

function riskToPinColor(risk?: SoundRiskCategory): string | undefined {
    switch (risk) {
        case "NO_RISK":
        case "SAFE":
            return "green";
        case "FATIGUE":
        case "POSSIBLE_DAMAGE":
            return "orange";
        case "LIKELY_DAMAGE":
        case "SERIOUS_MINUTES":
            return "red";
        case "PAINFUL_IMMEDIATE":
        case "SEVERE_IMMEDIATE":
        case "INSTANT_PERMANENT":
            return "purple";
        default:
            return undefined;
    }
}

export default function A2MapScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity2RunDraft | null>(null);

    const [validOnly, setValidOnly] = useState<boolean>(true);
    const [riskFilter, setRiskFilter] = useState<RiskFilter>("ALL");
    const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");

    const [gpsPermission, setGpsPermission] = useState<"unknown" | "granted" | "denied">("unknown");
    const [locationServicesEnabled, setLocationServicesEnabled] = useState<boolean | null>(null);

    const mapRef = useRef<MapView | null>(null);

    const refreshDraft = useCallback(() => {
        const d = getActivity2RunDraft(runId);
        setDraft(d ?? null);
    }, [runId]);

    // Load draft on mount
    useEffect(() => {
        if (!user) return;

        const d = getActivity2RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Please restart the activity.");
            navigation.replace("A2SessionSetup", {activityId});
            return;
        }
        setDraft(d);
    }, [activityId, navigation, runId, user]);

    // Critical fix: refresh every time this screen is focused
    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            refreshDraft();
        }, [refreshDraft, user])
    );

    const gpsEnabled = Boolean(draft?.session?.gpsEnabled);

    // diagnostics for permission + services
    const refreshGpsDiagnostics = useCallback(async () => {
        if (!gpsEnabled) {
            setGpsPermission("unknown");
            setLocationServicesEnabled(null);
            return;
        }

        try {
            const servicesOn = await Location.hasServicesEnabledAsync();
            setLocationServicesEnabled(servicesOn);

            const perm = await Location.getForegroundPermissionsAsync();
            setGpsPermission(perm.status === "granted" ? "granted" : "denied");
        } catch {
            setLocationServicesEnabled(null);
            setGpsPermission("unknown");
        }
    }, [gpsEnabled]);

    useEffect(() => {
        void refreshGpsDiagnostics();
    }, [refreshGpsDiagnostics]);

    const actionOptions = useMemo<string[]>(() => {
        if (!draft) return [];
        const labels = draft.actions
            .map((a) => (typeof a.actionLabel === "string" ? a.actionLabel.trim() : ""))
            .filter((x) => x.length > 0);
        return Array.from(new Set(labels));
    }, [draft]);

    const riskOptions = useMemo<Array<{ key: SoundRiskCategory; label: string }>>(() => {
        const seen = new Set<string>();
        const result: Array<{ key: SoundRiskCategory; label: string }> = [];
        for (const b of SOUND_RISK_BANDS) {
            if (seen.has(b.category)) continue;
            seen.add(b.category);
            result.push({key: b.category, label: b.label});
        }
        return result;
    }, []);

    const filtered = useMemo(() => {
        if (!draft) return [];
        return draft.actions.filter((a) => {
            if (validOnly && a.isValid !== true) return false;
            if (riskFilter !== "ALL" && a.riskCategory !== riskFilter) return false;
            if (actionFilter !== "ALL" && (a.actionLabel ?? "").trim() !== actionFilter) return false;
            return true;
        });
    }, [actionFilter, draft, riskFilter, validOnly]);

    const points = useMemo(() => {
        return filtered
            .map((a) => a.gps)
            .filter(hasGps)
            .map((gps) => ({lat: gps.lat, lng: gps.lng}));
    }, [filtered]);

    const initialRegion = useMemo<Region | null>(() => {
        if (!points.length) return null;
        return safeRegionFromPoints(points);
    }, [points]);

    const stats = useMemo(() => {
        const total = draft?.actions.length ?? 0;
        const valid = draft?.actions.filter((a) => a.isValid).length ?? 0;
        const gpsCount = draft?.actions.filter((a) => hasGps(a.gps)).length ?? 0;
        const filteredGps = points.length;
        return {total, valid, gpsCount, filteredGps};
    }, [draft, points.length]);

    const hasAnyGps = useMemo(() => (draft ? draft.actions.some((a) => hasGps(a.gps)) : false), [draft]);

    // Optional: auto-fit when points change
    useEffect(() => {
        if (!mapRef.current) return;
        if (!points.length) return;

        // fitToCoordinates works best when you have >= 2 coords
        if (points.length >= 2) {
            mapRef.current.fitToCoordinates(
                points.map((p) => ({latitude: p.lat, longitude: p.lng})),
                {edgePadding: {top: 60, right: 60, bottom: 60, left: 60}, animated: true}
            );
        }
    }, [points]);

    function onContinue() {
        navigation.navigate("A2Results", {activityId, runId});
    }

    function onBackToMeasurements() {
        navigation.navigate("A2Measurement", {activityId, runId});
    }

    if (!user) return null;
    if (!draft) return null;

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Map View</Text>
            <Text style={styles.sub}>Pins show where each sound was recorded. Use filters to compare zones.</Text>

            {/* Diagnostics + Fix actions */}
            {!gpsEnabled ? (
                <View style={styles.warnCard}>
                    <Text style={styles.warnTitle}>GPS is OFF for this session</Text>
                    <Text style={styles.warnBody}>
                        You can still record sound levels, but the map cannot place pins without location.
                    </Text>
                    <Pressable style={styles.secondaryBtn}
                               onPress={() => navigation.navigate("A2SessionSetup", {activityId, runId})}>
                        <Text style={styles.secondaryBtnText}>Go to Session Setup</Text>
                    </Pressable>
                </View>
            ) : null}

            {gpsEnabled && !hasAnyGps ? (
                <View style={styles.warnCard}>
                    <Text style={styles.warnTitle}>No GPS coordinates recorded yet</Text>
                    <Text style={styles.warnBody}>
                        This usually means (1) location permission is denied, (2) location services are off, or (3) no
                        measurement
                        captured a location successfully. Record again and make sure permission is granted.
                    </Text>

                    <View style={{marginTop: 10}}>
                        <Text style={styles.diagText}>
                            Permission: <Text style={styles.diagStrong}>{gpsPermission}</Text>
                        </Text>
                        <Text style={styles.diagText}>
                            Location services:{" "}
                            <Text style={styles.diagStrong}>
                                {locationServicesEnabled == null ? "unknown" : locationServicesEnabled ? "on" : "off"}
                            </Text>
                        </Text>
                    </View>

                    <View style={{flexDirection: "row", gap: 10, marginTop: 12}}>
                        <Pressable style={[styles.secondaryBtn, {flex: 1}]}
                                   onPress={() => void refreshGpsDiagnostics()}>
                            <Text style={styles.secondaryBtnText}>Re-check GPS</Text>
                        </Pressable>
                        <Pressable style={[styles.secondaryBtn, {flex: 1}]} onPress={onBackToMeasurements}>
                            <Text style={styles.secondaryBtnText}>Back to Measure</Text>
                        </Pressable>
                    </View>
                </View>
            ) : null}

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Filters</Text>

                <View style={styles.rowBetween}>
                    <Text style={styles.k}>Valid-only</Text>
                    <Pressable style={[styles.chip, validOnly && styles.chipOn]}
                               onPress={() => setValidOnly((v) => !v)}>
                        <Text
                            style={[styles.chipText, validOnly && styles.chipTextOn]}>{validOnly ? "ON" : "OFF"}</Text>
                    </Pressable>
                </View>

                <Text style={[styles.label, {marginTop: 12}]}>Risk category</Text>
                <View style={styles.segmentWrap}>
                    <Pressable style={[styles.segmentBtn, riskFilter === "ALL" && styles.segmentBtnOn]}
                               onPress={() => setRiskFilter("ALL")}>
                        <Text style={[styles.segmentText, riskFilter === "ALL" && styles.segmentTextOn]}>All</Text>
                    </Pressable>

                    {riskOptions.map((r) => (
                        <Pressable
                            key={r.key}
                            style={[styles.segmentBtn, riskFilter === r.key && styles.segmentBtnOn]}
                            onPress={() => setRiskFilter(r.key)}
                        >
                            <Text
                                style={[styles.segmentText, riskFilter === r.key && styles.segmentTextOn]}>{r.label}</Text>
                        </Pressable>
                    ))}
                </View>

                <Text style={[styles.label, {marginTop: 12}]}>Action</Text>
                <View style={styles.segmentWrap}>
                    <Pressable style={[styles.segmentBtn, actionFilter === "ALL" && styles.segmentBtnOn]}
                               onPress={() => setActionFilter("ALL")}>
                        <Text style={[styles.segmentText, actionFilter === "ALL" && styles.segmentTextOn]}>All</Text>
                    </Pressable>

                    {actionOptions.map((name) => (
                        <Pressable
                            key={name}
                            style={[styles.segmentBtn, actionFilter === name && styles.segmentBtnOn]}
                            onPress={() => setActionFilter(name)}
                        >
                            <Text
                                style={[styles.segmentText, actionFilter === name && styles.segmentTextOn]}>{name}</Text>
                        </Pressable>
                    ))}
                </View>

                <Text style={styles.metaHint}>
                    Total: {stats.total} • Valid: {stats.valid} • With GPS: {stats.gpsCount} • Showing
                    pins: {stats.filteredGps}
                </Text>
            </View>

            <View style={styles.mapCard}>
                <Text style={styles.cardTitle}>Pins</Text>

                {initialRegion ? (
                    <View style={styles.mapWrap}>
                        <MapView
                            ref={(r) => {
                                mapRef.current = r;
                            }}
                            style={StyleSheet.absoluteFill}
                            provider={PROVIDER_DEFAULT}
                            initialRegion={initialRegion}
                        >
                            {filtered.map((m) => {
                                if (!hasGps(m.gps)) return null;
                                const gps = m.gps;

                                const title = `${m.actionLabel ?? "Action"} • ${
                                    typeof m.dbAvg === "number" ? m.dbAvg.toFixed(1) : "—"
                                } dB`;

                                const descParts: string[] = [];
                                if (m.riskLabel) descParts.push(m.riskLabel);
                                if (typeof m.dbMax === "number") descParts.push(`max ${m.dbMax.toFixed(1)} dB`);
                                if (typeof gps.accuracyM === "number") descParts.push(`±${Math.round(gps.accuracyM)}m`);

                                return (
                                    <Marker
                                        key={m.id}
                                        coordinate={{latitude: gps.lat, longitude: gps.lng}}
                                        title={title}
                                        description={descParts.join(" • ")}
                                        pinColor={riskToPinColor(m.riskCategory)}
                                    />
                                );
                            })}
                        </MapView>
                    </View>
                ) : (
                    <View style={styles.emptyMap}>
                        <Text style={{fontWeight: "900"}}>No pins to display</Text>
                        <Text style={{marginTop: 6, opacity: 0.75, lineHeight: 18}}>
                            Record measurements with GPS enabled to plot locations here.
                        </Text>

                        <Pressable style={[styles.secondaryBtn, {marginTop: 12}]} onPress={onBackToMeasurements}>
                            <Text style={styles.secondaryBtnText}>Back to Measure</Text>
                        </Pressable>
                    </View>
                )}

                <View style={styles.legend}>
                    <Text style={styles.legendTitle}>Legend</Text>
                    <Text style={styles.legendText}>Green: Safe / No risk</Text>
                    <Text style={styles.legendText}>Orange: Caution / fatigue</Text>
                    <Text style={styles.legendText}>Red: Dangerous</Text>
                    <Text style={styles.legendText}>Purple: Severe / instant damage</Text>
                </View>
            </View>

            <Pressable style={styles.primaryBtn} onPress={onContinue}>
                <Text style={styles.primaryBtnText}>Continue to Results</Text>
            </Pressable>

            <View style={{height: 30}}/>
        </ScrollView>
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

    warnCard: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#111",
        backgroundColor: "white",
        borderRadius: 14,
        padding: 14,
    },
    warnTitle: {fontSize: 15, fontWeight: "900"},
    warnBody: {marginTop: 8, opacity: 0.85, lineHeight: 18},

    diagText: {marginTop: 4, opacity: 0.85, lineHeight: 18},
    diagStrong: {fontWeight: "900", opacity: 1},

    label: {marginTop: 10, fontWeight: "800"},
    metaHint: {marginTop: 10, opacity: 0.7, lineHeight: 18},

    rowBetween: {flexDirection: "row", alignItems: "center", justifyContent: "space-between"},
    k: {fontWeight: "800", opacity: 0.9},

    chip: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    chipOn: {backgroundColor: "#111", borderColor: "#111"},
    chipText: {fontWeight: "900", opacity: 0.85},
    chipTextOn: {color: "white", opacity: 1},

    segmentWrap: {marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8},
    segmentBtn: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    segmentBtnOn: {backgroundColor: "#111", borderColor: "#111"},
    segmentText: {fontWeight: "900", opacity: 0.85},
    segmentTextOn: {color: "white", opacity: 1},

    mapCard: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    mapWrap: {
        marginTop: 10,
        borderRadius: 14,
        overflow: "hidden",
        height: 320,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#e5e5e5",
    },
    emptyMap: {
        marginTop: 10,
        borderRadius: 14,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        padding: 14,
    },

    legend: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    legendTitle: {fontWeight: "900"},
    legendText: {marginTop: 6, opacity: 0.8, lineHeight: 18},

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    secondaryBtn: {
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},
});