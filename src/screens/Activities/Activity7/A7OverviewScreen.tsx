// src/screens/Activities/Activity7/A7OverviewScreen.tsx

import React, {useMemo} from "react";
import {Pressable, ScrollView, StyleSheet, Text, View} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import activity07_breathingPaceTrainer from "../../../features/activities/definitions/activity07_breathingPaceTrainer";

type Props = NativeStackScreenProps<AppStackParamList, "A7Overview">;

type PhaseCardProps = {
    title: string;
    subtitle?: string;
    steps: string[];
    highlight?: string;
};

function PhaseCard({title, subtitle, steps, highlight}: PhaseCardProps) {
    return (
        <View style={styles.card}>
            <Text style={styles.cardTitle}>{title}</Text>
            {subtitle ? <Text style={styles.cardSub}>{subtitle}</Text> : null}

            <View style={{marginTop: 10, gap: 8}}>
                {steps.map((s, idx) => (
                    <View key={`${title}_${idx}`} style={styles.stepRow}>
                        <View style={styles.stepBadge}>
                            <Text style={styles.stepBadgeText}>{idx + 1}</Text>
                        </View>
                        <Text style={styles.stepText}>{s}</Text>
                    </View>
                ))}
            </View>

            {highlight ? <Text style={styles.cardHighlight}>{highlight}</Text> : null}
        </View>
    );
}

function InfoRow(props: { left: string; right: string }) {
    return (
        <View style={styles.infoRow}>
            <Text style={styles.infoLeft}>{props.left}</Text>
            <Text style={styles.infoRight}>{props.right}</Text>
        </View>
    );
}

export default function A7OverviewScreen({route, navigation}: Props) {
    const activity = activity07_breathingPaceTrainer;
    const activityId = route.params?.activityId ?? activity.id;

    const equipment = Array.isArray(activity.equipment) ? activity.equipment : [];

    const tableRows = useMemo(
        () => [
            {
                stage: "Breathing at Rest",
                prediction: "e.g. 12 breaths/min",
                outcome: "Measured BPM + duration",
                right: "Yes / No",
            },
            {
                stage: "After Exercise 1 (1-min jog)",
                prediction: "e.g. 20 breaths/min",
                outcome: "Measured BPM + duration",
                right: "Yes / No",
            },
            {
                stage: "After Exercise 2 (100 star jumps)",
                prediction: "e.g. 24 breaths/min",
                outcome: "Measured BPM + duration",
                right: "Any surprises?",
            },
        ],
        []
    );

    function onStart() {
        navigation.navigate("A7SessionSetup", {activityId});
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>{activity.title}</Text>
            <Text style={styles.subtitle}>Medical Science</Text>

            <View style={styles.hero}>
                <Text style={styles.heroText}>
                    Analyse breathing patterns at rest and after exercise by placing the phone gently
                    on the chest and recording accelerometer motion. The app estimates breaths per
                    minute, compares phase changes, and calculates recovery consistency across team
                    participants.
                </Text>

                <View style={styles.heroTagRow}>
                    <View style={styles.tag}>
                        <Text style={styles.tagText}>Chest motion</Text>
                    </View>
                    <View style={styles.tag}>
                        <Text style={styles.tagText}>Accelerometer</Text>
                    </View>
                    <View style={styles.tag}>
                        <Text style={styles.tagText}>Breaths / min</Text>
                    </View>
                    <View style={styles.tag}>
                        <Text style={styles.tagText}>Recovery comparison</Text>
                    </View>
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Objective</Text>
                <Text style={styles.body}>
                    Investigate how breathing changes from <Text style={styles.bold}>rest</Text> to{" "}
                    <Text style={styles.bold}>exercise</Text>, then compare how consistently breathing
                    begins to recover across the required post-exercise phases.
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Equipment</Text>
                <View style={{marginTop: 10, gap: 8}}>
                    {equipment.length > 0 ? (
                        equipment.map((e, i) => (
                            <View key={`eq_${i}`} style={styles.bulletRow}>
                                <Text style={styles.bulletDot}>•</Text>
                                <Text style={styles.bulletText}>{e}</Text>
                            </View>
                        ))
                    ) : (
                        <>
                            <View style={styles.bulletRow}>
                                <Text style={styles.bulletDot}>•</Text>
                                <Text style={styles.bulletText}>Mobile phone with STEMM Lab app</Text>
                            </View>
                            <View style={styles.bulletRow}>
                                <Text style={styles.bulletDot}>•</Text>
                                <Text style={styles.bulletText}>Flat surface or mat</Text>
                            </View>
                        </>
                    )}
                </View>
            </View>

            <PhaseCard
                title="Phase 0 — Prediction"
                subtitle="Prediction must be completed before any measurement begins."
                steps={[
                    "Enter predicted breathing rate at rest.",
                    "Enter predicted breathing rate after exercise.",
                    "Think about which phase may show the highest breathing rate.",
                ]}
                highlight="Prediction is required before recording starts."
            />

            <PhaseCard
                title="Phase 1 — Rest Measurement"
                subtitle="Record breathing when the participant is calm and still."
                steps={[
                    "Select the participant.",
                    "Place the phone gently on the chest.",
                    "Keep the participant as still as possible during recording.",
                    "Save the measured breathing rate for the rest phase.",
                ]}
                highlight="Use consistent phone placement for all phases to improve fairness."
            />

            <PhaseCard
                title="Phase 2 — Post-Exercise Measurement 1"
                subtitle="Measure breathing after one minute of jogging on the spot."
                steps={[
                    "Ask the participant to jog on the spot for one minute.",
                    "Place the phone gently on the chest again.",
                    "Record breathing using the same measurement duration.",
                    "Save the post-jog breathing result.",
                ]}
                highlight="Breathing rate is expected to rise because exercise increases oxygen demand."
            />

            <PhaseCard
                title="Phase 3 — Post-Exercise Measurement 2"
                subtitle="Measure breathing after 100 star jumps."
                steps={[
                    "Ask the participant to complete 100 star jumps.",
                    "Place the phone gently on the chest again.",
                    "Record breathing with the same setup as the previous phases.",
                    "Save the post-star-jumps breathing result and rotate to the next participant.",
                ]}
                highlight="Each participant must complete all three required phases."
            />

            <View style={styles.card}>
                <Text style={styles.cardTitle}>What the app records</Text>

                <View style={{marginTop: 10, gap: 10}}>
                    <InfoRow
                        left="Sensor dataset"
                        right="accelerometer x/y/z values, timestamps, and sampling metadata"
                    />
                    <InfoRow
                        left="Breathing outputs"
                        right="estimated breaths per minute, detected cycles, and duration"
                    />
                    <InfoRow
                        left="Comparison metrics"
                        right="rest → jog, rest → star jumps, jog → star jumps, and recovery consistency"
                    />
                    <InfoRow
                        left="Submission items"
                        right="all phase datasets, reflection, rating, GPS, optional session video"
                    />
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Write-up (Plain language)</Text>
                <Text style={styles.cardSub}>
                    Breathing rate usually increases during exercise because the body needs more
                    oxygen. By recording chest motion, the app helps students visualise breathing
                    changes and compare how breathing behaves across rest and post-exercise stages.
                </Text>

                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <Text style={[styles.th, {flex: 1.2}]}>Stage</Text>
                        <Text style={[styles.th, {flex: 1.1}]}>Prediction</Text>
                        <Text style={[styles.th, {flex: 1.2}]}>Outcome</Text>
                        <Text style={[styles.th, {flex: 0.9}]}>Were you right?</Text>
                    </View>

                    {tableRows.map((r, idx) => (
                        <View key={`row_${idx}`} style={styles.tableRow}>
                            <Text style={[styles.td, {flex: 1.2}]}>{r.stage}</Text>
                            <Text style={[styles.td, {flex: 1.1}]}>{r.prediction}</Text>
                            <Text style={[styles.td, {flex: 1.2}]}>{r.outcome}</Text>
                            <Text style={[styles.td, {flex: 0.9}]}>{r.right}</Text>
                        </View>
                    ))}
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Leaderboard rule</Text>
                <Text style={styles.cardSub}>
                    Ranking prioritises the best recovery consistency result. Lower recovery
                    variability indicates a more stable breathing recovery pattern relative to the
                    resting phase.
                </Text>

                <View style={{marginTop: 10, gap: 8}}>
                    <View style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>
                            Primary: lowest recovery consistency score
                        </Text>
                    </View>
                    <View style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>
                            All required breathing phases must be completed to be eligible
                        </Text>
                    </View>
                    <View style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>
                            Best participant result is stored with the team submission
                        </Text>
                    </View>
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Safety & fairness</Text>
                <View style={{marginTop: 10, gap: 8}}>
                    {[
                        "Place the phone gently on the chest and avoid pressing too hard.",
                        "Use the same phone placement style for all phases.",
                        "Keep the participant still during each recording window.",
                        "Allow enough space for jogging and star jumps before measurement.",
                        "Stop immediately if the participant feels discomfort, dizziness, or pain.",
                    ].map((s, i) => (
                        <View key={`safe_${i}`} style={styles.bulletRow}>
                            <Text style={styles.bulletDot}>•</Text>
                            <Text style={styles.bulletText}>{s}</Text>
                        </View>
                    ))}
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Submission Requirements</Text>
                <View style={{marginTop: 10, gap: 8}}>
                    <View style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>
                            Sensor readings for all required measurement phases
                        </Text>
                    </View>
                    <View style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>Reflection text</Text>
                    </View>
                    <View style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>Rating (1–5)</Text>
                    </View>
                    <View style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>GPS coordinates</Text>
                    </View>
                    <View style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>Optional session video evidence</Text>
                    </View>
                </View>
            </View>

            <Pressable style={styles.primaryBtn} onPress={onStart}>
                <Text style={styles.primaryBtnText}>Start Activity</Text>
            </Pressable>

            <View style={{height: 36}}/>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        padding: 20,
        backgroundColor: "#fff",
    },
    title: {
        fontSize: 26,
        fontWeight: "900",
        marginTop: 6,
    },
    subtitle: {
        marginTop: 6,
        opacity: 0.75,
        fontWeight: "800",
    },
    bold: {
        fontWeight: "900",
    },

    hero: {
        marginTop: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        padding: 14,
    },
    heroText: {
        opacity: 0.85,
        lineHeight: 20,
        fontWeight: "600",
    },
    heroTagRow: {
        marginTop: 12,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    tag: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "#fff",
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
    },
    tagText: {
        fontWeight: "900",
        opacity: 0.85,
    },

    card: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 16,
        padding: 14,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: "900",
    },
    cardSub: {
        marginTop: 8,
        opacity: 0.75,
        lineHeight: 18,
    },
    body: {
        marginTop: 8,
        opacity: 0.85,
        lineHeight: 20,
        fontWeight: "600",
    },

    bulletRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
    },
    bulletDot: {
        marginTop: 1,
        fontWeight: "900",
    },
    bulletText: {
        flex: 1,
        opacity: 0.85,
        lineHeight: 18,
        fontWeight: "600",
    },

    stepRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
    },
    stepBadge: {
        width: 24,
        height: 24,
        borderRadius: 999,
        backgroundColor: "#111",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 1,
    },
    stepBadgeText: {
        color: "white",
        fontWeight: "900",
        fontSize: 12,
    },
    stepText: {
        flex: 1,
        opacity: 0.88,
        lineHeight: 18,
        fontWeight: "600",
    },
    cardHighlight: {
        marginTop: 12,
        opacity: 0.8,
        fontStyle: "italic",
        lineHeight: 18,
    },

    infoRow: {
        borderWidth: 1,
        borderColor: "#e9e9e9",
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
    },
    infoLeft: {
        fontWeight: "900",
    },
    infoRight: {
        marginTop: 6,
        opacity: 0.75,
        lineHeight: 18,
        fontWeight: "600",
    },

    table: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#e9e9e9",
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#fff",
    },
    tableRow: {
        flexDirection: "row",
        paddingVertical: 10,
        paddingHorizontal: 10,
    },
    tableHeader: {
        backgroundColor: "#111",
    },
    th: {
        color: "white",
        fontWeight: "900",
        fontSize: 12,
    },
    td: {
        fontWeight: "700",
        opacity: 0.85,
        fontSize: 12,
    },

    primaryBtn: {
        marginTop: 16,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {
        color: "white",
        fontWeight: "900",
        fontSize: 16,
    },
});