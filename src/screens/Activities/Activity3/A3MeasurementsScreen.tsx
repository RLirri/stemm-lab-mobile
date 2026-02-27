// src/screens/Activities/Activity3/A3MeasurementsScreen.tsx
import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    ActivityIndicator,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";

import {
    getActivity3RunDraft,
    upsertActivity3Measurement,
    removeActivity3Measurement,
    updateActivity3FanDesign,
    type Activity3RunDraft,
    type FanDistanceCm,
    type FanMaterial,
    type FanFoldType,
} from "../../../store/activity3RunDraftStore";

import {
    validateAndDeriveMeasurement,
    getSubmissionGate,
    A3_DISTANCES,
    A3_MATERIALS,
} from "../../../services/activity3PhysicsService";

import {pickVideoFromLibrary, recordVideoWithCamera} from "../../../services/evidenceService";

type Props = NativeStackScreenProps<AppStackParamList, "A3Measurements">;

function toNumberOrUndefined(raw: string): number | undefined {
    const v = raw.trim();
    if (!v) return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
}

async function getCurrentLocationSafe(): Promise<
    | { lat: number; lng: number; accuracyM?: number }
    | undefined
> {
    try {
        const Location = await import("expo-location");
        const res = await Location.getCurrentPositionAsync({});
        return {
            lat: res.coords.latitude,
            lng: res.coords.longitude,
            accuracyM: res.coords.accuracy ?? undefined,
        };
    } catch {
        return undefined;
    }
}

export default function A3MeasurementsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);

    // current input fields
    const [designIndex, setDesignIndex] = useState<number>(0);
    const [distance, setDistance] = useState<FanDistanceCm>(15);
    const [material, setMaterial] = useState<FanMaterial>("paper");
    const [bendAngleRaw, setBendAngleRaw] = useState<string>("");
    const [notes, setNotes] = useState<string>("");

    const [saving, setSaving] = useState(false);
    const [savingVideo, setSavingVideo] = useState(false);

    useEffect(() => {
        if (!user) return;

        const d = getActivity3RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Please restart Activity 3.", [
                {text: "OK", onPress: () => navigation.replace("A3SessionSetup", {activityId})},
            ]);
            return;
        }

        // FR-A3-05: prediction must exist before measuring
        const hasPrediction =
            typeof d.prediction?.predictedBestDesignIndex === "number" &&
            typeof d.prediction?.predictedBestDistanceCm === "number";
        if (!hasPrediction) {
            Alert.alert("Prediction required", "Please complete Prediction before recording measurements.", [
                {text: "Go to Prediction", onPress: () => navigation.replace("A3Prediction", {activityId, runId})},
            ]);
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const designOptions = useMemo(() => {
        if (!draft) return [];
        return Array.from({length: draft.session.fanDesignCount}, (_, i) => i);
    }, [draft]);

    const currentDesign = useMemo(() => {
        if (!draft) return undefined;
        return draft.session.fanDesigns?.[designIndex];
    }, [draft, designIndex]);

    // Derived view model for each measurement: validity + warnings + derived
    const measurementVM = useMemo(() => {
        if (!draft) return [];
        return draft.measurements
            .map((m) => {
                const v = validateAndDeriveMeasurement({draft, m});
                return {m, v};
            })
            .sort((a, b) => (b.m.createdAt ?? 0) - (a.m.createdAt ?? 0));
    }, [draft]);

    const groupedAverages = useMemo(() => {
        if (!draft) return {};

        const map: Record<string, { sum: number; count: number }> = {};

        for (const row of measurementVM) {
            const m = row.m;
            const v = row.v;
            if (!v.isValid || m.bendAngleDeg == null) continue;

            const key = currentLabelForDesign(draft, m.designIndex);
            if (!map[key]) map[key] = {sum: 0, count: 0};
            map[key].sum += m.bendAngleDeg;
            map[key].count += 1;
        }

        return map;
    }, [draft, measurementVM]);

    // “one valid measurement per design” gate
    const perDesignValidCount = useMemo(() => {
        if (!draft) return new Map<number, number>();
        const map = new Map<number, number>();
        for (const row of measurementVM) {
            if (!row.v.isValid) continue;
            const idx = row.m.designIndex;
            map.set(idx, (map.get(idx) ?? 0) + 1);
        }
        return map;
    }, [draft, measurementVM]);

    const canViewResults = useMemo(() => {
        if (!draft) return false;
        for (let i = 0; i < draft.session.fanDesignCount; i++) {
            if ((perDesignValidCount.get(i) ?? 0) < 1) return false;
        }
        return true;
    }, [draft, perDesignValidCount]);

    const submissionGate = useMemo(() => {
        if (!draft) return null;
        return getSubmissionGate(draft);
    }, [draft]);

    // Suggested next condition: distance-first, then material (more "scientific")
    // Order per design: 30 -> 15 -> 45, paper first then cardboard
    const nextHint = useMemo(() => {
        if (!draft) return null;

        const distOrder: FanDistanceCm[] = [30, 15, 45];
        const matOrder: FanMaterial[] = ["paper", "cardboard"];

        for (const dIdx of designOptions) {
            for (const dist of distOrder) {
                for (const mat of matOrder) {
                    const exists = measurementVM.some(
                        (x) =>
                            x.v.isValid &&
                            x.m.designIndex === dIdx &&
                            x.m.distanceCm === dist &&
                            x.m.material === mat
                    );
                    if (!exists) return {designIndex: dIdx, distanceCm: dist, material: mat};
                }
            }
        }
        return null;
    }, [draft, designOptions, measurementVM]);

    async function onAddMeasurement() {
        if (!draft) return;

        const angle = toNumberOrUndefined(bendAngleRaw);
        if (angle == null) {
            Alert.alert("Check input", "Bend angle is required.");
            return;
        }

        const synthetic = {
            id: "__tmp__",
            designIndex,
            distanceCm: distance,
            material,
            bendAngleDeg: angle,
            notes: notes.trim() ? notes.trim() : undefined,
            createdAt: Date.now(),
        };

        const r = validateAndDeriveMeasurement({draft, m: synthetic as any});
        if (!r.isValid) {
            Alert.alert("Check input", r.warnings[0] ?? "Invalid measurement.");
            return;
        }

        const proceed = async () => {
            setSaving(true);

            let geo;
            if (draft.session.gpsEnabled && draft.session.gpsPermission === "granted") {
                geo = await getCurrentLocationSafe();
            }

            const next = upsertActivity3Measurement(runId, {
                designIndex,
                distanceCm: distance,
                material,
                bendAngleDeg: angle,
                geo,
                notes: notes.trim() ? notes.trim() : undefined,
            });

            setDraft(next);
            setBendAngleRaw("");
            setNotes("");
            setSaving(false);
        };

        if (r.warnings.length) {
            Alert.alert("Are you sure?", r.warnings.join("\n"), [
                {text: "Cancel", style: "cancel"},
                {text: "Save anyway", onPress: () => void proceed()},
            ]);
            return;
        }

        await proceed();
    }

    function onDelete(measurementId: string) {
        if (!draft) return;
        const next = removeActivity3Measurement(runId, measurementId);
        setDraft(next);
    }

    function onContinueToResults() {
        if (!draft) return;

        if (!canViewResults) {
            Alert.alert(
                "Not enough valid measurements",
                "Please record at least ONE valid measurement for each design before viewing results."
            );
            return;
        }

        navigation.navigate("A3Results", {activityId, runId});
    }

    async function attachVideoToMeasurement(measurementId: string, kind: "record" | "pick") {
        if (!draft) return;

        try {
            setSavingVideo(true);

            const picked =
                kind === "record" ? await recordVideoWithCamera() : await pickVideoFromLibrary();

            if (!picked?.uri) return;

            const m = draft.measurements.find((x) => x.id === measurementId);
            if (!m) return;

            const next = upsertActivity3Measurement(runId, {
                id: m.id,
                designIndex: m.designIndex,
                distanceCm: m.distanceCm,
                material: m.material,
                bendAngleDeg: m.bendAngleDeg,
                geo: m.geo,
                notes: m.notes,
                video: {uri: picked.uri, createdAt: Date.now()},
            });

            setDraft(next);
            Alert.alert("Video attached ✅", "Saved for this measurement.");
        } catch (e: any) {
            Alert.alert("Video error", e?.message ?? "Failed to attach video.");
        } finally {
            setSavingVideo(false);
        }
    }

    function removeVideoFromMeasurement(measurementId: string) {
        if (!draft) return;

        const m = draft.measurements.find((x) => x.id === measurementId);
        if (!m) return;

        const next = upsertActivity3Measurement(runId, {
            id: m.id,
            designIndex: m.designIndex,
            distanceCm: m.distanceCm,
            material: m.material,
            bendAngleDeg: m.bendAngleDeg,
            geo: m.geo,
            notes: m.notes,
            video: undefined,
        });

        setDraft(next);
    }

    function updateDesignPatch(patch: any) {
        if (!draft) return;
        const next = updateActivity3FanDesign(runId, designIndex, patch);
        setDraft(next);
    }

    if (!user) return null;

    if (!draft) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Record Bend Angle</Text>
                <Text style={styles.sub}>Measure how much the material bends (in degrees).</Text>

                {nextHint ? (
                    <View style={styles.hintCard}>
                        <Text style={{fontWeight: "900"}}>Suggested next</Text>
                        <Text style={{marginTop: 6, opacity: 0.8, lineHeight: 18}}>
                            {currentLabelForDesign(draft, nextHint.designIndex)} · {nextHint.distanceCm} cm
                            · {nextHint.material}
                        </Text>
                    </View>
                ) : null}

                {/* ✅ Design controls (supports “design → airflow velocity → movement”) */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Design Details
                        (for {currentLabelForDesign(draft, designIndex)})</Text>
                    <Text style={styles.smallNote}>
                        Record what makes the design different (folds, layers, size). This helps explain *why* one
                        design bends more.
                    </Text>

                    <Text style={styles.label}>Name</Text>
                    <TextInput
                        value={currentDesign?.name ?? `Design ${designIndex + 1}`}
                        onChangeText={(t) => updateDesignPatch({name: t})}
                        placeholder={`Design ${designIndex + 1}`}
                        style={styles.input}
                    />

                    <Text style={styles.label}>Has folds?</Text>
                    <View style={styles.segmentWrap}>
                        {(["yes", "no"] as const).map((v) => {
                            const on = (currentDesign?.hasFolds ? "yes" : "no") === v;
                            return (
                                <Pressable
                                    key={v}
                                    style={[styles.segmentBtn, on && styles.segmentBtnActive]}
                                    onPress={() => updateDesignPatch({hasFolds: v === "yes"})}
                                >
                                    <Text style={[styles.segmentText, on && styles.segmentTextActive]}>{v}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.label}>Fold type</Text>
                    <View style={styles.segmentWrap}>
                        {(["flat", "folded", "pleated"] as FanFoldType[]).map((v) => {
                            const on = (currentDesign?.foldType ?? "flat") === v;
                            return (
                                <Pressable
                                    key={v}
                                    style={[styles.segmentBtn, on && styles.segmentBtnActive]}
                                    onPress={() => updateDesignPatch({foldType: v})}
                                >
                                    <Text style={[styles.segmentText, on && styles.segmentTextActive]}>{v}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <View style={{flexDirection: "row", gap: 10}}>
                        <View style={{flex: 1}}>
                            <Text style={styles.label}>Fold count</Text>
                            <TextInput
                                value={currentDesign?.foldCount?.toString() ?? ""}
                                onChangeText={(t) => updateDesignPatch({foldCount: toNumberOrUndefined(t)})}
                                placeholder="e.g. 8"
                                keyboardType="number-pad"
                                style={styles.input}
                            />
                        </View>
                        <View style={{flex: 1}}>
                            <Text style={styles.label}>Layers</Text>
                            <TextInput
                                value={currentDesign?.layers?.toString() ?? ""}
                                onChangeText={(t) => updateDesignPatch({layers: toNumberOrUndefined(t)})}
                                placeholder="e.g. 1"
                                keyboardType="number-pad"
                                style={styles.input}
                            />
                        </View>
                    </View>

                    <View style={{flexDirection: "row", gap: 10}}>
                        <View style={{flex: 1}}>
                            <Text style={styles.label}>Width (cm)</Text>
                            <TextInput
                                value={currentDesign?.widthCm?.toString() ?? ""}
                                onChangeText={(t) => updateDesignPatch({widthCm: toNumberOrUndefined(t)})}
                                placeholder="e.g. 15"
                                keyboardType="decimal-pad"
                                style={styles.input}
                            />
                        </View>
                        <View style={{flex: 1}}>
                            <Text style={styles.label}>Height (cm)</Text>
                            <TextInput
                                value={currentDesign?.heightCm?.toString() ?? ""}
                                onChangeText={(t) => updateDesignPatch({heightCm: toNumberOrUndefined(t)})}
                                placeholder="e.g. 20"
                                keyboardType="decimal-pad"
                                style={styles.input}
                            />
                        </View>
                    </View>

                    <Text style={styles.label}>Design notes</Text>
                    <TextInput
                        value={currentDesign?.notes ?? ""}
                        onChangeText={(t) => updateDesignPatch({notes: t})}
                        placeholder='e.g. "Kept flat, no folds; held stiff with cardboard handle."'
                        style={[styles.input, {minHeight: 44}]}
                    />
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Add Measurement</Text>

                    <Text style={styles.label}>Design</Text>
                    <View style={styles.segmentWrap}>
                        {designOptions.map((i) => {
                            const on = designIndex === i;
                            return (
                                <Pressable
                                    key={i}
                                    style={[styles.segmentBtn, on && styles.segmentBtnActive]}
                                    onPress={() => setDesignIndex(i)}
                                >
                                    <Text style={[styles.segmentText, on && styles.segmentTextActive]}>
                                        {currentLabelForDesign(draft, i)}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.label}>Distance</Text>
                    <View style={styles.segmentWrap}>
                        {A3_DISTANCES.map((v) => {
                            const on = distance === v;
                            return (
                                <Pressable
                                    key={v}
                                    style={[styles.segmentBtn, on && styles.segmentBtnActive]}
                                    onPress={() => setDistance(v as FanDistanceCm)}
                                >
                                    <Text style={[styles.segmentText, on && styles.segmentTextActive]}>{v} cm</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.label}>Material</Text>
                    <View style={styles.segmentWrap}>
                        {A3_MATERIALS.map((v) => {
                            const on = material === v;
                            return (
                                <Pressable
                                    key={v}
                                    style={[styles.segmentBtn, on && styles.segmentBtnActive]}
                                    onPress={() => setMaterial(v)}
                                >
                                    <Text style={[styles.segmentText, on && styles.segmentTextActive]}>{v}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.label}>Bend Angle (°)</Text>
                    <TextInput
                        value={bendAngleRaw}
                        onChangeText={setBendAngleRaw}
                        placeholder="e.g. 42"
                        keyboardType="decimal-pad"
                        style={styles.input}
                    />

                    <TextInput
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Optional notes (e.g., wind felt stronger, paper slipped, etc.)"
                        style={[styles.input, {marginTop: 10}]}
                    />

                    <Pressable
                        style={[styles.primaryBtn, saving && {opacity: 0.7}]}
                        onPress={onAddMeasurement}
                        disabled={saving}
                    >
                        <Text style={styles.primaryBtnText}>{saving ? "Saving..." : "Add Measurement"}</Text>
                    </Pressable>

                    {submissionGate ? (
                        <Text style={styles.smallNote}>
                            Submission check: {submissionGate.validCount} valid · prediction{" "}
                            {submissionGate.hasPrediction ? "✅" : "❌"} · video{" "}
                            {submissionGate.hasVideo ? "✅" : "❌"}
                        </Text>
                    ) : null}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Recorded Measurements</Text>

                    {measurementVM.length === 0 ? (
                        <Text style={{opacity: 0.6}}>No measurements yet.</Text>
                    ) : (
                        measurementVM.map(({m, v}) => (
                            <View key={m.id} style={styles.measureBlock}>
                                <View style={styles.measureRow}>
                                    <Text style={{flex: 1, fontWeight: "800"}}>
                                        {currentLabelForDesign(draft, m.designIndex)} · {m.distanceCm}cm
                                        · {m.material} ·{" "}
                                        {m.bendAngleDeg ?? "-"}°
                                    </Text>
                                    <Pressable onPress={() => onDelete(m.id)}>
                                        <Text style={{color: "#b00020", fontWeight: "900"}}>Delete</Text>
                                    </Pressable>
                                </View>

                                {v.derived ? (
                                    <Text style={styles.meta}>
                                        θ = {v.derived.thetaRad} rad
                                        {v.derived.forceIndex != null ? ` · k·θ = ${v.derived.forceIndex}` : ""}
                                    </Text>
                                ) : null}

                                {v.warnings.length ? <Text style={styles.warn}>{v.warnings.join(" • ")}</Text> : null}

                                {/* ✅ Per-measurement video */}
                                <View style={{marginTop: 10, gap: 10}}>
                                    <View style={{flexDirection: "row", gap: 10}}>
                                        <Pressable
                                            style={[styles.secondarySmallBtn, savingVideo && {opacity: 0.6}]}
                                            onPress={() => attachVideoToMeasurement(m.id, "record")}
                                            disabled={savingVideo}
                                        >
                                            <Text style={styles.secondarySmallBtnText}>Record</Text>
                                        </Pressable>

                                        <Pressable
                                            style={[styles.secondarySmallBtn, savingVideo && {opacity: 0.6}]}
                                            onPress={() => attachVideoToMeasurement(m.id, "pick")}
                                            disabled={savingVideo}
                                        >
                                            <Text style={styles.secondarySmallBtnText}>Pick</Text>
                                        </Pressable>

                                        {m.video?.uri ? (
                                            <Pressable style={styles.dangerSmallBtn}
                                                       onPress={() => removeVideoFromMeasurement(m.id)}>
                                                <Text style={styles.dangerSmallBtnText}>Remove</Text>
                                            </Pressable>
                                        ) : null}
                                    </View>

                                    <Text style={{opacity: 0.75, fontWeight: "800"}}>
                                        Video: {m.video?.uri ? "attached ✅" : "none"}
                                    </Text>
                                </View>
                            </View>
                        ))
                    )}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Current Averages (valid only)</Text>
                    {Object.keys(groupedAverages).length === 0 ? (
                        <Text style={{opacity: 0.6, marginTop: 6}}>No valid averages yet.</Text>
                    ) : (
                        Object.entries(groupedAverages).map(([key, val]) => {
                            const avg = val.sum / val.count;
                            return (
                                <Text key={key} style={{marginTop: 6}}>
                                    {key} → {avg.toFixed(1)}°
                                </Text>
                            );
                        })
                    )}
                </View>

                <Pressable
                    style={[styles.secondaryBtn, !canViewResults && {opacity: 0.5}]}
                    onPress={onContinueToResults}
                    disabled={!canViewResults}
                >
                    <Text style={styles.secondaryBtnText}>View Results</Text>
                </Pressable>

                <View style={{height: 30}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function currentLabelForDesign(draft: Activity3RunDraft, idx: number): string {
    const name = draft.session.fanDesigns?.[idx]?.name?.trim();
    return name ? name : `Design ${idx + 1}`;
}

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20},
    center: {flex: 1, alignItems: "center", justifyContent: "center"},

    title: {fontSize: 26, fontWeight: "900", marginTop: 6},
    sub: {marginTop: 8, opacity: 0.75, lineHeight: 18},

    hintCard: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#111",
        backgroundColor: "#fff",
        borderRadius: 14,
        padding: 14,
    },

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

    segmentWrap: {marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8},
    segmentBtn: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: "white",
    },
    segmentBtnActive: {backgroundColor: "#111", borderColor: "#111"},
    segmentText: {fontWeight: "900"},
    segmentTextActive: {color: "white"},

    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === "ios" ? 12 : 10,
    },

    primaryBtn: {
        marginTop: 12,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900"},

    smallNote: {marginTop: 10, opacity: 0.7, lineHeight: 18},

    secondaryBtn: {
        marginTop: 16,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},

    measureBlock: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    measureRow: {flexDirection: "row", alignItems: "center"},
    meta: {marginTop: 8, opacity: 0.75, lineHeight: 18},
    warn: {marginTop: 8, fontWeight: "800", opacity: 0.85},

    secondarySmallBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: "center",
    },
    secondarySmallBtnText: {fontWeight: "900", opacity: 0.9},

    dangerSmallBtn: {
        borderWidth: 1,
        borderColor: "#ffbdbd",
        backgroundColor: "#ffecec",
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        alignItems: "center",
    },
    dangerSmallBtnText: {fontWeight: "900", color: "#b00020"},
});