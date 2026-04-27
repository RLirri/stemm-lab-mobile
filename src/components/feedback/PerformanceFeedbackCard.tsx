// src/components/feedback/PerformanceFeedbackCard.tsx

import React, {useMemo, useState} from "react";
import {Pressable, StyleSheet, Text, View} from "react-native";
import type {
    FeedbackLevel,
    FeedbackResult,
} from "../../types/performanceFeedback";

type Props = {
    feedback: FeedbackResult;
};

function levelLabel(level: FeedbackLevel): string {
    switch (level) {
        case "excellent":
            return "Excellent";
        case "good":
            return "Good";
        case "needs_improvement":
            return "Needs Improvement";
        case "warning":
            return "Warning";
    }
}

export default function PerformanceFeedbackCard({
                                                    feedback,
                                                }: Props): React.JSX.Element {
    const [expanded, setExpanded] = useState(false);

    const visibleItems = useMemo(
        () => (expanded ? feedback.items : feedback.items.slice(0, 2)),
        [expanded, feedback.items],
    );

    return (
        <View style={styles.card}>
            {/* Header */}
            <Text style={styles.label}>Smart Performance Feedback</Text>

            <View style={styles.headerRow}>
                <Text style={styles.title}>
                    {levelLabel(feedback.overallLevel)}
                </Text>

                <View style={styles.badge}>
                    <Text style={styles.badgeText}>Offline</Text>
                </View>
            </View>

            {/* Summary */}
            <Text style={styles.summary}>{feedback.summary}</Text>

            {/* Feedback Items */}
            {visibleItems.map(item => (
                <View key={item.id} style={styles.item}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemMessage}>{item.message}</Text>

                    {/* Only show level if important */}
                    {(item.level === "warning" ||
                        item.level === "needs_improvement") && (
                        <Text style={styles.itemLevel}>
                            {levelLabel(item.level)}
                        </Text>
                    )}
                </View>
            ))}

            {/* Expand / Collapse */}
            {feedback.items.length > 2 && (
                <Pressable
                    style={styles.toggleButton}
                    onPress={() => setExpanded(prev => !prev)}
                >
                    <Text style={styles.toggleText}>
                        {expanded
                            ? "Show less"
                            : "View detailed feedback"}
                    </Text>
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: "#F8FAFC",
        borderRadius: 16,
        padding: 16,
        marginVertical: 12,
        borderWidth: 1,
        borderColor: "#CBD5E1",
    },

    label: {
        fontSize: 12,
        fontWeight: "900",
        color: "#7C3AED",
        marginBottom: 6,
    },

    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
    },

    title: {
        flex: 1,
        fontSize: 18,
        fontWeight: "900",
        color: "#172033",
    },

    badge: {
        borderRadius: 999,
        backgroundColor: "#EDE9FE",
        paddingHorizontal: 10,
        paddingVertical: 5,
    },

    badgeText: {
        fontSize: 11,
        fontWeight: "900",
        color: "#6D28D9",
    },

    summary: {
        marginTop: 6,
        fontSize: 14,
        lineHeight: 20,
        color: "#475467",
    },

    item: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: "#E2E8F0",
    },

    itemTitle: {
        fontSize: 14,
        fontWeight: "900",
        color: "#172033",
    },

    itemMessage: {
        marginTop: 4,
        fontSize: 14,
        lineHeight: 20,
        color: "#475467",
    },

    itemLevel: {
        marginTop: 5,
        fontSize: 12,
        fontWeight: "900",
        color: "#B45309",
    },

    toggleButton: {
        marginTop: 12,
        alignSelf: "flex-start",
    },

    toggleText: {
        fontSize: 14,
        fontWeight: "900",
        color: "#7C3AED",
    },
});