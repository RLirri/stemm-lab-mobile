import React, {useCallback, useEffect, useMemo, useState} from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
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

import ActivityBarChart from "../../../components/charts/ActivityBarChart";
import ResultsInsightCard from "../../../components/insights/ResultsInsightCard";
import {
    buildA2Visualization,
    type A2VisualizationTrial,
} from "../../../services/resultInsights/activity2VisualizationService";

type Props = NativeStackScreenProps<AppStackParamList, "A2Results">;

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}

function normalize(s: string): string {
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
            reason: "Levels near sirens or horns can damage hearing immediately.",
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

function formatRiskLabel(cat?: SoundRiskCategory): string {
    if (!cat) return "—";
    const found = SOUND_RISK_BANDS.find(b => b.category === cat);
    return found?.label ?? String(cat);
}

export default function A2ResultsScreen({
                                            route,
                                            navigation,
                                        }: Props): React.JSX.Element | null {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity2RunDraft | null>(null);
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

    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            refreshDraft();
        }, [refreshDraft, user])
    );

    const computed = useMemo(() => {
        if (!draft) return null;

        const {score, validCount} = scoreActivity2AverageDb(draft.actions);

        const valid = draft.actions.filter(
            action =>
                action.isValid === true &&
                isFiniteNumber(action.dbAvg)
        );

        const maxDb = maxOrUndefined(
            valid
                .map(action =>
                    isFiniteNumber(action.dbMax)
                        ? action.dbMax
                        : action.dbAvg
                )
                .filter((x): x is number => isFiniteNumber(x))
        );

        const sorted = valid
            .slice()
            .sort((a, b) => (b.dbAvg as number) - (a.dbAvg as number));

        const loudest = sorted[0];
        const top3 = sorted.slice(0, 3);

        const predicted = (draft.session.predictedLoudestAction ?? "").trim();
        const loudestLabel = (loudest?.actionLabel ?? "").trim();

        const hasPrediction = predicted.length > 0;
        const hasOutcome = loudestLabel.length > 0;

        const predictionCorrect =
            hasPrediction && hasOutcome
                ? normalize(predicted) === normalize(loudestLabel)
                : undefined;

        return {
            validCount,
            avgDb: score,
            score,
            maxDb,
            loudestActionLabel: hasOutcome ? loudestLabel : undefined,
            loudestAvgDb: loudest?.dbAvg,
            loudestRisk: loudest?.riskCategory,
            top3,
            validActions: valid,
            predicted: hasPrediction ? predicted : undefined,
            wasPredictionCorrect: predictionCorrect,
        };
    }, [draft]);

    const visualization = useMemo(() => {
        if (!computed) return buildA2Visualization([]);

        const trials: A2VisualizationTrial[] = computed.validActions.map(action => ({
            label: action.actionLabel?.trim() || "Action",
            avgDb: action.dbAvg as number,
        }));

        return buildA2Visualization(trials);
    }, [computed]);

    const predictionSummary = useMemo(() => {
        const predicted = computed?.predicted;
        const loudest = computed?.loudestActionLabel;

        if (!predicted) {
            return {
                status: "missing" as const,
                text: "No prediction recorded.",
            };
        }

        if (!loudest) {
            return {
                status: "missing" as const,
                text: "No loudest action yet.",
            };
        }

        const correct = computed?.wasPredictionCorrect === true;

        return {
            status: correct ? "correct" as const : "wrong" as const,
            text: correct ? "You were right" : "Not this time",
        };
    }, [
        computed?.loudestActionLabel,
        computed?.predicted,
        computed?.wasPredictionCorrect,
    ]);

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
                        onPress: () =>
                            navigation.navigate("A2Measurement", {
                                activityId,
                                runId,
                            }),
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
                <Text style={styles.loadingText}>Loading results…</Text>
            </View>
        );
    }

    const avgRisk = classifySoundRisk(computed.avgDb);
    const earmuffs = pickEarmuffRecommendation(computed.avgDb, computed.maxDb);
    const canContinue = computed.validCount >= 3;

    return (
        <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
        >
            <Text style={styles.title}>Results Dashboard</Text>
            <Text style={styles.sub}>
                Review sound measurements, compare noise levels, and interpret hearing-risk exposure.
            </Text>

            <View style={styles.hero}>
                <Text style={styles.heroTitle}>Noisiest Action</Text>
                <Text style={styles.heroScore}>
                    {visualization.noisiest
                        ? `${visualization.noisiest.avgDb.toFixed(1)} dB`
                        : "—"}
                </Text>
                <Text style={styles.heroMeta}>
                    {visualization.noisiest?.label ?? "Record valid measurements to calculate this."}
                </Text>
                <Text style={styles.heroHint}>
                    Higher dB values represent louder environments and greater potential exposure risk.
                </Text>
            </View>

            <ActivityBarChart
                title="Noise Level Comparison"
                subtitle="Average decibel level across recorded actions"
                data={visualization.chartData}
                unitLabel="dB"
            />

            <ResultsInsightCard insight={visualization.insight}/>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Noise Level Guide</Text>

                <View style={styles.guideRow}>
                    <View style={[styles.guideDot, {backgroundColor: "#16A34A"}]}/>
                    <Text style={styles.guideText}>Below 60 dB: generally comfortable</Text>
                </View>

                <View style={styles.guideRow}>
                    <View style={[styles.guideDot, {backgroundColor: "#F59E0B"}]}/>
                    <Text style={styles.guideText}>60–84 dB: moderate to loud</Text>
                </View>

                <View style={styles.guideRow}>
                    <View style={[styles.guideDot, {backgroundColor: "#EF4444"}]}/>
                    <Text style={styles.guideText}>85 dB and above: risky for long exposure</Text>
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Prediction vs Outcome</Text>

                <Row
                    label="Predicted loudest action"
                    value={draft.session.predictedLoudestAction?.trim() || "—"}
                />

                <Row
                    label="Measured loudest action"
                    value={computed.loudestActionLabel ?? "—"}
                />

                <View style={styles.badgeRow}>
                    <Text style={styles.badgeLabel}>Prediction result</Text>
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
                        <Text style={styles.badgeText}>
                            {predictionSummary.text}
                        </Text>
                    </View>
                </View>

                <Text style={styles.help}>
                    Phone dB estimates are approximate. Keep distance and device position consistent for fair
                    comparison.
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Session Summary</Text>

                <Row label="Valid measurements" value={String(computed.validCount)}/>
                <Row label="Average score" value={`${round1(computed.avgDb)} dB`}/>
                <Row label="Average risk category" value={avgRisk?.label ?? "—"}/>
                <Row
                    label="Max peak"
                    value={
                        isFiniteNumber(computed.maxDb)
                            ? `${round1(computed.maxDb)} dB`
                            : "—"
                    }
                />

                <View style={styles.divider}/>

                <Text style={styles.sectionTitle}>Top 3 loudest actions</Text>

                {computed.top3.length ? (
                    computed.top3.map((action, index) => (
                        <View key={action.id} style={styles.topRow}>
                            <Text style={styles.topIndex}>#{index + 1}</Text>

                            <View style={styles.topContent}>
                                <Text style={styles.topAction}>
                                    {action.actionLabel || "Action"}
                                </Text>
                                <Text style={styles.topMeta}>
                                    {isFiniteNumber(action.dbAvg)
                                        ? `${round1(action.dbAvg)} dB`
                                        : "—"}{" "}
                                    • {action.riskLabel ?? formatRiskLabel(action.riskCategory)}
                                </Text>
                            </View>
                        </View>
                    ))
                ) : (
                    <Text style={styles.help}>
                        No valid actions yet. Go back and record at least 3 valid measurements.
                    </Text>
                )}
            </View>

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
                    style={[styles.input, styles.multiInput]}
                    multiline
                />
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Any surprises?</Text>
                <Text style={styles.help}>
                    Sound intensity varies with energy, surfaces, distance, and duration.
                </Text>

                <Text style={styles.label}>Write-up notes (optional)</Text>
                <TextInput
                    value={surprises}
                    onChangeText={setSurprises}
                    placeholder="e.g. Talking near the wall was louder than expected because sound reflected..."
                    style={[styles.input, styles.largeInput]}
                    multiline
                />
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>
                    Sound Levels & Hearing Damage Risk
                </Text>
                <Text style={styles.help}>
                    Reference table required by the activity specification.
                </Text>

                <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.cell, styles.hCell, styles.dbCell]}>dB</Text>
                    <Text style={[styles.cell, styles.hCell, styles.exampleCell]}>Examples</Text>
                    <Text style={[styles.cell, styles.hCell, styles.riskCell]}>Risk</Text>
                </View>

                {SOUND_RISK_BANDS.map(band => (
                    <View key={band.rangeLabel} style={styles.tableRow}>
                        <Text style={[styles.cell, styles.dbCell]}>
                            {band.rangeLabel}
                        </Text>
                        <Text style={[styles.cell, styles.exampleCell]}>
                            {band.examples}
                        </Text>
                        <Text style={[styles.cell, styles.riskCell]}>
                            {band.riskText}
                        </Text>
                    </View>
                ))}
            </View>

            {!canContinue ? (
                <View style={styles.warnCard}>
                    <Text style={styles.warnTitle}>Not ready to submit</Text>
                    <Text style={styles.warnBody}>
                        You currently have {computed.validCount} valid measurement(s). Record at least 3 valid
                        measurements to continue.
                    </Text>
                </View>
            ) : null}

            <Pressable
                style={[styles.primaryBtn, !canContinue && styles.disabledBtn]}
                onPress={onContinueToSubmit}
                disabled={!canContinue}
            >
                <Text style={styles.primaryBtnText}>
                    Continue to Submission
                </Text>
            </Pressable>

            <Pressable
                style={styles.secondaryBtn}
                onPress={() =>
                    navigation.navigate("A2Measurement", {activityId, runId})
                }
            >
                <Text style={styles.secondaryBtnText}>
                    Back to Measurements
                </Text>
            </Pressable>

            <View style={styles.bottomSpace}/>
        </ScrollView>
    );
}

function Row({
                 label,
                 value,
             }: {
    label: string;
    value: string;
}): React.JSX.Element {
    return (
        <View style={styles.row}>
            <Text style={styles.k}>{label}</Text>
            <Text style={styles.v}>{value}</Text>
        </View>
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
        lineHeight: 20,
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
    cardTitle: {
        fontSize: 16,
        fontWeight: "900",
        color: "#172033",
    },
    sectionTitle: {
        marginTop: 10,
        fontWeight: "900",
        opacity: 0.9,
        color: "#172033",
    },
    help: {
        marginTop: 8,
        opacity: 0.7,
        lineHeight: 18,
        color: "#344054",
    },
    label: {
        marginTop: 12,
        fontWeight: "800",
        color: "#172033",
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
        textAlign: "right",
        color: "#172033",
        flexShrink: 1,
    },
    divider: {
        height: 1,
        backgroundColor: "#E5E7EB",
        marginTop: 12,
    },
    badgeRow: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    badgeLabel: {
        fontWeight: "800",
        opacity: 0.9,
        color: "#172033",
    },
    badge: {
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    badgeYes: {
        backgroundColor: "#111827",
    },
    badgeNo: {
        backgroundColor: "#777777",
    },
    badgeNeutral: {
        backgroundColor: "#999999",
    },
    badgeText: {
        color: "#FFFFFF",
        fontWeight: "900",
    },
    guideRow: {
        marginTop: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    guideDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    guideText: {
        flex: 1,
        color: "#344054",
        fontWeight: "700",
    },
    topRow: {
        marginTop: 10,
        flexDirection: "row",
        gap: 10,
        alignItems: "flex-start",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 12,
    },
    topIndex: {
        width: 38,
        textAlign: "center",
        fontWeight: "900",
        backgroundColor: "#111827",
        color: "#FFFFFF",
        borderRadius: 10,
        overflow: "hidden",
        paddingVertical: 6,
    },
    topContent: {
        flex: 1,
    },
    topAction: {
        fontWeight: "900",
        color: "#172033",
    },
    topMeta: {
        marginTop: 6,
        opacity: 0.75,
        lineHeight: 18,
        color: "#344054",
    },
    recoBox: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: "#111827",
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        padding: 12,
    },
    recoTitle: {
        fontWeight: "900",
        color: "#172033",
    },
    recoBody: {
        marginTop: 6,
        opacity: 0.8,
        lineHeight: 18,
        color: "#344054",
    },
    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        color: "#172033",
    },
    multiInput: {
        height: 90,
        textAlignVertical: "top",
    },
    largeInput: {
        height: 110,
        textAlignVertical: "top",
    },
    tableHeader: {
        borderBottomWidth: 1,
        borderBottomColor: "#E5E7EB",
        paddingBottom: 8,
    },
    tableRow: {
        flexDirection: "row",
        gap: 10,
        marginTop: 10,
    },
    cell: {
        fontWeight: "800",
        opacity: 0.9,
        color: "#172033",
    },
    hCell: {
        fontWeight: "900",
        opacity: 0.85,
    },
    dbCell: {
        flex: 1.1,
    },
    exampleCell: {
        flex: 2.2,
    },
    riskCell: {
        flex: 1.7,
    },
    warnCard: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#111827",
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 14,
    },
    warnTitle: {
        fontSize: 15,
        fontWeight: "900",
        color: "#172033",
    },
    warnBody: {
        marginTop: 8,
        opacity: 0.85,
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
    disabledBtn: {
        opacity: 0.6,
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
    bottomSpace: {
        height: 30,
    },
});