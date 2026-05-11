// src/components/insights/ResultsInsightCard.tsx

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {ResultInsight} from '../../types/visualization';

type ResultsInsightCardProps = {
    insight: ResultInsight;
};

export default function ResultsInsightCard({
                                               insight,
                                           }: ResultsInsightCardProps): React.JSX.Element {
    return (
        <View style={styles.card}>
            <Text style={styles.label}>Smart Insight</Text>
            <Text style={styles.title}>{insight.title}</Text>
            <Text style={styles.message}>{insight.message}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        padding: 16,
        marginVertical: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563EB',
        marginBottom: 6,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#172033',
    },
    message: {
        marginTop: 6,
        fontSize: 14,
        lineHeight: 20,
        color: '#475467',
    },
});