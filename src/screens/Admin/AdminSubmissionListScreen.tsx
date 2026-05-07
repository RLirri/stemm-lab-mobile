import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../navigation/AppStack';
import {
    getRecentAdminSubmissions,
    type AdminSubmissionItem,
} from '../../services/admin/adminReviewService';
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

type Props = NativeStackScreenProps<AppStackParamList, 'AdminSubmissionList'>;

function getActivityTitle(activityId: string): string {
    const activity = activityCatalog.find((item) => item.id === activityId);
    return activity?.title ?? 'Unknown activity';
}

function formatStatus(status?: string): string {
    if (!status) return 'Submitted';
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function getReadableScore(score: unknown): string {
    return typeof score === 'number' && Number.isFinite(score) ? score.toFixed(1) : '-';
}

export default function AdminSubmissionListScreen({navigation}: Props) {
    const [submissions, setSubmissions] = useState<AdminSubmissionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const loadSubmissions = useCallback(async () => {
        try {
            setLoading(true);
            setErrorMessage(null);

            const result = await getRecentAdminSubmissions(30);
            setSubmissions(result);
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : 'Unable to load recent submissions.',
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadSubmissions();
    }, [loadSubmissions]);

    if (loading) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading recent submissions..."/>
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <AppText variant="caption" color="textMuted">
                Admin review tools
            </AppText>

            <AppText variant="title" style={styles.title}>
                Recent Submissions
            </AppText>

            <AppText variant="body" color="textMuted" style={styles.subtitle}>
                Review recent student submissions in read-only mode.
            </AppText>

            {errorMessage ? (
                <InfoBanner
                    title="Submissions unavailable"
                    message={errorMessage}
                    tone="warning"
                />
            ) : null}

            <AppSectionHeader
                title="Submission Records"
                subtitle={`Showing ${submissions.length} recent submissions`}
            />

            {submissions.length === 0 ? (
                <EmptyState
                    title="No submissions found"
                    message="No submission records are currently available for admin review."
                />
            ) : (
                <View style={styles.list}>
                    {submissions.map((item) => (
                        <Pressable
                            key={item.id}
                            onPress={() =>
                                navigation.navigate('AdminSubmissionDetail', {
                                    submissionId: item.id,
                                    submissionItem: item,
                                })
                            }
                            style={({pressed}) => [
                                styles.pressableCard,
                                pressed && styles.pressedCard,
                            ]}
                        >
                            <AppCard style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <View style={styles.textArea}>
                                        <AppText variant="subtitle">
                                            {getActivityTitle(item.activityId)}
                                        </AppText>

                                        <AppText variant="caption" color="textMuted" style={styles.metaText}>
                                            {item.activityId}
                                        </AppText>
                                    </View>

                                    <AppBadge label={formatStatus(item.status)} tone="success"/>
                                </View>

                                <View style={styles.metaRow}>
                                    <View style={styles.metaItem}>
                                        <AppText variant="caption" color="textMuted">Score</AppText>
                                        <AppText variant="bodyStrong" style={styles.metaValue}>
                                            {getReadableScore(item.score)}
                                        </AppText>
                                    </View>

                                    <View style={styles.metaItem}>
                                        <AppText variant="caption" color="textMuted">Team</AppText>
                                        <AppText variant="bodyStrong" style={styles.metaValue}>
                                            {item.teamId ?? 'Individual'}
                                        </AppText>
                                    </View>
                                </View>

                                <AppText variant="caption" color="textMuted">
                                    Tap to review submission detail
                                </AppText>
                            </AppCard>
                        </Pressable>
                    ))}
                </View>
            )}
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

    list: {
        gap: spacing.md,
    },

    pressableCard: {
        borderRadius: 20,
    },

    pressedCard: {
        opacity: 0.86,
        transform: [{scale: 0.99}],
    },

    card: {
        gap: spacing.md,
    },

    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: spacing.md,
    },

    textArea: {
        flex: 1,
    },

    metaText: {
        marginTop: spacing.xs,
    },

    metaRow: {
        flexDirection: 'row',
        gap: spacing.md,
    },

    metaItem: {
        flex: 1,
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
        paddingLeft: spacing.md,
    },

    metaValue: {
        marginTop: spacing.xs,
    },
});