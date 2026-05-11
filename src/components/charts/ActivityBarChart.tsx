// src/components/charts/ActivityBarChart.tsx

import React from 'react';
import {StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {BarChart} from 'react-native-gifted-charts';
import type {ChartPoint} from '../../types/visualization';

type ActivityBarChartProps = {
    title: string;
    subtitle?: string;
    data: ChartPoint[];
    unitLabel: string;
};

export default function ActivityBarChart({
                                             title,
                                             subtitle,
                                             data,
                                             unitLabel,
                                         }: ActivityBarChartProps): React.JSX.Element | null {
    const {width} = useWindowDimensions();

    if (data.length === 0) {
        return null;
    }

    const chartWidth = Math.max(width - 72, 260);
    const maxValue = Math.max(...data.map(item => item.value), 1);

    return (
        <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

            <BarChart
                data={data}
                width={chartWidth}
                height={190}
                barWidth={34}
                spacing={24}
                roundedTop
                roundedBottom
                maxValue={Math.ceil(maxValue * 1.2)}
                yAxisThickness={0}
                xAxisThickness={1}
                noOfSections={4}
                yAxisTextStyle={styles.axisText}
                xAxisLabelTextStyle={styles.axisText}
                isAnimated
                animationDuration={700}
            />

            <Text style={styles.footer}>Unit: {unitLabel}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        padding: 16,
        marginVertical: 12,
        shadowColor: '#000000',
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: '#172033',
    },
    subtitle: {
        marginTop: 4,
        fontSize: 13,
        color: '#667085',
    },
    axisText: {
        color: '#667085',
        fontSize: 11,
    },
    footer: {
        marginTop: 8,
        fontSize: 12,
        color: '#667085',
    },
});