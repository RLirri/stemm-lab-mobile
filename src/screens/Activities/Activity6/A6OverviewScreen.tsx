// src/screens/Activities/Activity6/A6OverviewScreen.tsx

import React, {useMemo} from "react";
import {Pressable, ScrollView, StyleSheet, Text, View} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";
import type {AppStackParamList} from "../../../navigation/AppStack";

type Props = NativeStackScreenProps<AppStackParamList, "A6Overview">;

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

export default function A6OverviewScreen({route, navigation}: Props) {
    const {activityId} = route.params;

    const tableRows = useMemo(
        () => [
            {attempt: "Attempt 1", prediction: "e.g. 320 ms", outcome: "e.g. 290 ms (dominant)", right: "Yes / No"},
            {attempt: "Attempt 2", prediction: "e.g. 350 ms", outcome: "e.g. 330 ms (non-dominant)", right: "Yes / No"},
            {attempt: "Attempt 3", prediction: "—", outcome: "Tracing accuracy + deviation", right: "Any surprises?"},
        ],
        []
    );

    function onStart() {
        navigation.navigate("A6SessionSetup", {activityId});
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Reaction Board Challenge</Text>
            <Text style={styles.subtitle}>Neuroscience + Mathematics</Text>

            <View style={styles.hero}>
                <Text style={styles.heroText}>
                    Measure how quickly your brain responds to a stimulus and how accurately you can trace a path.
                    Compare dominant
                    vs non-dominant hand performance and compute mean + consistency (standard deviation).
                </Text>

                <View style={styles.heroTagRow}>
                    <View style={styles.tag}>
                        <Text style={styles.tagText}>Random target</Text>
                    </View>
                    <View style={styles.tag}>
                        <Text style={styles.tagText}>Reaction time (ms)</Text>
                    </View>
                    <View style={styles.tag}>
                        <Text style={styles.tagText}>Tracing accuracy</Text>
                    </View>
                    <View style={styles.tag}>
                        <Text style={styles.tagText}>Mean + Std Dev</Text>
                    </View>
                </View>
            </View>

            {/* Equipment */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Equipment</Text>
                <View style={{marginTop: 10, gap: 8}}>
                    {[
                        "Mobile phone with STEMM Lab app",
                        "Clear working space",
                        "A stable grip and a focused environment (reduce distractions)",
                    ].map((e, i) => (
                        <View key={`eq_${i}`} style={styles.bulletRow}>
                            <Text style={styles.bulletDot}>•</Text>
                            <Text style={styles.bulletText}>{e}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* Phases */}
            <PhaseCard
                title="Phase 1 — Tap Reaction (Dominant hand)"
                subtitle="A target appears after a random delay at a random position."
                steps={[
                    "Select participant 1 and choose Dominant hand.",
                    "Enter prediction before measurement starts (required).",
                    "Wait for the hidden target to appear, then tap as fast as possible.",
                    "Repeat for the required number of trials, then rotate to the next participant.",
                ]}
                highlight="Tip: Don’t “hover” your finger over the screen — start from a neutral position for fairness."
            />

            <PhaseCard
                title="Phase 2 — Swap Hands (Non-dominant hand)"
                subtitle="Repeat the same procedure using the non-dominant hand."
                steps={[
                    "For the same participant, switch to Non-dominant hand.",
                    "Run the same number of trials.",
                    "Compare dominant vs non-dominant mean reaction time and consistency (std dev).",
                ]}
                highlight="Observation: Non-dominant hand often shows slower mean and higher variability."
            />

            <PhaseCard
                title="Phase 3 — Tracing Challenge"
                subtitle="Trace a path as accurately as possible."
                steps={[
                    "Start the tracing challenge for the selected participant.",
                    "Follow the displayed path (moving or predefined) with a continuous touch.",
                    "Finish the trace and review deviation + accuracy score.",
                    "Rotate through each participant so everyone completes at least one tracing run.",
                ]}
                highlight="Accuracy is based on path deviation and normalized to a percentage."
            />

            {/* What we record */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>What the app records</Text>

                <View style={{marginTop: 10, gap: 10}}>
                    <InfoRow
                        left="Reaction trial data"
                        right="participant, hand, trial #, timestamps, reactionTimeMs (Tap − Appearance)"
                    />
                    <InfoRow left="Tracing data"
                             right="touch coordinates, reference path, duration, deviation, accuracy %"/>
                    <InfoRow left="Statistics" right="mean reaction time + standard deviation (consistency)"/>
                    <InfoRow
                        left="Submission items"
                        right="reaction dataset, tracing results, reflection, rating, GPS (video optional)"
                    />
                </View>
            </View>

            {/* Write-up table */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Write-up (Plain language)</Text>
                <Text style={styles.cardSub}>
                    Reaction time measures how quickly the brain processes information and sends signals to muscles.
                    Practice can
                    improve speed and coordination. Comparing hands shows how dominance affects performance.
                </Text>

                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <Text style={[styles.th, {flex: 1.0}]}>Attempt</Text>
                        <Text style={[styles.th, {flex: 1.2}]}>Prediction</Text>
                        <Text style={[styles.th, {flex: 1.4}]}>Outcome</Text>
                        <Text style={[styles.th, {flex: 1.0}]}>Were you right?</Text>
                    </View>

                    {tableRows.map((r, idx) => (
                        <View key={`row_${idx}`} style={styles.tableRow}>
                            <Text style={[styles.td, {flex: 1.0}]}>{r.attempt}</Text>
                            <Text style={[styles.td, {flex: 1.2}]}>{r.prediction}</Text>
                            <Text style={[styles.td, {flex: 1.4}]}>{r.outcome}</Text>
                            <Text style={[styles.td, {flex: 1.0}]}>{r.right}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* Leaderboard */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Leaderboard rule</Text>
                <Text style={styles.cardSub}>
                    Ranking prioritizes the lowest mean reaction time. However, teams must meet the minimum tracing
                    accuracy
                    threshold (example: ≥ 60%) to be eligible.
                </Text>

                <View style={{marginTop: 10, gap: 8}}>
                    <View style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>Primary: lowest mean reaction time</Text>
                    </View>
                    <View style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>Eligibility: tracing accuracy ≥ threshold</Text>
                    </View>
                    <View style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>
                            Score conversion from rating to final score will be applied later (consistent with other
                            activities).
                        </Text>
                    </View>
                </View>
            </View>

            {/* Safety */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Safety & fairness</Text>
                <View style={{marginTop: 10, gap: 8}}>
                    {[
                        "Hold the phone securely and keep a clear space around you.",
                        "Avoid tapping too hard (reduce device movement).",
                        "Use the same posture and distance to screen for all trials.",
                        "Minimize distractions and keep conditions consistent between hands.",
                    ].map((s, i) => (
                        <View key={`safe_${i}`} style={styles.bulletRow}>
                            <Text style={styles.bulletDot}>•</Text>
                            <Text style={styles.bulletText}>{s}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* CTA */}
            <Pressable style={styles.primaryBtn} onPress={onStart}>
                <Text style={styles.primaryBtnText}>Start Activity</Text>
            </Pressable>

            <View style={{height: 36}}/>
        </ScrollView>
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

/* =========================================================
   Styles
========================================================= */

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20, backgroundColor: "#fff"},
    title: {fontSize: 26, fontWeight: "900", marginTop: 6},
    subtitle: {marginTop: 6, opacity: 0.75, fontWeight: "800"},

    hero: {
        marginTop: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        padding: 14,
    },
    heroText: {opacity: 0.85, lineHeight: 20, fontWeight: "600"},
    heroTagRow: {marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8},
    tag: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "#fff",
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
    },
    tagText: {fontWeight: "900", opacity: 0.85},

    card: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 16,
        padding: 14,
    },
    cardTitle: {fontSize: 16, fontWeight: "900"},
    cardSub: {marginTop: 8, opacity: 0.75, lineHeight: 18},

    bulletRow: {flexDirection: "row", alignItems: "flex-start", gap: 10},
    bulletDot: {marginTop: 1, fontWeight: "900"},
    bulletText: {flex: 1, opacity: 0.85, lineHeight: 18, fontWeight: "600"},

    stepRow: {flexDirection: "row", alignItems: "flex-start", gap: 10},
    stepBadge: {
        width: 24,
        height: 24,
        borderRadius: 999,
        backgroundColor: "#111",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 1,
    },
    stepBadgeText: {color: "white", fontWeight: "900", fontSize: 12},
    stepText: {flex: 1, opacity: 0.88, lineHeight: 18, fontWeight: "600"},
    cardHighlight: {marginTop: 12, opacity: 0.8, fontStyle: "italic", lineHeight: 18},

    infoRow: {
        borderWidth: 1,
        borderColor: "#e9e9e9",
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
    },
    infoLeft: {fontWeight: "900"},
    infoRight: {marginTop: 6, opacity: 0.75, lineHeight: 18, fontWeight: "600"},

    table: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#e9e9e9",
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#fff",
    },
    tableRow: {flexDirection: "row", paddingVertical: 10, paddingHorizontal: 10},
    tableHeader: {backgroundColor: "#111"},
    th: {color: "white", fontWeight: "900", fontSize: 12},
    td: {fontWeight: "700", opacity: 0.85, fontSize: 12},

    primaryBtn: {
        marginTop: 16,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},
});