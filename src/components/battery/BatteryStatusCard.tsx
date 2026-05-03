import React, {useCallback, useEffect, useState} from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import type {BatteryPolicy, BatteryStatus} from '../../types/battery';
import {computeBatteryPolicy, getBatteryStatus} from '../../services/battery';

type Props = {
    compact?: boolean;
};

export const BatteryStatusCard = ({compact = false}: Props) => {
    const [status, setStatus] = useState<BatteryStatus | null>(null);
    const [policy, setPolicy] = useState<BatteryPolicy | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    const refresh = useCallback(async () => {
        setLoading(true);

        const nextStatus = await getBatteryStatus();
        const nextPolicy = computeBatteryPolicy(nextStatus);

        setStatus(nextStatus);
        setPolicy(nextPolicy);
        setLoading(false);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    if (loading && !status) {
        return (
            <View style={styles.card}>
                <ActivityIndicator/>
                <Text style={styles.message}>Checking battery status...</Text>
            </View>
        );
    }

    if (!status || !policy) {
        return null;
    }

    const levelText =
        status.percentage === null ? 'Unavailable' : `${status.percentage}%`;

    return (
        <View style={styles.card}>
            <View style={styles.headerRow}>
                <Text style={styles.title}>Battery Awareness</Text>
                <Text style={styles.mode}>{policy.mode}</Text>
            </View>

            <Text style={styles.primary}>Level: {levelText}</Text>
            <Text style={styles.secondary}>State: {status.chargingState}</Text>

            {!compact && (
                <>
                    <Text style={styles.message}>{policy.message}</Text>
                    <Text style={styles.secondary}>
                        Sensor recommendation: {policy.recommendedSensorIntervalMs}ms
                    </Text>
                </>
            )}

            <Pressable style={styles.button} onPress={refresh}>
                <Text style={styles.buttonText}>Refresh battery status</Text>
            </Pressable>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        padding: 16,
        borderRadius: 16,
        backgroundColor: '#F4F7FB',
        marginVertical: 10,
        borderWidth: 1,
        borderColor: '#D8E1EC',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1F2937',
    },
    mode: {
        fontSize: 13,
        fontWeight: '700',
        color: '#2563EB',
    },
    primary: {
        marginTop: 10,
        fontSize: 15,
        color: '#111827',
    },
    secondary: {
        marginTop: 4,
        fontSize: 13,
        color: '#4B5563',
    },
    message: {
        marginTop: 8,
        fontSize: 13,
        color: '#374151',
        lineHeight: 19,
    },
    button: {
        marginTop: 12,
        alignSelf: 'flex-start',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: '#E0ECFF',
    },
    buttonText: {
        color: '#1D4ED8',
        fontWeight: '600',
    },
});