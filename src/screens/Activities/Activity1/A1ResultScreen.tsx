import React, {useEffect, useMemo, useState} from "react";
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";
import {
    getRunDraft,
    updateAttempt,
    type ActivityRunDraft,
    type AttemptComputedDraft,
    type AttemptDraft,
} from "../../../store/activityRunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A1Result">;

const G = 9.8;

function attemptLabel(index: number) {
    return index === 0 ? "Baseline (No parachute)" : `Prototype ${index}`;
}

function round(n: number | undefined, dp: number = 2): number | undefined {
    if (typeof n !== "number") return undefined;

    const f = Math.pow(10, dp);
    return Math.round(f * n) / f;
}

function isPosNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function isNonNegNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x) && x >= 0;
}

export default function A1ResultScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId, attemptIndex} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);
    const [attempt, setAttempt] = useState<AttemptDraft | null>(null);

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

    const computed = useMemo<AttemptComputedDraft>(() => {
        if (!draft || !attempt) return {};

        const session = draft.session;
        const plan = attempt.plan;
        const meas = attempt.measurements;

        const tHit = meas?.tHitSec;
        const tStop = meas?.tStopSec;

        const dropHeightM = plan.dropHeightM ?? session.dropHeightM;

        const massUnknown = plan.payloadMassUnknown ?? session.payloadMassUnknown ?? false;
        const massG = plan.payloadMassG ?? session.payloadMassG;
        const massKg = !massUnknown && isPosNumber(massG) ? massG / 1000 : undefined;

        // v = d / t_hit
        const velocity = isPosNumber(dropHeightM) && isPosNumber(tHit) ? dropHeightM / tHit : undefined;

        // a = v / t_hit
        const acceleration = velocity != null && isPosNumber(tHit) ? velocity / tHit : undefined;

        // Forces (only if mass and acceleration exist)
        const netForce = massKg != null && acceleration != null ? massKg * acceleration : undefined;
        const weight = massKg != null ? massKg * G : undefined;
        const dragForce = weight != null && netForce != null ? weight - netForce : undefined;

        // G-force
        let gForce: number | undefined;
        if (velocity != null && isPosNumber(tStop)) {
            const bounce = Boolean(meas?.bounceOccurred);
            if (bounce && isPosNumber(meas?.bounceTimeToPeakSec)) {
                const vUp = G * meas.bounceTimeToPeakSec;
                gForce = ((velocity + vUp) / tStop) / G;
            } else {
                gForce = (velocity / tStop) / G;
            }
        }

        return {velocity, acceleration, netForce, weight, dragForce, gForce};
    }, [attempt, draft]);

    function persistComputed() {
        const updated = updateAttempt(runId, attemptIndex, {computed});
        setDraft(updated);
        setAttempt(updated.attempts[attemptIndex]);
    }

    function onSaveAttempt() {
        if (!attempt?.measurements?.tHitSec) {
            Alert.alert("Missing data", "Please complete measurements first.");
            return;
        }
        persistComputed();
        Alert.alert("Saved", "Attempt saved to the session draft.");
    }

    const canAddNextPrototype = useMemo(() => {
        if (!draft) return false;
        const s = draft.session;
        const timerOk = !s.endsAt || Date.now() < s.endsAt;
        return attemptIndex < 3 && timerOk;
    }, [attemptIndex, draft]);

    function onAddNextPrototype() {
        persistComputed();
        navigation.navigate("A1AttemptPlan", {activityId, runId, attemptIndex: attemptIndex + 1});
    }

    function onFinish() {
        persistComputed();
        navigation.navigate("A1Comparison", {activityId, runId});
    }

    if (!user) return null;

    if (!draft || !attempt) {
        return (
            <View style={styles.center}>
                <Text style={{fontWeight: "900"}}>Loading draft...</Text>
            </View>
        );
    }

    const meas = attempt.measurements; // can be undefined, always guard in UI
    const session = draft.session;
    const plan = attempt.plan;

    const dropHeightM = plan.dropHeightM ?? session.dropHeightM;
    const massUnknown = plan.payloadMassUnknown ?? session.payloadMassUnknown ?? false;
    const massG = plan.payloadMassG ?? session.payloadMassG;

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Results</Text>
            <Text style={styles.sub}>{attemptLabel(attemptIndex)}</Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Primary School View</Text>

                <View style={styles.row}>
                    <Text style={styles.k}>Flight time (t_hit)</Text>
                    <Text style={styles.v}>{isPosNumber(meas?.tHitSec) ? `${round(meas!.tHitSec, 2)} s` : "—"}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Stopping time (t_stop)</Text>
                    <Text style={styles.v}>
                        {isNonNegNumber(meas?.tStopSec) ? `${round(meas!.tStopSec, 2)} s` : "—"}
                    </Text>
                </View>

                {session.targetZoneEnabled ? (
                    <>
                        <View style={styles.row}>
                            <Text style={styles.k}>In target zone?</Text>
                            <Text style={styles.v}>
                                typeof meas?.inTargetZone === "boolean" ? (meas.inTargetZone ? "Yes" : "No") : "—"
                            </Text>
                        </View>

                        <View style={styles.row}>
                            <Text style={styles.k}>Distance (optional)</Text>
                            <Text style={styles.v}>
                                isNonNegNumber(meas?.distanceFromCenterCm)
                                ? `${round(meas!.distanceFromCenterCm, 0)} cm`
                                : "—"
                            </Text>
                        </View>
                    </>
                ) : (
                    <Text style={styles.note}>Target zone not used in this session.</Text>
                )}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>High School View</Text>
                <Text style={styles.help}>
                    Computations depend on known height/mass. If mass is Unknown, force-related values are not computed.
                </Text>

                <View style={styles.row}>
                    <Text style={styles.k}>Drop height</Text>
                    <Text style={styles.v}>{isPosNumber(dropHeightM) ? `${round(dropHeightM, 2)} m` : "—"}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Payload mass</Text>
                    <Text style={styles.v}>{isPosNumber(dropHeightM) ? `${round(dropHeightM, 2)} m` : "—"}</Text>
                </View>
                <View style={styles.divider}/>

                <View style={styles.row}>
                    <Text style={styles.k}>Final velocity (v = d / t_hit)</Text>
                    <Text
                        style={styles.v}>{computed.velocity != null ? `${computed.velocity != null ? round(computed.velocity, 2) : "—"} m/s` : "—"}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Acceleration (a = v / t_hit)</Text>
                    <Text
                        style={styles.v}>{computed.acceleration != null ? `${round(computed.acceleration, 2)} m/s²` : "—"}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Net force (F_net = m * a)</Text>
                    <Text style={styles.v}>{computed.netForce != null ? `${round(computed.netForce, 2)} N` : "—"}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Weight (W = m * g)</Text>
                    <Text style={styles.v}>{computed.weight != null ? `${round(computed.weight, 2)} N` : "—"}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Drag force (F_drag = W − F_net)</Text>
                    <Text
                        style={styles.v}>{computed.dragForce != null ? `${round(computed.dragForce, 2)} N` : "—"}</Text>
                </View>

                <View style={styles.divider}/>

                <View style={styles.row}>
                    <Text style={styles.k}>G-force (impact)</Text>
                    <Text style={styles.v}>{computed.gForce != null ? `${round(computed.gForce, 1)} g` : "—"}</Text>
                </View>

                {computed.gForce != null ? (
                    <Text style={styles.note}>
                        {computed.gForce < 5
                            ? "Likely safe range (1–5 g)."
                            : computed.gForce < 10
                                ? "Moderate impact (5–10 g)."
                                : computed.gForce < 30
                                    ? "High impact (10–30 g). Be careful."
                                    : "Very high impact. Consider better cushioning and parachute design."}
                    </Text>
                ) : (
                    <Text style={styles.note}>
                        G-force needs velocity and a positive stopping time (t_stop &gt; 0).
                    </Text>
                )}
            </View>

            <Pressable style={styles.primaryBtn} onPress={onSaveAttempt}>
                <Text style={styles.primaryBtnText}>Save Attempt</Text>
            </Pressable>

            {canAddNextPrototype ? (
                <Pressable style={styles.secondaryBtn} onPress={onAddNextPrototype}>
                    <Text style={styles.secondaryBtnText}>Add Next Prototype</Text>
                </Pressable>
            ) : null}

            <Pressable style={styles.ghostBtn} onPress={onFinish}>
                <Text style={styles.ghostBtnText}>Finish &amp; Compare</Text>
            </Pressable>

            <View style={{height: 30}}/>
        </ScrollView>
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
    help: {marginTop: 8, opacity: 0.7, lineHeight: 18},

    row: {flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 12},
    k: {flex: 1, fontWeight: "800", opacity: 0.9},
    v: {fontWeight: "900"},

    divider: {height: 1, backgroundColor: "#e5e5e5", marginTop: 12},

    note: {marginTop: 10, opacity: 0.75, lineHeight: 18},

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    secondaryBtn: {
        marginTop: 10,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},

    ghostBtn: {
        marginTop: 10,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    ghostBtnText: {fontWeight: "900", opacity: 0.85},
});