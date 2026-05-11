import React from "react";
import {ScrollView, StyleSheet, Text, View} from "react-native";
import type {A1PredictionPoint} from "../../services/resultInsights/activity1VisualizationService";

type Props = {
    title: string;
    subtitle?: string;
    data: A1PredictionPoint[];
};

const BAR_MAX_HEIGHT = 130;

function safeMax(values: number[]): number {
    const finite = values.filter(Number.isFinite);
    if (finite.length === 0) return 1;
    const max = Math.max(...finite);
    return max <= 0 ? 1 : max;
}

export default function A1PredictedActualChart({
                                                   title,
                                                   subtitle,
                                                   data,
                                               }: Props): React.JSX.Element | null {
    if (data.length === 0) return null;

    const maxValue = safeMax(
        data.flatMap(item => [item.predictedTimeSec, item.actualTimeSec]),
    );

    return (
        <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

            <View style={styles.legendRow}>
                <LegendDot color="#64748B" label="Theoretical"/>
                <LegendDot color="#2563EB" label="Actual"/>
                <LegendDot color="#16A34A" label="Closest"/>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chartScroll}
            >
                {data.map((item, index) => {
                    const predictedHeight =
                        (item.predictedTimeSec / maxValue) * BAR_MAX_HEIGHT;
                    const actualHeight =
                        (item.actualTimeSec / maxValue) * BAR_MAX_HEIGHT;
                    const isBest = index === 0;

                    return (
                        <View key={item.label} style={styles.group}>
                            <View style={styles.barArea}>
                                <View style={styles.barPair}>
                                    <View
                                        style={[
                                            styles.bar,
                                            styles.predictedBar,
                                            {height: Math.max(predictedHeight, 4)},
                                        ]}
                                    />
                                    <View
                                        style={[
                                            styles.bar,
                                            isBest
                                                ? styles.actualBestBar
                                                : styles.actualBar,
                                            {height: Math.max(actualHeight, 4)},
                                        ]}
                                    />
                                </View>
                            </View>

                            <Text style={styles.groupLabel} numberOfLines={2}>
                                {item.label}
                            </Text>

                            <Text
                                style={[
                                    styles.errorText,
                                    isBest ? styles.bestError : styles.normalError,
                                ]}
                            >
                                {item.errorPercent.toFixed(1)}% error
                            </Text>
                        </View>
                    );
                })}
            </ScrollView>

            <Text style={styles.footer}>
                Lower difference means the motion is closer to ideal free-fall (less air resistance).
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
        paddingTop: 14,
        paddingBottom: 8,
        gap: 16,
    },
    group: {
        width: 96,
        alignItems: "center",
    },
    barArea: {
        height: 150,
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
    predictedBar: {
        backgroundColor: "#64748B",
    },
    actualBar: {
        backgroundColor: "#2563EB",
    },
    actualBestBar: {
        backgroundColor: "#16A34A",
    },
    groupLabel: {
        marginTop: 8,
        fontSize: 11,
        lineHeight: 14,
        textAlign: "center",
        color: "#667085",
        minHeight: 30,
    },
    errorText: {
        marginTop: 4,
        fontSize: 12,
        fontWeight: "900",
    },
    bestError: {
        color: "#16A34A",
    },
    normalError: {
        color: "#667085",
    },
    footer: {
        marginTop: 8,
        fontSize: 12,
        color: "#667085",
        lineHeight: 17,
    },
});