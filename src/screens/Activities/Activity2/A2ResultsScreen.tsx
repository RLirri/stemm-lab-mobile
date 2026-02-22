import React, {useCallback, useEffect, useMemo, useState} from "react";
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";
import {useFocusEffect} from "@react-navigation/native";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";

import {
    getActivity2RunDraft,
    setA2Computed,
    type Activity2RunDraft,
} from "../../../store/activity2RunDraftStore";

import {
    classifySoundRisk,
    scoreActivity2AverageDb,
    SOUND_RISK_BANDS,
    type SoundRiskCategory,
} from "../../../services/scoringService";

type Props = NativeStackScreenProps<AppStackParamList, "A2Results">;

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function round1(n: number) {
    return Math.round(n * 10) / 10;
}

function normalize(s: string) {
    return s.trim().toLowerCase();
}

function maxOrUndefined(nums: number[]): number | undefined {
    if (!nums.length) return undefined;
    return nums.reduce((m, v) => (v > m ? v : m), nums[0]);
}

function pickEarmuffRecommendation(avgDb: number, maxDb?: number) {
    const peak = isFiniteNumber(maxDb) ? maxDb : avgDb;

    if (peak >= 110) {
        return {
            level: "Strongly recommended",
            reason: "Levels near sirens/horns can damage hearing immediately.",
        };
    }
    if (peak >= 100) {
        return {
            level: "Recommended",
            reason: "Very loud levels can cause serious hearing damage in minutes.",
        };
    }
    if (peak >= 85) {
        return {
            level: "Consider for long exposure",
            reason: "Sustained exposure around 85–90 dB can lead to hearing damage.",
        };
    }
    if (peak >= 60) {
        return {
            level: "Not needed for short activities",
            reason: "Generally safe, but long exposure can cause fatigue.",
        };
    }
    return {
        level: "Not needed",
        reason: "Quiet levels pose no hearing risk.",
    };
}

function formatRiskLabel(cat?: SoundRiskCategory) {
    if (!cat) return "—";
    const found = SOUND_RISK_BANDS.find((b) => b.category === cat);
    return found?.label ?? String(cat);
}

export default function A2ResultsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity2RunDraft | null>(null);

    // write-up fields (local-only; submit screen handles final reflection)
    const [surprises, setSurprises] = useState<string>("");
    const [earmuffsThought, setEarmuffsThought] = useState<string>("");

    const refreshDraft = useCallback(() => {
        const d = getActivity2RunDraft(runId);
        setDraft(d ?? null);
    }, [runId]);

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

    // Critical: refresh when returning from Map/Measurement
    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            refreshDraft();
        }, [refreshDraft, user])
    );

    const computed = useMemo(() => {
        if (!draft) return null;

        // Always recompute — avoids stale state issues.
        const {score, validCount} = scoreActivity2AverageDb(draft.actions);

        const valid = draft.actions.filter((a) => a.isValid === true && isFiniteNumber(a.dbAvg));

        // Peak: use dbMax if present; else fallback to dbAvg.
        const maxDb = maxOrUndefined(
            valid
                .map((a) => (isFiniteNumber(a.dbMax) ? (a.dbMax as number) : (a.dbAvg as number)))
                .filter((x): x is number => isFiniteNumber(x))
        );

        // Loudest action by avg dB (ties: stable by order)
        const sorted = valid.slice().sort((a, b) => (b.dbAvg as number) - (a.dbAvg as number));
        const loudest = sorted[0];
        const top3 = sorted.slice(0, 3);

        const predicted = (draft.session.predictedLoudestAction ?? "").trim();
        const loudestLabel = (loudest?.actionLabel ?? "").trim();

        const hasPrediction = predicted.length > 0;
        const hasOutcome = loudestLabel.length > 0;

        const predictionCorrect =
            hasPrediction && hasOutcome ? normalize(predicted) === normalize(loudestLabel) : undefined;

        return {
            validCount,
            avgDb: score,
            score,

            maxDb,

            loudestActionLabel: hasOutcome ? loudestLabel : undefined,
            loudestAvgDb: loudest?.dbAvg,
            loudestRisk: loudest?.riskCategory,

            top3,

            predicted: hasPrediction ? predicted : undefined,
            wasPredictionCorrect: predictionCorrect,
        };
    }, [draft]);

    const predictionSummary = useMemo(() => {
        const predicted = computed?.predicted;
        const loudest = computed?.loudestActionLabel;

        if (!predicted) return {status: "missing" as const, text: "No prediction recorded."};
        if (!loudest) return {status: "missing" as const, text: "No loudest action yet (need valid readings)."};
        const correct = computed?.wasPredictionCorrect === true;
        return {status: correct ? "correct" : "wrong", text: correct ? "You were right ✅" : "Not this time ❌"};
    }, [computed?.loudestActionLabel, computed?.predicted, computed?.wasPredictionCorrect]);

    function persistComputedForSubmission() {
        if (!computed) return;

        setA2Computed(runId, {
            validCount: computed.validCount,
            avgDb: computed.avgDb,
            score: computed.score,
            loudestActionLabel: computed.loudestActionLabel,
            wasPredictionCorrect: computed.wasPredictionCorrect,
            updatedAt: Date.now(),
        });
    }

    function onContinueToSubmit() {
        if (!draft || !computed) return;

        if (computed.validCount < 3) {
            Alert.alert(
                "Minimum requirement",
                "You must have at least 3 valid measurements to continue.",
                [
                    {
                        text: "Back to Measurements",
                        onPress: () => navigation.navigate("A2Measurement", {activityId, runId}),
                    },
                    {text: "OK", style: "cancel"},
                ]
            );
            return;
        }

        persistComputedForSubmission();
        navigation.navigate("A2ReflectionSubmit", {activityId, runId});
    }

    if (!user) return null;

    if (!draft || !computed) {
        return (
            <View style={styles.center}>
                <Text style={{fontWeight: "900"}}>Loading results…</Text>
            </View>
        );
    }

    const avgRisk = classifySoundRisk(computed.avgDb);
    const earmuffs = pickEarmuffRecommendation(computed.avgDb, computed.maxDb);

    const canContinue = computed.validCount >= 3;

    return (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Results Dashboard</Text>
            <Text style={styles.sub}>
                Review outcomes, check your prediction, and interpret risk using the reference table.
            </Text>

            {/* Prediction vs Outcome */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Prediction vs Outcome</Text>

                <View style={styles.row}>
                    <Text style={styles.k}>Predicted loudest action</Text>
                    <Text style={styles.v}>{draft.session.predictedLoudestAction?.trim() || "—"}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Measured loudest action</Text>
                    <Text style={styles.v}>{computed.loudestActionLabel ?? "—"}</Text>
                </View>

                <View style={[styles.badgeRow, {marginTop: 10}]}>
                    <Text style={styles.badgeLabel}>Were you right?</Text>
                    <View
                        style={[
                            styles.badge,
                            predictionSummary.status === "correct"
                                ? styles.badgeYes
                                : predictionSummary.status === "wrong"
                                    ? styles.badgeNo
                                    : styles.badgeNeutral,
                        ]}
                    >
                        <Text style={styles.badgeText}>{predictionSummary.text}</Text>
                    </View>
                </View>

                <Text style={styles.help}>
                    Phone dB estimates are approximate. Keep distance and device position consistent for fair
                    comparison.
                </Text>
            </View>

            {/* Session stats */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Session Summary</Text>

                <View style={styles.row}>
                    <Text style={styles.k}>Valid measurements</Text>
                    <Text style={styles.v}>{computed.validCount}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Average (score)</Text>
                    <Text style={styles.v}>{round1(computed.avgDb)} dB</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Average risk category</Text>
                    <Text style={styles.v}>{avgRisk?.label ?? "—"}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Max (peak)</Text>
                    <Text style={styles.v}>
                        {isFiniteNumber(computed.maxDb) ? `${round1(computed.maxDb)} dB` : "—"}
                    </Text>
                </View>

                <View style={styles.divider}/>

                <Text style={styles.sectionTitle}>Top 3 loudest actions</Text>
                {computed.top3.length ? (
                    computed.top3.map((a, idx) => (
                        <View key={a.id} style={styles.topRow}>
                            <Text style={styles.topIndex}>#{idx + 1}</Text>
                            <View style={{flex: 1}}>
                                <Text style={styles.topAction}>{a.actionLabel || "Action"}</Text>
                                <Text style={styles.topMeta}>
                                    {isFiniteNumber(a.dbAvg) ? `${round1(a.dbAvg)} dB` : "—"} •{" "}
                                    {a.riskLabel ?? formatRiskLabel(a.riskCategory)}
                                </Text>
                            </View>
                        </View>
                    ))
                ) : (
                    <Text style={styles.help}>No valid actions yet. Go back and record at least 3 valid
                        measurements.</Text>
                )}
            </View>

            {/* Earmuffs recommendation */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Should we wear earmuffs?</Text>

                <View style={styles.recoBox}>
                    <Text style={styles.recoTitle}>{earmuffs.level}</Text>
                    <Text style={styles.recoBody}>{earmuffs.reason}</Text>
                </View>

                <Text style={styles.label}>Your reasoning (optional notes)</Text>
                <TextInput
                    value={earmuffsThought}
                    onChangeText={setEarmuffsThought}
                    placeholder="e.g. If our classroom often exceeds 85 dB, we should reduce exposure or use protection..."
                    style={[styles.input, {height: 90, textAlignVertical: "top"}]}
                    multiline
                />
            </View>

            {/* Surprises */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Any surprises?</Text>
                <Text style={styles.help}>Sound intensity varies with energy, surfaces, distance, and duration.</Text>

                <Text style={styles.label}>Write-up notes (optional)</Text>
                <TextInput
                    value={surprises}
                    onChangeText={setSurprises}
                    placeholder="e.g. Talking near the wall was louder than expected because sound reflected..."
                    style={[styles.input, {height: 110, textAlignVertical: "top"}]}
                    multiline
                />
            </View>

            {/* Risk reference table (required) */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Sound Levels & Hearing Damage Risk</Text>
                <Text style={styles.help}>Reference table required by the activity specification.</Text>

                <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.cell, styles.hCell, {flex: 1.1}]}>dB</Text>
                    <Text style={[styles.cell, styles.hCell, {flex: 2.2}]}>Examples</Text>
                    <Text style={[styles.cell, styles.hCell, {flex: 1.7}]}>Risk</Text>
                </View>

                {SOUND_RISK_BANDS.map((b) => (
                    <View key={b.rangeLabel} style={styles.tableRow}>
                        <Text style={[styles.cell, {flex: 1.1}]}>{b.rangeLabel}</Text>
                        <Text style={[styles.cell, {flex: 2.2}]}>{b.examples}</Text>
                        <Text style={[styles.cell, {flex: 1.7}]}>{b.riskText}</Text>
                    </View>
                ))}
            </View>

            {!canContinue ? (
                <View style={styles.warnCard}>
                    <Text style={styles.warnTitle}>Not ready to submit</Text>
                    <Text style={styles.warnBody}>
                        You currently have {computed.validCount} valid measurement(s). Record at least 3 valid
                        measurements to
                        continue.
                    </Text>
                </View>
            ) : null}

            <Pressable style={[styles.primaryBtn, !canContinue && {opacity: 0.6}]} onPress={onContinueToSubmit}
                       disabled={!canContinue}>
                <Text style={styles.primaryBtnText}>Continue to Submission</Text>
            </Pressable>

            <Pressable style={styles.secondaryBtn}
                       onPress={() => navigation.navigate("A2Measurement", {activityId, runId})}>
                <Text style={styles.secondaryBtnText}>Back to Measurements</Text>
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
    sectionTitle: {marginTop: 10, fontWeight: "900", opacity: 0.9},

    help: {marginTop: 8, opacity: 0.7, lineHeight: 18},
    label: {marginTop: 12, fontWeight: "800"},

    row: {flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 12},
    k: {flex: 1, fontWeight: "800", opacity: 0.9},
    v: {fontWeight: "900"},

    divider: {height: 1, backgroundColor: "#e5e5e5", marginTop: 12},

    badgeRow: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10},
    badgeLabel: {fontWeight: "800", opacity: 0.9},
    badge: {borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10},
    badgeYes: {backgroundColor: "#111"},
    badgeNo: {backgroundColor: "#777"},
    badgeNeutral: {backgroundColor: "#999"},
    badgeText: {color: "white", fontWeight: "900"},

    topRow: {
        marginTop: 10,
        flexDirection: "row",
        gap: 10,
        alignItems: "flex-start",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    topIndex: {
        width: 38,
        textAlign: "center",
        fontWeight: "900",
        backgroundColor: "#111",
        color: "white",
        borderRadius: 10,
        overflow: "hidden",
        paddingVertical: 6,
    },
    topAction: {fontWeight: "900"},
    topMeta: {marginTop: 6, opacity: 0.75, lineHeight: 18},

    recoBox: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: "#111",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    recoTitle: {fontWeight: "900"},
    recoBody: {marginTop: 6, opacity: 0.8, lineHeight: 18},

    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
    },

    tableHeader: {borderBottomWidth: 1, borderBottomColor: "#e5e5e5", paddingBottom: 8},
    tableRow: {flexDirection: "row", gap: 10, marginTop: 10},
    cell: {fontWeight: "800", opacity: 0.9},
    hCell: {fontWeight: "900", opacity: 0.85},

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
});