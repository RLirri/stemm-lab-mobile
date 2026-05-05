import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {
    ActivityHistoryItem,
    getUserActivityHistory,
} from '../../services/activityHistoryService';
import {activityCatalog} from '../../features/activities/activityCatalog';

import {
    AppBadge,
    AppCard,
    AppGradientScreen,
    AppSectionHeader,
    AppText,
    EmptyState,
    InfoBanner,
    LoadingState,
} from '../../components/ui';

import {colors, spacing} from '../../theme';
import {AppAdBanner} from '../../components/ads';


function getActivityTitle(activityId: string): string {
    const activity = activityCatalog.find((item) => item.id === activityId);
    return activity?.title ?? 'Unknown activity';
}

function getActivityCategory(activityId: string): string {
    const activity = activityCatalog.find((item) => item.id === activityId);
    return activity?.category ?? 'General';
}

function getActivityDifficulty(activityId: string): string {
    const activity = activityCatalog.find((item) => item.id === activityId);
    return activity?.difficulty ?? 'Standard';
}

function formatStatus(status?: string): string {
    if (!status) {
        return 'Submitted';
    }

    return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function ActivityHistoryScreen() {
    const [history, setHistory] = useState<ActivityHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const completedCount = history.length;
    const latestSubmission = useMemo(() => history[0], [history]);

    const loadHistory = useCallback(async (refresh = false) => {
        try {
            if (refresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            setErrorMessage(null);

            const result = await getUserActivityHistory();
            setHistory(result);
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : 'Unable to load activity history.',
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void loadHistory();
    }, [loadHistory]);

    if (loading) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading activity history..."/>
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <AppText variant="caption" color="textMuted">
                Learning record
            </AppText>

            <AppText variant="title" style={styles.title}>
                Activity History
            </AppText>

            <AppText variant="body" color="textMuted" style={styles.subtitle}>
                Review your completed STEMM Lab activities and previous experiment submissions.
            </AppText>

            {errorMessage ? (
                <InfoBanner
                    title="History unavailable"
                    message={errorMessage}
                    tone="warning"
                />
            ) : null}

            {completedCount > 0 ? (
                <AppCard style={styles.summaryCard}>
                    <View style={styles.summaryHeader}>
                        <View>
                            <AppText variant="caption" color="textMuted">
                                Completed submissions
                            </AppText>

                            <AppText variant="title" style={styles.summaryNumber}>
                                {completedCount}
                            </AppText>
                        </View>

                        <AppBadge label="Learning progress" tone="success"/>
                    </View>

                    {latestSubmission ? (
                        <AppText variant="body" color="textMuted" style={styles.latestText}>
                            Latest: {getActivityTitle(latestSubmission.activityId)}
                        </AppText>
                    ) : null}
                </AppCard>
            ) : null}

            <AppSectionHeader
                title="Submitted activities"
                subtitle="Your most recent submissions are shown first."
            />

            {history.length === 0 ? (
                <EmptyState
                    title="No activity history yet"
                    message="Complete your first STEMM activity to see your submitted work here."
                />
            ) : (
                <View style={styles.list}>
                    {history.map((item) => (
                        <AppCard key={item.id} style={styles.historyCard}>
                            <View style={styles.historyHeader}>
                                <View style={styles.historyTextArea}>
                                    <AppText variant="subtitle">
                                        {getActivityTitle(item.activityId)}
                                    </AppText>

                                    <View style={styles.badgeRow}>
                                        <AppBadge
                                            label={getActivityCategory(item.activityId)}
                                            tone="info"
                                        />
                                        <AppBadge
                                            label={getActivityDifficulty(item.activityId)}
                                            tone="warning"
                                        />
                                    </View>
                                </View>

                                <AppBadge label={formatStatus(item.status)} tone="success"/>
                            </View>

                            <View style={styles.metaRow}>
                                <View style={styles.metaItem}>
                                    <AppText variant="caption" color="textMuted">
                                        Score
                                    </AppText>

                                    <AppText variant="bodyStrong" style={styles.metaValue}>
                                        {Number.isFinite(item.score) ? item.score : '-'}
                                    </AppText>
                                </View>

                                <View style={styles.metaItem}>
                                    <AppText variant="caption" color="textMuted">
                                        Team
                                    </AppText>

                                    <AppText variant="bodyStrong" style={styles.metaValue}>
                                        {item.teamId ?? 'Individual'}
                                    </AppText>
                                </View>
                            </View>
                        </AppCard>
                    ))}
                </View>
            )}
            <AppAdBanner placement="history"/>

            {refreshing ? (
                <AppText variant="caption" color="textMuted" style={styles.refreshingText}>
                    Refreshing history...
                </AppText>
            ) : null}

            {refreshing ? (
                <AppText variant="caption" color="textMuted" style={styles.refreshingText}>
                    Refreshing history...
                </AppText>
            ) : null}
        </AppGradientScreen>
    );
}

const styles = StyleSheet.create({
    title: {
        marginTop: spacing.xs,
    },

    subtitle: {
        marginTop: spacing.sm,
        marginBottom: spacing.lg,
    },

    summaryCard: {
        marginBottom: spacing.md,
    },

    summaryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: spacing.md,
    },

    summaryNumber: {
        marginTop: spacing.xs,
        color: colors.primary,
    },

    latestText: {
        marginTop: spacing.md,
    },

    list: {
        gap: spacing.md,
    },

    historyCard: {
        gap: spacing.md,
    },

    historyHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    historyTextArea: {
        flex: 1,
    },

    badgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginTop: spacing.sm,
    },

    metaRow: {
        flexDirection: 'row',
        gap: spacing.md,
    },

    metaItem: {
        flex: 1,
    },

    metaValue: {
        marginTop: spacing.xs,
    },

    refreshingText: {
        marginTop: spacing.md,
        textAlign: 'center',
    },
});