import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../navigation/AppStack';
import {
    getAdminTeams,
    type AdminTeamItem,
} from '../../services/admin/adminReviewService';

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

type Props = NativeStackScreenProps<AppStackParamList, 'AdminTeamList'>;

function safeText(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function getTeamName(team: AdminTeamItem): string {
    return (
        safeText(team.name) !== '-'
            ? safeText(team.name)
            : safeText(team.teamName) !== '-'
                ? safeText(team.teamName)
                : 'Unnamed team'
    );
}

function getMemberCount(team: AdminTeamItem): number {
    const members = team.members;

    if (Array.isArray(members)) {
        return members.length;
    }

    const memberIds = team.memberIds;

    if (Array.isArray(memberIds)) {
        return memberIds.length;
    }

    return 0;
}

function getTeamScore(team: AdminTeamItem): string {
    const score =
        team.totalScore ??
        team.score ??
        team.teamScore ??
        team.statsTotalScore;

    return typeof score === 'number' && Number.isFinite(score)
        ? score.toFixed(1)
        : '-';
}

export default function AdminTeamListScreen({navigation}: Props) {
    const [teams, setTeams] = useState<AdminTeamItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const loadTeams = useCallback(async () => {
        try {
            setLoading(true);
            setErrorMessage(null);

            const result = await getAdminTeams(50);
            setTeams(result);
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : 'Unable to load team records.',
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadTeams();
    }, [loadTeams]);

    if (loading) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading team records..."/>
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <AppText variant="caption" color="textMuted">
                Admin review tools
            </AppText>

            <AppText variant="title" style={styles.title}>
                Team Records
            </AppText>

            <AppText variant="body" color="textMuted" style={styles.subtitle}>
                Review STEMM Lab team records in read-only mode.
            </AppText>

            {errorMessage ? (
                <InfoBanner
                    title="Teams unavailable"
                    message={errorMessage}
                    tone="warning"
                />
            ) : null}

            <AppSectionHeader
                title="Teams"
                subtitle={`Showing ${teams.length} team records`}
            />

            {teams.length === 0 ? (
                <EmptyState
                    title="No teams found"
                    message="No team records are currently available for admin review."
                />
            ) : (
                <View style={styles.list}>
                    {teams.map((team) => (
                        <Pressable
                            key={team.id}
                            onPress={() =>
                                navigation.navigate('AdminTeamDetail', {
                                    teamId: team.id,
                                    teamItem: team,
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
                                            {getTeamName(team)}
                                        </AppText>

                                        <AppText variant="caption" color="textMuted" style={styles.metaText}>
                                            {team.id}
                                        </AppText>
                                    </View>

                                    <AppBadge label="Read Only" tone="info"/>
                                </View>

                                <View style={styles.metaRow}>
                                    <View style={styles.metaItem}>
                                        <AppText variant="caption" color="textMuted">
                                            Members
                                        </AppText>

                                        <AppText variant="bodyStrong" style={styles.metaValue}>
                                            {getMemberCount(team)}
                                        </AppText>
                                    </View>

                                    <View style={styles.metaItem}>
                                        <AppText variant="caption" color="textMuted">
                                            Score
                                        </AppText>

                                        <AppText variant="bodyStrong" style={styles.metaValue}>
                                            {getTeamScore(team)}
                                        </AppText>
                                    </View>
                                </View>

                                <AppText variant="caption" color="textMuted">
                                    Tap to review team detail
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