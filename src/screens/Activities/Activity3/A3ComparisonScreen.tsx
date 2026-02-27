import React, {useEffect, useMemo, useState} from "react";
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";
import {
    getActivity3RunDraft,
    type Activity3RunDraft,
    type FanDistanceCm,
    type FanMaterial,
} from "../../../store/activity3RunDraftStore";
import {
    A3_DISTANCES,
    A3_MATERIALS,
    validateAndDeriveMeasurement,
} from "../../../services/activity3PhysicsService";

type Props = NativeStackScreenProps<AppStackParamList, "A3Comparison">;

type CondTag = "Best";
type CondRow = {
    label: string;
    avgDeg: number;
    count: number;
    tag?: CondTag;
};

function round(n: number, dp = 1) {
    const f = Math.pow(10, dp);
    return Math.round(n * f) / f;
}

export default function A3ComparisonScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);

    useEffect(() => {
        if (!user) return;

        const d = getActivity3RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Your draft session was reset. Please start again.", [
                {text: "OK", onPress: () => navigation.replace("A3SessionSetup", {activityId})},
            ]);
            return;
        }
        setDraft(d);
    }, [activityId, navigation, runId, user]);

    // Validated angle rows (only valid measurements contribute)
    const validAngles = useMemo(() => {
        if (!draft) return [] as Array<{ material: FanMaterial; distanceCm: FanDistanceCm; angle: number }>;
        const rows: Array<{ material: FanMaterial; distanceCm: FanDistanceCm; angle: number }> = [];

        for (const m of draft.measurements) {
            const r = validateAndDeriveMeasurement({draft, m});
            if (!r.isValid) continue;
            if (typeof m.bendAngleDeg !== "number") continue;
            rows.push({material: m.material, distanceCm: m.distanceCm, angle: m.bendAngleDeg});
        }

        return rows;
    }, [draft]);

    const overall = useMemo(() => {
        if (!validAngles.length) return null;
        const avg = validAngles.reduce((a, b) => a + b.angle, 0) / validAngles.length;
        return {avgDeg: avg, count: validAngles.length};
    }, [validAngles]);

    const materialRows = useMemo<CondRow[]>(() => {
        if (!draft) return [];

        const acc: Record<FanMaterial, { sum: number; count: number }> = {
            paper: {sum: 0, count: 0},
            cardboard: {sum: 0, count: 0},
        };

        for (const r of validAngles) {
            acc[r.material].sum += r.angle;
            acc[r.material].count += 1;
        }

        const baseRows: CondRow[] = (A3_MATERIALS as FanMaterial[])
            .map((mat) => {
                const v = acc[mat];
                if (!v.count) return null;
                const row: CondRow = {
                    label: mat, // NOTE: label is string to avoid FanMaterial vs string predicate issues
                    avgDeg: v.sum / v.count,
                    count: v.count,
                };
                return row;
            })
            .filter((x): x is CondRow => x !== null);

        const best = baseRows.reduce(
            (b, r) => (b == null || r.avgDeg > b.avgDeg ? r : b),
            null as CondRow | null
        );

        return baseRows.map((r) => ({
            ...r,
            tag: best && r.label === best.label ? ("Best" as const) : undefined,
        }));
    }, [draft, validAngles]);

    const distanceRows = useMemo<CondRow[]>(() => {
        if (!draft) return [];

        const acc: Record<FanDistanceCm, { sum: number; count: number }> = {
            15: {sum: 0, count: 0},
            30: {sum: 0, count: 0},
            45: {sum: 0, count: 0},
        };

        for (const r of validAngles) {
            acc[r.distanceCm].sum += r.angle;
            acc[r.distanceCm].count += 1;
        }

        const baseRows: CondRow[] = (A3_DISTANCES as FanDistanceCm[])
            .map((dcm) => {
                const v = acc[dcm];
                if (!v.count) return null;
                const row: CondRow = {
                    label: `${dcm} cm`,
                    avgDeg: v.sum / v.count,
                    count: v.count,
                };
                return row;
            })
            .filter((x): x is CondRow => x !== null);

        const best = baseRows.reduce(
            (b, r) => (b == null || r.avgDeg > b.avgDeg ? r : b),
            null as CondRow | null
        );

        return baseRows.map((r) => ({
            ...r,
            tag: best && r.label === best.label ? ("Best" as const) : undefined,
        }));
    }, [draft, validAngles]);

    const insights = useMemo(() => {
        if (!materialRows.length && !distanceRows.length) return null;
        const bestMat = materialRows.find((r) => r.tag === "Best");
        const bestDist = distanceRows.find((r) => r.tag === "Best");
        return {bestMaterial: bestMat?.label, bestDistance: bestDist?.label};
    }, [materialRows, distanceRows]);

    function onProceed() {
        navigation.navigate("A3ReflectionSubmit", {activityId, runId});
    }

    if (!user) return null;

    if (!draft) {
        return (
            <View style={styles.center}>
                <Text style={{fontWeight: "900"}}>Loading draft...</Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Scientific Comparison</Text>
            <Text style={styles.sub}>Compare conditions using your measured bend angles (valid data only).</Text>

            {overall ? (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Overall</Text>
                    <View style={styles.rowBetween}>
                        <Text style={styles.k}>Average bend angle</Text>
                        <Text style={styles.v}>{round(overall.avgDeg, 1)}°</Text>
                    </View>
                    <Text style={styles.note}>Based on {overall.count} valid
                        measurement{overall.count > 1 ? "s" : ""}.</Text>
                </View>
            ) : (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>No valid measurements yet</Text>
                    <Text style={styles.note}>Record measurements first, then return here to compare conditions.</Text>
                    <Pressable
                        style={[styles.secondaryBtn, {marginTop: 12}]}
                        onPress={() => navigation.navigate("A3Measurements", {activityId, runId})}
                    >
                        <Text style={styles.secondaryBtnText}>Go to Measurements</Text>
                    </Pressable>
                </View>
            )}

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Material Comparison</Text>
                {!materialRows.length ? (
                    <Text style={styles.note}>No valid material data yet.</Text>
                ) : (
                    materialRows.map((r) => (
                        <View key={r.label} style={styles.tableBlock}>
                            <View style={styles.rowBetween}>
                                <Text style={styles.v}>{r.label}</Text>
                                <Text style={styles.v}>{round(r.avgDeg, 1)}°</Text>
                            </View>
                            <View style={[styles.rowBetween, {marginTop: 6}]}>
                                <Text style={styles.note}>n = {r.count}</Text>
                                {r.tag ? <Text style={styles.tag}>{r.tag}</Text> : <Text/>}
                            </View>
                        </View>
                    ))
                )}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Distance Comparison</Text>
                {!distanceRows.length ? (
                    <Text style={styles.note}>No valid distance data yet.</Text>
                ) : (
                    distanceRows.map((r) => (
                        <View key={r.label} style={styles.tableBlock}>
                            <View style={styles.rowBetween}>
                                <Text style={styles.v}>{r.label}</Text>
                                <Text style={styles.v}>{round(r.avgDeg, 1)}°</Text>
                            </View>
                            <View style={[styles.rowBetween, {marginTop: 6}]}>
                                <Text style={styles.note}>n = {r.count}</Text>
                                {r.tag ? <Text style={styles.tag}>{r.tag}</Text> : <Text/>}
                            </View>
                        </View>
                    ))
                )}
            </View>

            {insights ? (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Quick Insight</Text>
                    <Text style={{marginTop: 8, lineHeight: 18}}>
                        Best material so far: <Text style={{fontWeight: "900"}}>{insights.bestMaterial ?? "—"}</Text>
                        {"\n"}
                        Best distance so far: <Text style={{fontWeight: "900"}}>{insights.bestDistance ?? "—"}</Text>
                    </Text>
                    <Text style={styles.note}>This is based on averages; more trials improve reliability.</Text>
                </View>
            ) : null}

            <Pressable style={styles.primaryBtn} onPress={onProceed}>
                <Text style={styles.primaryBtnText}>Proceed to Reflection & Submit</Text>
            </Pressable>

            <View style={{height: 30}}/>
        </ScrollView>
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

    rowBetween: {flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 12},
    k: {flex: 1, fontWeight: "800", opacity: 0.9},
    v: {fontWeight: "900"},

    note: {marginTop: 8, opacity: 0.75, lineHeight: 18},

    tableBlock: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },

    tag: {
        backgroundColor: "#111",
        color: "white",
        fontWeight: "900",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        overflow: "hidden",
    },

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
        borderColor: "#111",
        paddingVertical: 12,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},
});