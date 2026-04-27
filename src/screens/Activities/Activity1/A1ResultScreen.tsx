// src/screens/Activities/Activity1/A1ResultScreen.tsx

import React, {useEffect, useMemo, useState} from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
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

import A1PredictedActualChart from "../../../components/charts/A1PredictedActualChart";
import ResultsInsightCard from "../../../components/insights/ResultsInsightCard";
import PerformanceFeedbackCard from "../../../components/feedback/PerformanceFeedbackCard";
import {
    buildA1Visualization,
    theoreticalDropTimeSec,
    type A1PredictionPoint,
} from "../../../services/resultInsights/activity1VisualizationService";
import {generatePerformanceFeedback} from "../../../services/performanceFeedback/performanceFeedbackService";

type Props = NativeStackScreenProps<AppStackParamList, "A1Result">;

const G = 9.8;

function attemptLabel(index: number): string {
    return index === 0 ? "Baseline" : `Prototype ${index}`;
}

function attemptFullLabel(index: number): string {
    return index === 0 ? "Baseline (No parachute)" : `Prototype ${index}`;
}

function round(n: number | undefined, dp: number = 2): number | undefined {
    if (typeof n !== "number" || !Number.isFinite(n)) return undefined;

    const f = Math.pow(10, dp);
    return Math.round(f * n) / f;
}

function isPosNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function isNonNegNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x) && x >= 0;
}

function formatNumber(
    value: number | undefined,
    digits = 2,
    unit = "",
): string {
    if (typeof value !== "number" || !Number.isFinite(value)) return "—";
    return `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

export default function A1ResultScreen({
                                           route,
                                           navigation,
                                       }: Props): React.JSX.Element | null {
    const user = auth.currentUser;
    const {activityId, runId, attemptIndex} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);
    const [attempt, setAttempt] = useState<AttemptDraft | null>(null);

    useEffect(() => {
        if (!user) return;

        const d = getRunDraft(runId);

        if (!d) {
            Alert.alert(
                "Session expired",
                "Your draft session was reset. Please start again.",
                [
                    {
                        text: "OK",
                        onPress: () =>
                            navigation.replace("A1SessionSetup", {activityId}),
                    },
                ],
            );
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

        const massUnknown =
            plan.payloadMassUnknown ?? session.payloadMassUnknown ?? false;
        const massG = plan.payloadMassG ?? session.payloadMassG;
        const massKg =
            !massUnknown && isPosNumber(massG) ? massG / 1000 : undefined;

        const velocity =
            isPosNumber(dropHeightM) && isPosNumber(tHit)
                ? dropHeightM / tHit
                : undefined;

        const acceleration =
            velocity != null && isPosNumber(tHit)
                ? velocity / tHit
                : undefined;

        const netForce =
            massKg != null && acceleration != null
                ? massKg * acceleration
                : undefined;

        const weight = massKg != null ? massKg * G : undefined;

        const dragForce =
            weight != null && netForce != null ? weight - netForce : undefined;

        let gForce: number | undefined;

        if (velocity != null && isPosNumber(tStop)) {
            const bounce = Boolean(meas?.bounceOccurred);

            if (bounce && isPosNumber(meas?.bounceTimeToPeakSec)) {
                const vUp = G * meas.bounceTimeToPeakSec;
                gForce = (velocity + vUp) / tStop / G;
            } else {
                gForce = velocity / tStop / G;
            }
        }

        return {
            velocity,
            acceleration,
            netForce,
            weight,
            dragForce,
            gForce,
        };
    }, [attempt, draft]);

    const visualization = useMemo(() => {
        if (!draft) {
            return buildA1Visualization([]);
        }

        const points: A1PredictionPoint[] = Object.entries(draft.attempts ?? {})
            .map(([key, item]) => {
                const index = Number(key);

                const itemHeight =
                    item.plan.dropHeightM ?? draft.session.dropHeightM;

                if (!isPosNumber(itemHeight)) {
                    return null;
                }

                const predictedTimeSec = theoreticalDropTimeSec(itemHeight);
                const actualTimeSec = item.measurements?.tHitSec;

                if (
                    !isPosNumber(predictedTimeSec) ||
                    !isPosNumber(actualTimeSec)
                ) {
                    return null;
                }

                const errorPercent =
                    (Math.abs(actualTimeSec - predictedTimeSec) /
                        actualTimeSec) *
                    100;

                return {
                    label: attemptLabel(index),
                    predictedTimeSec,
                    actualTimeSec,
                    errorPercent,
                };
            })
            .filter((point): point is A1PredictionPoint => point !== null);

        return buildA1Visualization(points);
    }, [draft]);

    const performanceFeedback = useMemo(
        () => generatePerformanceFeedback("activity1", visualization.points),
        [visualization.points],
    );

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

        navigation.navigate("A1AttemptPlan", {
            activityId,
            runId,
            attemptIndex: attemptIndex + 1,
        });
    }

    function onFinish() {
        persistComputed();
        navigation.navigate("A1Comparison", {activityId, runId});
    }

    if (!user) return null;

    if (!draft || !attempt) {
        return (
            <View style={styles.center}>
                <Text style={styles.loadingText}>Loading draft...</Text>
            </View>
        );
    }

    const meas = attempt.measurements;
    const session = draft.session;
    const plan = attempt.plan;

    const dropHeightM = plan.dropHeightM ?? session.dropHeightM;
    const massUnknown =
        plan.payloadMassUnknown ?? session.payloadMassUnknown ?? false;
    const massG = plan.payloadMassG ?? session.payloadMassG;

    const theoreticalTime = isPosNumber(dropHeightM)
        ? theoreticalDropTimeSec(dropHeightM)
        : undefined;
    const currentActualTime = meas?.tHitSec;

    const currentErrorPercent =
        isPosNumber(theoreticalTime) && isPosNumber(currentActualTime)
            ? (Math.abs(currentActualTime - theoreticalTime) /
                currentActualTime) *
            100
            : undefined;

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Results Dashboard</Text>
            <Text style={styles.sub}>{attemptFullLabel(attemptIndex)}</Text>

            <View style={styles.hero}>
                <Text style={styles.heroTitle}>Closest to Free-Fall Model</Text>
                <Text style={styles.heroScore}>
                    {visualization.best
                        ? `${visualization.best.errorPercent.toFixed(1)}%`
                        : "—"}
                </Text>
                <Text style={styles.heroMeta}>
                    {visualization.best
                        ? visualization.best.label
                        : "Complete a measured attempt to calculate accuracy."}
                </Text>
                <Text style={styles.heroHint}>
                    Accuracy compares theoretical drop time with actual measured
                    flight time.
                </Text>
            </View>

            <A1PredictedActualChart
                title="Free-Fall Model vs Actual Drop Time"
                subtitle="Theoretical time is calculated from drop height, then compared with measured flight time."
                data={visualization.points}
            />

            <ResultsInsightCard insight={visualization.insight}/>

            <PerformanceFeedbackCard feedback={performanceFeedback}/>

            <View style={styles.formulaCard}>
                <Text style={styles.cardTitle}>Physics Formula</Text>
                <Text style={styles.formula}>t = √(2h / g)</Text>
                <Text style={styles.note}>
                    t is theoretical drop time, h is drop height, and g is
                    gravitational acceleration. This model gives a baseline
                    physics prediction before parachute and drag effects are
                    considered.
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Current Attempt Accuracy</Text>

                <View style={styles.row}>
                    <Text style={styles.k}>Theoretical drop time</Text>
                    <Text style={styles.v}>
                        {formatNumber(theoreticalTime, 2, "s")}
                    </Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Actual flight time</Text>
                    <Text style={styles.v}>
                        {formatNumber(currentActualTime, 2, "s")}
                    </Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Difference from free-fall model</Text>
                    <Text style={styles.v}>
                        {formatNumber(currentErrorPercent, 1, "%")}
                    </Text>
                </View>

                <Text style={styles.note}>
                    A lower error percentage means the measured result is closer
                    to the theoretical physics model.
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Primary School View</Text>

                <View style={styles.row}>
                    <Text style={styles.k}>Flight time (t_hit)</Text>
                    <Text style={styles.v}>
                        {formatNumber(meas?.tHitSec, 2, "s")}
                    </Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Stopping time (t_stop)</Text>
                    <Text style={styles.v}>
                        {formatNumber(meas?.tStopSec, 2, "s")}
                    </Text>
                </View>

                {session.targetZoneEnabled ? (
                    <>
                        <View style={styles.row}>
                            <Text style={styles.k}>In target zone?</Text>
                            <Text style={styles.v}>
                                {typeof meas?.inTargetZone === "boolean"
                                    ? meas.inTargetZone
                                        ? "Yes"
                                        : "No"
                                    : "—"}
                            </Text>
                        </View>

                        <View style={styles.row}>
                            <Text style={styles.k}>Distance from center</Text>
                            <Text style={styles.v}>
                                {isNonNegNumber(meas?.distanceFromCenterCm)
                                    ? `${round(
                                        meas.distanceFromCenterCm,
                                        0,
                                    )} cm`
                                    : "—"}
                            </Text>
                        </View>
                    </>
                ) : (
                    <Text style={styles.note}>
                        Target zone not used in this session.
                    </Text>
                )}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>High School View</Text>
                <Text style={styles.help}>
                    Computations depend on known height and mass. If mass is
                    unknown, force-related values are not computed.
                </Text>

                <View style={styles.row}>
                    <Text style={styles.k}>Drop height</Text>
                    <Text style={styles.v}>
                        {formatNumber(dropHeightM, 2, "m")}
                    </Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Payload mass</Text>
                    <Text style={styles.v}>
                        {massUnknown
                            ? "Unknown"
                            : isPosNumber(massG)
                                ? `${round(massG, 0)} g`
                                : "—"}
                    </Text>
                </View>

                <View style={styles.divider}/>

                <View style={styles.row}>
                    <Text style={styles.k}>Final velocity (v = d / t_hit)</Text>
                    <Text style={styles.v}>
                        {formatNumber(computed.velocity, 2, "m/s")}
                    </Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Acceleration (a = v / t_hit)</Text>
                    <Text style={styles.v}>
                        {formatNumber(computed.acceleration, 2, "m/s²")}
                    </Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Net force (F_net = m × a)</Text>
                    <Text style={styles.v}>
                        {formatNumber(computed.netForce, 2, "N")}
                    </Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Weight (W = m × g)</Text>
                    <Text style={styles.v}>
                        {formatNumber(computed.weight, 2, "N")}
                    </Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Drag force (F_drag = W − F_net)</Text>
                    <Text style={styles.v}>
                        {formatNumber(computed.dragForce, 2, "N")}
                    </Text>
                </View>

                <View style={styles.divider}/>

                <View style={styles.row}>
                    <Text style={styles.k}>G-force impact</Text>
                    <Text style={styles.v}>
                        {formatNumber(computed.gForce, 1, "g")}
                    </Text>
                </View>

                {computed.gForce != null ? (
                    <Text style={styles.note}>
                        {computed.gForce < 5
                            ? "Likely safe range (1–5 g)."
                            : computed.gForce < 10
                                ? "Moderate impact (5–10 g)."
                                : computed.gForce < 30
                                    ? "High impact (10–30 g). Improve cushioning or parachute design."
                                    : "Very high impact. Consider better cushioning and parachute design."}
                    </Text>
                ) : (
                    <Text style={styles.note}>
                        G-force needs velocity and a positive stopping time.
                    </Text>
                )}
            </View>

            <Pressable style={styles.primaryBtn} onPress={onSaveAttempt}>
                <Text style={styles.primaryBtnText}>Save Attempt</Text>
            </Pressable>

            {canAddNextPrototype ? (
                <Pressable
                    style={styles.secondaryBtn}
                    onPress={onAddNextPrototype}
                >
                    <Text style={styles.secondaryBtnText}>
                        Add Next Prototype
                    </Text>
                </Pressable>
            ) : null}

            <Pressable style={styles.ghostBtn} onPress={onFinish}>
                <Text style={styles.ghostBtnText}>Finish & Compare</Text>
            </Pressable>

            <View style={styles.bottomSpace}/>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        padding: 20,
        backgroundColor: "#FFFFFF",
    },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
    },
    loadingText: {
        fontWeight: "900",
        color: "#172033",
    },
    title: {
        fontSize: 26,
        fontWeight: "900",
        marginTop: 6,
        color: "#172033",
    },
    sub: {
        marginTop: 8,
        opacity: 0.75,
        lineHeight: 18,
        fontWeight: "800",
        color: "#344054",
    },
    hero: {
        marginTop: 16,
        borderRadius: 16,
        backgroundColor: "#111827",
        padding: 16,
    },
    heroTitle: {
        color: "#FFFFFF",
        fontWeight: "900",
        opacity: 0.9,
    },
    heroScore: {
        color: "#FFFFFF",
        fontWeight: "900",
        fontSize: 36,
        marginTop: 6,
    },
    heroMeta: {
        color: "#FFFFFF",
        opacity: 0.9,
        marginTop: 4,
    },
    heroHint: {
        color: "#FFFFFF",
        opacity: 0.65,
        marginTop: 8,
        lineHeight: 18,
    },
    card: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#FAFAFA",
        borderRadius: 14,
        padding: 14,
    },
    formulaCard: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#F8FAFC",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: "900",
        color: "#172033",
    },
    formula: {
        marginTop: 10,
        fontSize: 28,
        fontWeight: "900",
        color: "#172033",
    },
    help: {
        marginTop: 8,
        opacity: 0.7,
        lineHeight: 18,
        color: "#344054",
    },
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 10,
        gap: 12,
    },
    k: {
        flex: 1,
        fontWeight: "800",
        opacity: 0.9,
        color: "#172033",
    },
    v: {
        fontWeight: "900",
        color: "#172033",
        textAlign: "right",
    },
    divider: {
        height: 1,
        backgroundColor: "#E5E7EB",
        marginTop: 12,
    },
    note: {
        marginTop: 10,
        opacity: 0.75,
        lineHeight: 18,
        color: "#344054",
    },
    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111827",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {
        color: "#FFFFFF",
        fontWeight: "900",
        fontSize: 16,
    },
    secondaryBtn: {
        marginTop: 10,
        backgroundColor: "#FFFFFF",
        borderWidth: 1,
        borderColor: "#111827",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText: {
        fontWeight: "900",
        color: "#111827",
    },
    ghostBtn: {
        marginTop: 10,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    ghostBtnText: {
        fontWeight: "900",
        opacity: 0.85,
        color: "#111827",
    },
    bottomSpace: {
        height: 30,
    },
});