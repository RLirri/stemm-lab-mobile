import React from "react";
import {ScrollView, StyleSheet, Text, View} from "react-native";

export type A5SmoothnessComparisonPoint = {
    label: string;
    baselineValue: number;
    feedbackValue: number;
    improvementScore: number;
};

type Props = {
    title: string;
    subtitle?: string;
    data: A5SmoothnessComparisonPoint[];
};

const BAR_MAX_HEIGHT = 120;

function safeMax(values: number[]): number {
    const finiteValues = values.filter(Number.isFinite);
    if (finiteValues.length === 0) return 1;

    const max = Math.max(...finiteValues);
    return max <= 0 ? 1 : max;
}

export default function A5SmoothnessComparisonChart({
                                                        title,
                                                        subtitle,
                                                        data,
                                                    }: Props): React.JSX.Element | null {
    if (data.length === 0) return null;

    const maxValue = safeMax(
        data.flatMap(item => [item.baselineValue, item.feedbackValue])
    );

    return (
        <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

            <View style={styles.legendRow}>
                <LegendDot color="#64748B" label="Baseline"/>
                <LegendDot color="#2563EB" label="Feedback"/>
                <LegendDot color="#16A34A" label="Improved feedback"/>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chartScroll}
            >
                {data.map(item => {
                    const baselineHeight =
                        (item.baselineValue / maxValue) * BAR_MAX_HEIGHT;
                    const feedbackHeight =
                        (item.feedbackValue / maxValue) * BAR_MAX_HEIGHT;
                    const improved = item.improvementScore > 0;

                    return (
                        <View key={item.label} style={styles.group}>
                            <View style={styles.barArea}>
                                <View style={styles.barPair}>
                                    <View
                                        style={[
                                            styles.bar,
                                            styles.baselineBar,
                                            {
                                                height: Math.max(
                                                    baselineHeight,
                                                    4
                                                ),
                                            },
                                        ]}
                                    />
                                    <View
                                        style={[
                                            styles.bar,
                                            improved
                                                ? styles.feedbackImprovedBar
                                                : styles.feedbackBar,
                                            {
                                                height: Math.max(
                                                    feedbackHeight,
                                                    4
                                                ),
                                            },
                                        ]}
                                    />
                                </View>
                            </View>

                            <Text style={styles.groupLabel} numberOfLines={2}>
                                {item.label}
                            </Text>

                            <Text
                                style={[
                                    styles.improvement,
                                    improved
                                        ? styles.improvementGood
                                        : styles.improvementNeutral,
                                ]}
                            >
                                +{item.improvementScore.toFixed(1)}
                            </Text>
                        </View>
                    );
                })}
            </ScrollView>

            <Text style={styles.footer}>
                Lower smoothness value = smoother movement. Improvement is shown
                below each pair.
            </Text>
        </View>
    );
}

function LegendDot({
                       color,
                       label,
                   }: {
    color: string;
    label: string;
}): React.JSX.Element {
    return (
        <View style={styles.legendItem}>
            <View style={[styles.legendDot, {backgroundColor: color}]}/>
            <Text style={styles.legendText}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        marginTop: 16,
        backgroundColor: "#FFFFFF",
        borderRadius: 18,
        padding: 16,
        shadowColor: "#000000",
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
    },
    title: {
        fontSize: 18,
        fontWeight: "900",
        color: "#172033",
    },
    subtitle: {
        marginTop: 6,
        fontSize: 13,
        lineHeight: 18,
        color: "#667085",
    },
    legendRow: {
        flexDirection: "row",
        gap: 14,
        marginTop: 12,
        flexWrap: "wrap",
    },
    legendItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    legendText: {
        fontSize: 12,
        color: "#667085",
        fontWeight: "700",
    },
    chartScroll: {
        paddingTop: 12,
        paddingBottom: 8,
        gap: 16,
    },
    group: {
        width: 96,
        alignItems: "center",
    },
    barArea: {
        height: 140,
        justifyContent: "flex-end",
        alignItems: "center",
    },
    barPair: {
        height: BAR_MAX_HEIGHT,
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 8,
    },
    bar: {
        width: 26,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 6,
    },
    baselineBar: {
        backgroundColor: "#64748B",
    },
    feedbackBar: {
        backgroundColor: "#2563EB",
    },
    feedbackImprovedBar: {
        backgroundColor: "#16A34A",
    },
    groupLabel: {
        marginTop: 8,
        fontSize: 11,
        lineHeight: 14,
        textAlign: "center",
        color: "#667085",
        minHeight: 32,
    },
    improvement: {
        marginTop: 4,
        fontSize: 12,
        fontWeight: "900",
    },
    improvementGood: {
        color: "#16A34A",
    },
    improvementNeutral: {
        color: "#667085",
    },
    footer: {
        marginTop: 8,
        fontSize: 12,
        color: "#667085",
        lineHeight: 17,
    },
});