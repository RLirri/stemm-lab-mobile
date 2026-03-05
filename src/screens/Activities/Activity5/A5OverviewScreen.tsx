import React from "react";
import {Pressable, ScrollView, StyleSheet, Text, View} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {activity05_humanPerformance} from "../../../features/activities/definitions/activity05_humanPerformance";

type Props = NativeStackScreenProps<AppStackParamList, "A5Overview">;

export default function A5OverviewScreen({navigation}: Props) {
    const activity = activity05_humanPerformance;

    function onStart() {
        // Keep Overview lightweight: SessionSetup can create the run draft if needed.
        navigation.navigate("A5SessionSetup", {
            activityId: activity.id,
        });
    }

    const equipment = Array.isArray(activity.equipment) ? activity.equipment : [];

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>{activity.title}</Text>
            <Text style={styles.short}>{activity.shortDescription}</Text>

            {/* Objective */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Objective</Text>
                <Text style={styles.body}>
                    Investigate how the human body moves by measuring{" "}
                    <Text style={styles.bold}>speed</Text>,{" "}
                    <Text style={styles.bold}>smoothness</Text>, and{" "}
                    <Text style={styles.bold}>range of motion</Text> during controlled stretching movements.
                </Text>
            </View>

            {/* What you will do */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>What You Will Do</Text>
                <Text style={styles.body}>• Hold the phone firmly in one hand.</Text>
                <Text style={styles.body}>• Follow at least 3 guided movement instructions.</Text>
                <Text style={styles.body}>• Record motion in Baseline mode (no guidance).</Text>
                <Text style={styles.body}>• Repeat in Feedback mode (real-time smoothness guidance).</Text>
                <Text style={styles.body}>• Compare results across movements + participants.</Text>
            </View>

            {/* Movements */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Guided Movements</Text>
                <Text style={styles.body}>Movement 1 — Slow arm extension</Text>
                <Text style={styles.body}>Movement 2 — Controlled forward stretch</Text>
                <Text style={styles.body}>Movement 3 — Coordinated lateral motion</Text>

                <View style={styles.miniCard}>
                    <Text style={styles.miniTitle}>Each movement includes</Text>
                    <Text style={styles.miniText}>• Visual instruction / animation</Text>
                    <Text style={styles.miniText}>• Duration guidance</Text>
                    <Text style={styles.miniText}>• Posture guidance</Text>
                </View>
            </View>

            {/* How it works */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>How It Works</Text>
                <Text style={styles.body}>
                    • The accelerometer records X/Y/Z motion continuously during each trial.
                </Text>
                <Text style={styles.body}>
                    • The app measures <Text style={styles.bold}>duration</Text> (seconds).
                </Text>
                <Text style={styles.body}>
                    • The app estimates <Text style={styles.bold}>displacement magnitude</Text> (mm/cm).
                </Text>
                <Text style={styles.body}>
                    • The app computes a <Text style={styles.bold}>smoothness index</Text> (lower = smoother).
                </Text>
                <Text style={styles.body}>
                    • Improvement = Baseline Smoothness − Feedback Smoothness (higher = better).
                </Text>
            </View>

            {/* Equipment */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Equipment</Text>
                {equipment.length > 0 ? (
                    equipment.map((item) => (
                        <Text key={item} style={styles.listItem}>
                            • {item}
                        </Text>
                    ))
                ) : (
                    <Text style={styles.muted}>No equipment specified.</Text>
                )}
            </View>

            {/* Safety */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Safety</Text>
                <Text style={styles.body}>• Use an open space and move slowly.</Text>
                <Text style={styles.body}>• Keep a stable grip on the phone.</Text>
                <Text style={styles.body}>• Stop if you feel pain or dizziness.</Text>
            </View>

            {/* Submission checklist */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Submission Requirements</Text>
                <Text style={styles.body}>• Sensor dataset recorded</Text>
                <Text style={styles.body}>• Video evidence of movement trials</Text>
                <Text style={styles.body}>• Reflection text</Text>
                <Text style={styles.body}>• Rating (1–5)</Text>
                <Text style={styles.body}>• GPS coordinates</Text>
            </View>

            <Pressable style={styles.primaryBtn} onPress={onStart}>
                <Text style={styles.primaryBtnText}>Start Activity</Text>
            </Pressable>

            <View style={{height: 40}}/>
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
    },
    short: {
        marginTop: 8,
        opacity: 0.75,
        lineHeight: 20,
    },
    bold: {fontWeight: "900"},

    card: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: "900",
        marginBottom: 8,
    },
    body: {
        marginTop: 4,
        lineHeight: 20,
    },

    miniCard: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    miniTitle: {fontWeight: "900"},
    miniText: {marginTop: 6, opacity: 0.85, lineHeight: 18},

    listItem: {marginTop: 6, opacity: 0.9, lineHeight: 18},
    muted: {marginTop: 8, opacity: 0.6, lineHeight: 18},

    primaryBtn: {
        marginTop: 20,
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