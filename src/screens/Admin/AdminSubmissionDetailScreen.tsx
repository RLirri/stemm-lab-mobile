import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';

type Props = {
    route: {
        params?: {
            submissionId?: string;
            submissionItem?: any;
        };
    };
};

export default function AdminSubmissionDetailScreen({route}: Props) {
    const submissionId = route.params?.submissionId;
    const item = route.params?.submissionItem;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={styles.label}>Admin Review</Text>
            <Text style={styles.title}>Submission Detail</Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Submission Overview</Text>
                <InfoRow label="Submission ID" value={submissionId ?? item?.id ?? 'N/A'}/>
                <InfoRow label="Activity" value={item?.activityKey ?? item?.activityId ?? 'N/A'}/>
                <InfoRow label="Status" value={item?.status ?? 'N/A'}/>
                <InfoRow label="Score" value={String(item?.score ?? 'N/A')}/>
                <InfoRow label="Created At" value={formatDate(item?.createdAt)}/>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Student Reflection</Text>
                <Text style={styles.bodyText}>{item?.reflection ?? 'No reflection available.'}</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Raw Submission Data</Text>
                <Text style={styles.codeText}>{JSON.stringify(item ?? {}, null, 2)}</Text>
            </View>
        </ScrollView>
    );
}

function InfoRow({label, value}: { label: string; value: string }) {
    return (
        <View style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
        </View>
    );
}

function formatDate(value: any): string {
    if (!value) return 'N/A';

    if (typeof value?.toDate === 'function') {
        return value.toDate().toLocaleString();
    }

    if (typeof value === 'string') {
        return value;
    }

    if (value?.seconds) {
        return new Date(value.seconds * 1000).toLocaleString();
    }

    return 'N/A';
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#EFF6FF',
    },
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    label: {
        color: '#64748B',
        fontSize: 16,
        marginBottom: 8,
    },
    title: {
        color: '#0F172A',
        fontSize: 34,
        fontWeight: '800',
        marginBottom: 20,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 20,
        marginBottom: 18,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
    },
    cardTitle: {
        color: '#0F172A',
        fontSize: 20,
        fontWeight: '800',
        marginBottom: 14,
    },
    row: {
        marginBottom: 12,
    },
    rowLabel: {
        color: '#64748B',
        fontSize: 14,
        marginBottom: 4,
    },
    rowValue: {
        color: '#0F172A',
        fontSize: 16,
        fontWeight: '600',
    },
    bodyText: {
        color: '#334155',
        fontSize: 16,
        lineHeight: 24,
    },
    codeText: {
        color: '#334155',
        fontSize: 12,
        lineHeight: 18,
    },
});