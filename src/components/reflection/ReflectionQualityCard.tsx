import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {ReflectionQualityResult} from '../../types/reflectionQuality';

interface ReflectionQualityCardProps {
    result: ReflectionQualityResult;
}

const getStatusLabel = (status: ReflectionQualityResult['status']): string => {
    switch (status) {
        case 'strong':
            return 'Strong reflection';
        case 'acceptable':
            return 'Acceptable';
        case 'needs_improvement':
            return 'Needs improvement';
        default:
            return 'Needs improvement';
    }
};

export const ReflectionQualityCard = ({
                                          result,
                                      }: ReflectionQualityCardProps): React.ReactElement => {
    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>Reflection quality</Text>
                <Text style={styles.wordCount}>{result.wordCount} words</Text>
            </View>

            <Text style={styles.status}>{getStatusLabel(result.status)}</Text>

            {result.issues.length > 0 && (
                <View style={styles.section}>
                    {result.issues.map((issue) => (
                        <Text key={issue.code} style={styles.issueText}>
                            • {issue.message}
                        </Text>
                    ))}
                </View>
            )}

            {result.suggestions.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Suggestions</Text>
                    {result.suggestions.map((suggestion) => (
                        <Text key={suggestion} style={styles.suggestionText}>
                            • {suggestion}
                        </Text>
                    ))}
                </View>
            )}

            {result.isSubmissionBlocked && (
                <Text style={styles.blockingText}>
                    Please fix the required reflection issues before submitting.
                </Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    title: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },
    wordCount: {
        fontSize: 13,
        color: '#6B7280',
    },
    status: {
        marginTop: 8,
        fontSize: 14,
        fontWeight: '700',
        color: '#2563EB',
    },
    section: {
        marginTop: 10,
        gap: 4,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#374151',
    },
    issueText: {
        fontSize: 13,
        lineHeight: 18,
        color: '#374151',
    },
    suggestionText: {
        fontSize: 13,
        lineHeight: 18,
        color: '#4B5563',
    },
    blockingText: {
        marginTop: 10,
        fontSize: 13,
        fontWeight: '600',
        color: '#B91C1C',
    },
});