import React from "react";
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Pressable,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {activity04_earthquake} from "../../../features/activities/definitions/activity04_earthquake";
import {createActivity4RunDraft} from "../../../store/activity4RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A4Overview">;

export default function A4OverviewScreen({navigation}: Props) {
    const activity = activity04_earthquake;

    function onStart() {
        const draft = createActivity4RunDraft({
            activityId: activity.id,
            designCount: 3,
            gpsEnabled: true,
        });

        navigation.navigate("A4SessionSetup", {
            activityId: activity.id,
            runId: draft.runId,
        });
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>{activity.title}</Text>
            <Text style={styles.short}>{activity.shortDescription}</Text>

            {/* Objective */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Objective</Text>
                <Text style={styles.body}>
                    Design a structure that reduces phone movement during a 10-second
                    vibration test (simulated earthquake).
                </Text>
            </View>

            {/* How it Works */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>How It Works</Text>
                <Text style={styles.body}>
                    • The app activates vibration for 10 seconds.
                </Text>
                <Text style={styles.body}>
                    • The accelerometer records movement in X, Y, Z.
                </Text>
                <Text style={styles.body}>
                    • A movement magnitude score is computed.
                </Text>
                <Text style={styles.body}>
                    • Lower movement score = more stable structure.
                </Text>
            </View>

            {/* Equipment */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Equipment</Text>
                {Array.isArray(activity.equipment) && activity.equipment.length > 0 ? (
                    activity.equipment.map((item) => (
                        <Text key={item} style={styles.listItem}>
                            • {item}
                        </Text>
                    ))
                ) : (
                    <Text style={styles.muted}>No equipment specified.</Text>
                )}
            </View>

            {/* Instructions */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Instructions</Text>
                {activity.instructions.split("\n").map((line, idx) => (
                    <Text key={idx} style={styles.body}>
                        {line}
                    </Text>
                ))}
            </View>

            {/* Scoring */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Scoring</Text>
                <Text style={styles.body}>
                    Leaderboard score is based on the lowest movement magnitude.
                </Text>
                <Text style={styles.body}>
                    Requirements for submission:
                </Text>
                <Text style={styles.body}>• Sensor data captured</Text>
                <Text style={styles.body}>• 1 session video evidence</Text>
                <Text style={styles.body}>• GPS enabled & granted</Text>
                <Text style={styles.body}>• Reflection & rating</Text>
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
    listItem: {marginTop: 6, opacity: 0.9, lineHeight: 18},
    muted: {marginTop: 8, opacity: 0.6, lineHeight: 18},
});