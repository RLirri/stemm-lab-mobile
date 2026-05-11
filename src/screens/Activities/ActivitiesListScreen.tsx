import React, {useEffect, useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../navigation/AppStack';
import {listActiveActivities} from '../../services/activityService';
import type {Activity} from '../../types/activity';

import {
    AppBadge,
    AppCard,
    AppGradientScreen,
    AppText,
    EmptyState,
    InfoBanner,
    LoadingState,
} from '../../components/ui';

import {spacing} from '../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'Activities'>;

export default function ActivitiesListScreen({navigation}: Props) {
    const [items, setItems] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        (async () => {
            try {
                const data = await listActiveActivities();
                if (mounted) {
                    setItems(data);
                }
            } catch (e: any) {
                if (mounted) {
                    setError(e?.message ?? 'Failed to load activities');
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            mounted = false;
        };
    }, []);

    if (loading) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading activities..."/>
            </AppGradientScreen>
        );
    }

    if (error) {
        return (
            <AppGradientScreen>
                <AppText variant="title">Activities</AppText>

                <InfoBanner
                    title="Couldn’t load activities"
                    message={error}
                    tone="danger"
                />
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen
            padded={false}
            scroll={false}
        >
            <FlatList
                data={items}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                    <View style={styles.header}>
                        <AppText variant="caption" color="textMuted">
                            STEMM Lab
                        </AppText>

                        <AppText variant="title" style={styles.title}>
                            Activities
                        </AppText>

                        <AppText variant="body" color="textMuted" style={styles.subtitle}>
                            Choose a STEMM activity to start prediction, measurement,
                            analysis, and reflection.
                        </AppText>
                    </View>
                }
                ListEmptyComponent={
                    <EmptyState
                        title="No activities yet"
                        message="Ask admin to seed the Activity Catalog or create activity documents in Firestore."
                    />
                }
                ItemSeparatorComponent={() => <View style={styles.separator}/>}
                renderItem={({item}) => {
                    const timeLabel =
                        item.timeSpanMinutes && item.timeSpanMinutes > 0
                            ? `~${item.timeSpanMinutes} min`
                            : null;

                    return (
                        <AppCard
                            style={styles.activityCard}
                            onPress={() =>
                                navigation.navigate('ActivityDetail', {
                                    activityId: item.id,
                                })
                            }
                        >
                            <View style={styles.cardHeader}>
                                <AppText variant="sectionTitle" style={styles.cardTitle}>
                                    {item.title}
                                </AppText>

                                <AppBadge label={item.difficulty} tone="primary"/>
                            </View>

                            {item.shortDescription ? (
                                <AppText
                                    variant="body"
                                    color="textMuted"
                                    style={styles.cardDescription}
                                    numberOfLines={2}
                                >
                                    {item.shortDescription}
                                </AppText>
                            ) : null}

                            <View style={styles.cardFooter}>
                                <AppBadge label={item.category} tone="info"/>

                                {timeLabel ? (
                                    <AppText variant="caption" color="textMuted">
                                        {timeLabel}
                                    </AppText>
                                ) : null}
                            </View>
                        </AppCard>
                    );
                }}
            />
        </AppGradientScreen>
    );
}

const styles = StyleSheet.create({
    listContent: {
        padding: spacing.lg,
        paddingBottom: spacing.xxxl,
    },

    header: {
        marginBottom: spacing.xl,
    },

    title: {
        marginTop: spacing.xs,
    },

    subtitle: {
        marginTop: spacing.sm,
        maxWidth: 620,
    },

    separator: {
        height: spacing.md,
    },

    activityCard: {
        padding: spacing.lg,
        borderRadius: 22,
    },

    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    cardTitle: {
        flex: 1,
    },

    cardDescription: {
        marginTop: spacing.sm,
    },

    cardFooter: {
        marginTop: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },
});