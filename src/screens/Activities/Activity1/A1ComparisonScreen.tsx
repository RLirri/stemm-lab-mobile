import React, {useEffect, useMemo, useState} from "react";
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";
import {getRunDraft, type ActivityRunDraft} from "../../../store/activityRunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A1Comparison">;

function label(i: number) {
    if (i === 0) return "Baseline";
    return `P${i}`;
}

function round(n: number, dp = 2) {
    const f = Math.pow(10, dp);
    return Math.round(n * f) / f;
}

type Row = {
    index: number;
    attempt: string;
    tHit?: number;
    tStop?: number;
    inZone?: boolean;
    gForce?: number;
    notes?: string;
    caution?: string[];
};

export default function A1ComparisonScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);

    useEffect(() => {
        if (!user) return;

        const d = getRunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Your draft session was reset. Please start again.", [
                {text: "OK", onPress: () => navigation.replace("A1SessionSetup", {activityId})},
            ]);
            return;
        }
        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const rows = useMemo<Row[]>(() => {
        if (!draft) return [];

        const base = draft.attempts?.[0];
        const baseHeight = base?.plan?.dropHeightM ?? draft.session.dropHeightM;
        const baseMassUnknown = base?.plan?.payloadMassUnknown ?? draft.session.payloadMassUnknown ?? false;
        const baseMass = base?.plan?.payloadMassG ?? draft.session.payloadMassG;

        const result: Row[] = [];

        for (let i = 0; i <= 3; i += 1) {
            const a = draft.attempts?.[i];
            if (!a) continue;

            const m = a.measurements;
            const c = a.computed;

            // Only show attempts that have at least t_hit
            if (!m?.tHitSec || m.tHitSec <= 0) continue;

            const cautions: string[] = [];
            const h = a.plan.dropHeightM ?? draft.session.dropHeightM;
            const mu = a.plan.payloadMassUnknown ?? draft.session.payloadMassUnknown ?? false;
            const mg = a.plan.payloadMassG ?? draft.session.payloadMassG;

            if (i !== 0 && baseHeight != null && h != null && baseHeight > 0) {
                const diff = Math.abs((h - baseHeight) / baseHeight);
                if (diff > 0.05) cautions.push("Height changed (>5%)");
            }

            if (
                i !== 0 &&
                !mu &&
                !baseMassUnknown &&
                mg != null &&
                baseMass != null &&
                baseMass > 0
            ) {
                const diff = Math.abs((mg - baseMass) / baseMass);
                if (diff > 0.1) cautions.push("Mass changed (>10%)");
            }

            const tags = a.plan.designTags;

            const parts: string[] = [];
            if (tags?.canopyMaterial) parts.push(tags.canopyMaterial);
            if (tags?.canopyShape) parts.push(tags.canopyShape);
            if (tags?.stringsCount != null) parts.push(`${tags.stringsCount} strings`);

            const joined = parts.join(" • ");

            const designNotes =
                i === 0
                    ? "No parachute"
                    : (tags?.notes?.trim() ? tags.notes.trim() : (joined ? joined : "Prototype"));

            result.push({
                index: i,
                attempt: label(i),
                tHit: m.tHitSec,
                tStop: m.tStopSec,
                inZone: m.inTargetZone,
                gForce: c?.gForce,
                notes: designNotes,
                caution: cautions.length ? cautions : undefined,
            });
        }

        return result;
    }, [draft]);

    const bestSlow = useMemo(() => {
        if (!rows.length) return null;
        return rows.reduce((best, r) => (best == null || (r.tHit ?? 0) > (best.tHit ?? 0) ? r : best), null as Row | null);
    }, [rows]);

    const bestSafe = useMemo(() => {
        // in target zone AND lowest gForce (if available). If gForce missing, still allow in-zone with “N/A gForce”.
        const inZoneRows = rows.filter((r) => r.inZone === true);
        if (!inZoneRows.length) return null;

        // Prefer computed gForce; otherwise treat as Infinity so computed ones win
        return inZoneRows.reduce((best, r) => {
            const rg = r.gForce ?? Infinity;
            const bg = best?.gForce ?? Infinity;
            if (!best) return r;
            if (rg < bg) return r;
            if (rg === bg && (r.tHit ?? 0) > (best.tHit ?? 0)) return r;
            return best;
        }, null as Row | null);
    }, [rows]);

    function onProceed() {
        navigation.navigate("A1ReflectionSubmit", {activityId, runId});
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
            <Text style={styles.title}>Comparison Dashboard</Text>
            <Text style={styles.sub}>Review attempts and decide your best design before submission.</Text>

            {rows.length === 0 ? (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>No attempts yet</Text>
                    <Text style={styles.help}>Complete at least the baseline attempt (t_hit) to compare.</Text>
                    <Pressable
                        style={styles.primaryBtn}
                        onPress={() => navigation.navigate("A1AttemptPlan", {activityId, runId, attemptIndex: 0})}
                    >
                        <Text style={styles.primaryBtnText}>Go to Baseline</Text>
                    </Pressable>
                </View>
            ) : (
                <>
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Highlights</Text>

                        <View style={styles.highlightRow}>
                            <Text style={styles.k}>Best Slow Landing</Text>
                            <Text style={styles.v}>
                                {bestSlow ? `${bestSlow.attempt} • ${round(bestSlow.tHit ?? 0, 2)}s` : "—"}
                            </Text>
                        </View>

                        <View style={styles.highlightRow}>
                            <Text style={styles.k}>Best Safe Landing</Text>
                            <Text style={styles.v}>
                                {bestSafe
                                    ? `${bestSafe.attempt} • ${bestSafe.gForce != null ? `${round(bestSafe.gForce, 1)}g` : "g-force N/A"}`
                                    : "No in-zone attempt"}
                            </Text>
                        </View>

                        <Text style={styles.note}>
                            *Safe Landing = in target zone + lowest g-force (if computed).
                        </Text>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Table</Text>

                        <View style={[styles.tableRow, styles.tableHeader]}>
                            <Text style={[styles.cell, styles.hCell]}>Attempt</Text>
                            <Text style={[styles.cell, styles.hCell]}>t_hit</Text>
                            <Text style={[styles.cell, styles.hCell]}>t_stop</Text>
                            <Text style={[styles.cell, styles.hCell]}>Accuracy</Text>
                            <Text style={[styles.cell, styles.hCell]}>g</Text>
                        </View>

                        {rows.map((r) => {
                            const slowTag = bestSlow?.index === r.index ? "Best Slow" : null;
                            const safeTag = bestSafe?.index === r.index ? "Best Safe" : null;

                            return (
                                <View key={r.index} style={styles.tableBlock}>
                                    <View style={styles.tableRow}>
                                        <Text style={styles.cell}>{r.attempt}</Text>
                                        <Text style={styles.cell}>{r.tHit != null ? `${round(r.tHit, 2)}` : "—"}</Text>
                                        <Text
                                            style={styles.cell}>{r.tStop != null ? `${round(r.tStop, 2)}` : "—"}</Text>
                                        <Text style={styles.cell}>
                                            {typeof r.inZone === "boolean" ? (r.inZone ? "Yes" : "No") : "—"}
                                        </Text>
                                        <Text
                                            style={styles.cell}>{r.gForce != null ? `${round(r.gForce, 1)}` : "—"}</Text>
                                    </View>

                                    <Text style={styles.notes} numberOfLines={2}>
                                        {r.notes}
                                    </Text>

                                    {(slowTag || safeTag || r.caution?.length) ? (
                                        <View style={styles.tagRow}>
                                            {slowTag ? <Text style={styles.tag}>{slowTag}</Text> : null}
                                            {safeTag ? <Text style={styles.tag}>{safeTag}</Text> : null}
                                            {r.caution?.map((c) => (
                                                <Text key={c} style={styles.caution}>
                                                    {c}
                                                </Text>
                                            ))}
                                        </View>
                                    ) : null}
                                </View>
                            );
                        })}
                    </View>

                    <Pressable style={styles.primaryBtn} onPress={onProceed}>
                        <Text style={styles.primaryBtnText}>Proceed to Submission</Text>
                    </Pressable>
                </>
            )}

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
    help: {marginTop: 8, opacity: 0.7, lineHeight: 18},
    note: {marginTop: 10, opacity: 0.75, lineHeight: 18},

    highlightRow: {flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 12},
    k: {flex: 1, fontWeight: "800", opacity: 0.9},
    v: {fontWeight: "900"},

    tableHeader: {borderBottomWidth: 1, borderBottomColor: "#e5e5e5", paddingBottom: 8},
    tableRow: {flexDirection: "row", alignItems: "center"},
    cell: {flex: 1, fontWeight: "800", opacity: 0.9},
    hCell: {fontWeight: "900", opacity: 0.85},

    tableBlock: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    notes: {marginTop: 8, opacity: 0.75, lineHeight: 18},

    tagRow: {marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8},
    tag: {
        backgroundColor: "#111",
        color: "white",
        fontWeight: "900",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        overflow: "hidden",
    },
    caution: {
        backgroundColor: "#777",
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
});