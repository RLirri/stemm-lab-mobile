import React, {useCallback, useEffect, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../navigation/AppStack';
import {auth} from '../../services/firebase';
import {activityCatalog} from '../../features/activities/activityCatalog';
import {seedActivities} from '../../services/activityAdminService';
import {backfillTeamStats} from '../../services/teamMigrationService';
import {isAdminUser} from '../../services/admin/adminAccessService';
import {type AdminAnalyticsSnapshot, getAdminAnalyticsSnapshot,} from '../../services/admin/adminAnalyticsService';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppExpandableCard,
    AppGradientScreen,
    AppSectionHeader,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../components/ui';

import {colors, spacing} from '../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'AdminDashboard'>;

export default function AdminDashboardScreen({navigation}: Props) {
    const user = auth.currentUser;
    const [processing, setProcessing] = useState(false);
    const [analyticsLoading, setAnalyticsLoading] = useState(true);
    const [analyticsError, setAnalyticsError] = useState<string | null>(null);
    const [analytics, setAnalytics] = useState<AdminAnalyticsSnapshot | null>(null);

    const isAdmin = isAdminUser(user?.uid);

    const loadAnalytics = useCallback(async () => {
        if (!isAdmin) return;

        try {
            setAnalyticsLoading(true);
            setAnalyticsError(null);

            const result = await getAdminAnalyticsSnapshot();
            setAnalytics(result);
        } catch (error) {
            setAnalyticsError(
                error instanceof Error
                    ? error.message
                    : 'Unable to load admin analytics.',
            );
        } finally {
            setAnalyticsLoading(false);
        }
    }, [isAdmin]);

    useEffect(() => {
        void loadAnalytics();
    }, [loadAnalytics]);

    const handleSeedActivities = async () => {
        try {
            setProcessing(true);
            const result = await seedActivities(activityCatalog);

            Alert.alert(
                'Seed Complete',
                `Activity catalog has been synchronized.\n\nUpserted: ${result.upserted}`,
            );

            void loadAnalytics();
        } catch (error) {
            Alert.alert(
                'Seed Failed',
                error instanceof Error ? error.message : 'Unknown error',
            );
        } finally {
            setProcessing(false);
        }
    };

    const handleBackfillTeamStats = async () => {
        try {
            setProcessing(true);
            const result = await backfillTeamStats();

            Alert.alert(
                'Backfill Complete',
                `Team statistics have been refreshed.\n\nScanned: ${result.scanned}\nUpdated: ${result.updated}`,
            );

            void loadAnalytics();
        } catch (error) {
            Alert.alert(
                'Backfill Failed',
                error instanceof Error ? error.message : 'Unknown error',
            );
        } finally {
            setProcessing(false);
        }
    };

    if (!isAdmin) {
        return (
            <AppGradientScreen>
                <InfoBanner
                    title="Admin access required"
                    message="This area is restricted to approved STEMM Lab administrators."
                    tone="warning"
                />

                <AppButton
                    title="Back to Home"
                    variant="secondary"
                    onPress={() => navigation.navigate('Home')}
                    style={styles.backButton}
                />
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <AppText variant="caption" color="textMuted">
                Administrator tools
            </AppText>

            <AppText variant="title" style={styles.title}>
                Admin Dashboard
            </AppText>

            <AppText variant="body" color="textMuted" style={styles.subtitle}>
                Manage activity catalog data, maintenance tasks, and read-only review tools.
            </AppText>

            <AppCard style={styles.card}>
                <View style={styles.cardHeader}>
                    <View>
                        <AppText variant="subtitle">Admin Identity</AppText>
                        <AppText variant="caption" color="textMuted" style={styles.cardText}>
                            Signed in administrator account
                        </AppText>
                    </View>

                    <AppBadge label="Admin" tone="success"/>
                </View>

                <View style={styles.metaGrid}>
                    <View style={styles.metaItem}>
                        <AppText variant="caption" color="textMuted">Email</AppText>
                        <AppText variant="bodyStrong" style={styles.metaValue}>
                            {user?.email ?? 'No email'}
                        </AppText>
                    </View>

                    <View style={styles.metaItem}>
                        <AppText variant="caption" color="textMuted">UID</AppText>
                        <AppText variant="bodyStrong" style={styles.metaValue}>
                            {user?.uid ?? '-'}
                        </AppText>
                    </View>
                </View>
            </AppCard>

            <AppSectionHeader
                title="Analytics Snapshot"
                subtitle="Tap a card to open the related admin review area."
            />

            {analyticsLoading ? (
                <LoadingState message="Loading admin analytics..."/>
            ) : analyticsError ? (
                <InfoBanner
                    title="Analytics unavailable"
                    message={analyticsError}
                    tone="warning"
                />
            ) : analytics ? (
                <>
                    <View style={styles.analyticsGrid}>
                        <AppCard
                            style={styles.analyticsCard}
                            onPress={() => navigation.navigate('Activities')}
                        >
                            <AppText variant="caption" color="textMuted">Activities</AppText>
                            <AppText variant="title" style={styles.analyticsNumber}>
                                {analytics.totalActivities}
                            </AppText>
                            <AppText variant="caption" color="textMuted" style={styles.analyticsHint}>
                                Open catalog
                            </AppText>
                        </AppCard>

                        <AppCard
                            style={styles.analyticsCard}
                            onPress={() => navigation.navigate('AdminSubmissionList')}
                        >
                            <AppText variant="caption" color="textMuted">Submissions</AppText>
                            <AppText variant="title" style={styles.analyticsNumber}>
                                {analytics.totalSubmissions}
                            </AppText>
                            <AppText variant="caption" color="textMuted" style={styles.analyticsHint}>
                                Review records
                            </AppText>
                        </AppCard>

                        <AppCard
                            style={styles.analyticsCard}
                            onPress={() => navigation.navigate('AdminTeamList')}
                        >
                            <AppText variant="caption" color="textMuted">Teams</AppText>
                            <AppText variant="title" style={styles.analyticsNumber}>
                                {analytics.totalTeams}
                            </AppText>
                            <AppText variant="caption" color="textMuted" style={styles.analyticsHint}>
                                Review teams
                            </AppText>
                        </AppCard>
                    </View>

                    <AppButton
                        title="Refresh Analytics"
                        variant="secondary"
                        onPress={loadAnalytics}
                        disabled={processing || analyticsLoading}
                        style={styles.refreshButton}
                    />
                </>
            ) : null}

            <AppSectionHeader
                title="Activity Management"
                subtitle="Synchronize and review activity catalog data."
            />

            <AppCard style={styles.card}>
                <View style={styles.cardHeader}>
                    <View>
                        <AppText variant="subtitle">Activity Catalog</AppText>
                        <AppText variant="caption" color="textMuted" style={styles.cardText}>
                            Local activity definitions available in the app
                        </AppText>
                    </View>

                    <AppBadge label={`${activityCatalog.length} activities`} tone="info"/>
                </View>

                <AppText variant="body" color="textMuted" style={styles.sectionBody}>
                    Use this action to seed or update Firebase activity metadata from the local STEMM Lab activity
                    catalog.
                </AppText>

                <AppButton
                    title={processing ? 'Processing...' : 'Seed / Update Activities'}
                    onPress={handleSeedActivities}
                    disabled={processing}
                    style={styles.actionButton}
                />
            </AppCard>

            <AppExpandableCard title="Activity Overview">
                <View style={styles.activityList}>
                    {activityCatalog.map((activity) => {
                        const submissionCount =
                            analytics?.submissionsByActivity.find(
                                (item) => item.activityId === activity.id,
                            )?.count ?? 0;

                        return (
                            <View key={activity.id} style={styles.activityItem}>
                                <View style={styles.activityTextArea}>
                                    <AppText variant="bodyStrong">
                                        {activity.title}
                                    </AppText>

                                    <AppText variant="caption" color="textMuted" style={styles.activityMeta}>
                                        {activity.id}
                                    </AppText>
                                </View>

                                <View style={styles.activityBadges}>
                                    <AppBadge label={activity.category} tone="info"/>
                                    <AppBadge label={activity.difficulty} tone="warning"/>
                                    <AppBadge label={`${submissionCount} submissions`} tone="success"/>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </AppExpandableCard>

            <AppSectionHeader
                title="Review Tools"
                subtitle="Read-only administrative inspection."
            />

            <AppCard
                style={styles.card}
                onPress={() => navigation.navigate('AdminSubmissionList')}
            >
                <View style={styles.cardHeader}>
                    <View>
                        <AppText variant="subtitle">Review Submissions</AppText>
                        <AppText variant="caption" color="textMuted" style={styles.cardText}>
                            View recent student submissions and submission details.
                        </AppText>
                    </View>

                    <AppBadge label="Read Only" tone="info"/>
                </View>
            </AppCard>

            <AppCard
                style={styles.card}
                onPress={() => navigation.navigate('AdminTeamList')}
            >
                <View style={styles.cardHeader}>
                    <View>
                        <AppText variant="subtitle">Review Teams</AppText>
                        <AppText variant="caption" color="textMuted" style={styles.cardText}>
                            View team records, members, ownership, and raw team details.
                        </AppText>
                    </View>

                    <AppBadge label="Read Only" tone="info"/>
                </View>
            </AppCard>

            <AppSectionHeader
                title="Maintenance"
                subtitle="Run controlled maintenance operations."
            />

            <AppCard style={styles.card}>
                <AppText variant="subtitle">Team Statistics Backfill</AppText>

                <AppText variant="body" color="textMuted" style={styles.sectionBody}>
                    Recalculate and update team statistics based on stored activity submissions.
                </AppText>

                <AppButton
                    title={processing ? 'Processing...' : 'Backfill Team Stats'}
                    onPress={handleBackfillTeamStats}
                    disabled={processing}
                    variant="secondary"
                    style={styles.actionButton}
                />
            </AppCard>

            <InfoBanner
                title="Safe admin scope"
                message="This dashboard supports controlled catalog seeding, team maintenance, and read-only analytics. User management and destructive operations are intentionally excluded."
                tone="info"
            />
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

    card: {
        marginBottom: spacing.md,
    },

    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: spacing.md,
    },

    cardText: {
        marginTop: spacing.xs,
    },

    metaGrid: {
        marginTop: spacing.md,
        gap: spacing.md,
    },

    metaItem: {
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
        paddingLeft: spacing.md,
    },

    metaValue: {
        marginTop: spacing.xs,
    },

    sectionBody: {
        marginTop: spacing.md,
        lineHeight: 22,
    },

    actionButton: {
        marginTop: spacing.lg,
    },

    refreshButton: {
        marginBottom: spacing.md,
    },

    activityList: {
        marginTop: spacing.sm,
        gap: spacing.md,
    },

    activityItem: {
        gap: spacing.sm,
        paddingBottom: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },

    activityTextArea: {
        gap: spacing.xs,
    },

    activityMeta: {
        marginTop: spacing.xs,
    },

    activityBadges: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    analyticsGrid: {
        flexDirection: 'row',
        gap: spacing.md,
        marginBottom: spacing.md,
    },

    analyticsCard: {
        flex: 1,
    },

    analyticsNumber: {
        marginTop: spacing.xs,
        color: colors.primary,
    },

    analyticsHint: {
        marginTop: spacing.xs,
    },

    backButton: {
        marginTop: spacing.lg,
    },
});