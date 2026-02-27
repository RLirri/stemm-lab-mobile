// src/screens/Activities/Activity3/A3OverviewScreen.tsx
import React from "react";
import {Pressable, ScrollView, StyleSheet, Text, View} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";
import type {AppStackParamList} from "../../../navigation/AppStack";

type Props = NativeStackScreenProps<AppStackParamList, "A3Overview">;

export default function A3OverviewScreen({route, navigation}: Props) {
    const {activityId} = route.params;

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>Hand Fan Challenge</Text>
            <Text style={styles.sub}>Physics – Air Movement & Material Response</Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Objective</Text>
                <Text style={styles.text}>
                    Compare different fan designs and measure how much flexible materials bend under airflow.
                </Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Equipment</Text>
                <Text style={styles.text}>• Paper / Cardboard</Text>
                <Text style={styles.text}>• Ruler / Protractor</Text>
                <Text style={styles.text}>• Mobile phone (STEMM Lab)</Text>
                <Text style={styles.text}>• Sticky tape</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Distance Rule</Text>
                <Text style={styles.text}>Maintain stable test distances:</Text>
                <Text style={styles.bold}>15 cm · 30 cm · 45 cm</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>What To Record</Text>
                <Text style={styles.text}>• Bend angle (degrees)</Text>
                <Text style={styles.text}>• Material type</Text>
                <Text style={styles.text}>• Distance used</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Safety Note</Text>
                <Text style={styles.text}>
                    Keep stable. Do not hit others. Ensure safe surroundings.
                </Text>
            </View>

            <Pressable
                style={styles.primaryBtn}
                onPress={() => navigation.navigate("A3SessionSetup", {activityId})}
            >
                <Text style={styles.primaryBtnText}>Start Activity</Text>
            </Pressable>

            <View style={{height: 30}}/>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20},
    title: {fontSize: 26, fontWeight: "900", marginTop: 6},
    sub: {marginTop: 6, opacity: 0.7},
    card: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {fontSize: 16, fontWeight: "900"},
    text: {marginTop: 6, lineHeight: 18},
    bold: {marginTop: 6, fontWeight: "900"},
    primaryBtn: {
        marginTop: 20,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900"},
});