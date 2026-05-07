import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../navigation/AppStack';
import {
    getAdminTeamDetail,
    type AdminTeamItem,
} from '../../services/admin/adminReviewService';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppExpandableCard,
    AppGradientScreen,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../components/ui';

import {colors, spacing} from '../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'AdminTeamDetail'>;

function asAdminTeamItem(value: unknown): AdminTeamItem | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const record = value as Record<string, unknown>;

    if (typeof record.id !== 'string') {
        return null;
    }

    return record as AdminTeamItem;
}

function safeText(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);

    try {
        return JSON.stringify(value, null, 2);
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

function getArrayField(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function getMemberList(team: AdminTeamItem): unknown[] {
    const members = getArrayField(team.members);
    const memberIds = getArrayField(team.memberIds);

    return members.length > 0 ? members : memberIds;
}

function getScoreValue(team: AdminTeamItem): string {
    const score =
        team.totalScore ??
        team.score ??
        team.teamScore ??
        team.statsTotalScore;

    return typeof score === 'number' && Number.isFinite(score)
        ? score.toFixed(1)
        : '-';
}

function getCreatedBy(team: AdminTeamItem): string {
    return safeText(team.createdBy ?? team.ownerId ?? team.createdByUid);
}

function getTeamCode(team: AdminTeamItem): string {
    return safeText(team.code ?? team.teamCode ?? team.inviteCode ?? team.id);
}

export default function AdminTeamDetailScreen({route, navigation}: Props) {
    const {teamId, teamItem} = route.params;

    const initialTeam = useMemo(() => asAdminTeamItem(teamItem), [teamItem]);

    const [detail, setDetail] = useState<AdminTeamItem | null>(initialTeam);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const loadDetail = useCallback(async () => {
        try {
            setLoading(true);
            setErrorMessage(null);

            const result = await getAdminTeamDetail(teamId);
            setDetail(result ?? initialTeam);
        } catch (error) {
            setErrorMessage(
                error instanceof Error
                    ? error.message
                    : 'Unable to load team detail.',
            );
            setDetail(initialTeam);
        } finally {
            setLoading(false);
        }
    }, [teamId, initialTeam]);

    useEffect(() => {
        void loadDetail();
    }, [loadDetail]);

    const displayTeam = detail ?? initialTeam;

    const members = useMemo(
        () => (displayTeam ? getMemberList(displayTeam) : []),
        [displayTeam],
    );

    if (loading) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading team detail..."/>
            </AppGradientScreen>
        );
    }

    if (!displayTeam) {
        return (
            <AppGradientScreen>
                <InfoBanner
                    title="Team not found"
                    message="This team record could not be loaded."
                    tone="warning"
                />

                <AppButton
                    title="Back to Teams"
                    variant="secondary"
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}
                />
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <AppText variant="caption" color="textMuted">
                Read-only team review
            </AppText>

            <AppText variant="title" style={styles.title}>
                {getTeamName(displayTeam)}
            </AppText>

            <View style={styles.badgeRow}>
                <AppBadge label="Team" tone="info"/>
                <AppBadge label="Read Only" tone="success"/>
            </View>

            {errorMessage ? (
                <InfoBanner
                    title="Using cached team record"
                    message={errorMessage}
                    tone="warning"
                />
            ) : null}

            <AppCard style={styles.card}>
                <AppText variant="subtitle">Team Summary</AppText>

                <View style={styles.metaGrid}>
                    <View style={styles.metaItem}>
                        <AppText variant="caption" color="textMuted">Team ID</AppText>
                        <AppText variant="bodyStrong" style={styles.metaValue}>
                            {displayTeam.id}
                        </AppText>
                    </View>

                    <View style={styles.metaItem}>
                        <AppText variant="caption" color="textMuted">Team Code</AppText>
                        <AppText variant="bodyStrong" style={styles.metaValue}>
                            {getTeamCode(displayTeam)}
                        </AppText>
                    </View>

                    <View style={styles.metaItem}>
                        <AppText variant="caption" color="textMuted">Members</AppText>
                        <AppText variant="bodyStrong" style={styles.metaValue}>
                            {members.length}
                        </AppText>
                    </View>

                    <View style={styles.metaItem}>
                        <AppText variant="caption" color="textMuted">Score</AppText>
                        <AppText variant="bodyStrong" style={styles.metaValue}>
                            {getScoreValue(displayTeam)}
                        </AppText>
                    </View>
                </View>
            </AppCard>

            <AppCard style={styles.card}>
                <AppText variant="subtitle">Ownership</AppText>

                <View style={styles.metaGrid}>
                    <View style={styles.metaItem}>
                        <AppText variant="caption" color="textMuted">Created By</AppText>
                        <AppText variant="bodyStrong" style={styles.metaValue}>
                            {getCreatedBy(displayTeam)}
                        </AppText>
                    </View>
                </View>
            </AppCard>

            <AppExpandableCard title="Members" defaultExpanded>
                {members.length > 0 ? (
                    <View style={styles.memberList}>
                        {members.map((member, index) => (
                            <View key={`member-${index}`} style={styles.memberItem}>
                                <AppText variant="bodyStrong">
                                    Member {index + 1}
                                </AppText>

                                <AppText variant="caption" color="textMuted" style={styles.payloadText}>
                                    {safeText(member)}
                                </AppText>
                            </View>
                        ))}
                    </View>
                ) : (
                    <AppText variant="body" color="textMuted" style={styles.sectionBody}>
                        No member list was found in this team record.
                    </AppText>
                )}
            </AppExpandableCard>

            <AppExpandableCard title="Raw Team Record">
                <AppText variant="caption" color="textMuted" style={styles.payloadText}>
                    {safeText(displayTeam)}
                </AppText>
            </AppExpandableCard>

            <InfoBanner
                title="Read-only admin review"
                message="This page is designed for inspection only. Editing and deletion are intentionally excluded to protect project data."
                tone="info"
            />

            <View style={styles.footer}>
                <AppButton
                    title="Back to Team Records"
                    variant="secondary"
                    onPress={() => navigation.goBack()}
                />
            </View>
        </AppGradientScreen>
    );
}

const styles = StyleSheet.create({
    title: {
        marginTop: spacing.xs,
    },

    badgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginTop: spacing.lg,
    },

    card: {
        marginTop: spacing.lg,
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
        marginTop: spacing.sm,
        lineHeight: 22,
    },

    memberList: {
        marginTop: spacing.sm,
        gap: spacing.md,
    },

    memberItem: {
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
        paddingLeft: spacing.md,
    },

    payloadText: {
        marginTop: spacing.sm,
        fontFamily: 'monospace',
        lineHeight: 20,
    },

    footer: {
        marginTop: spacing.xl,
        marginBottom: spacing.lg,
    },

    backButton: {
        marginTop: spacing.lg,
    },
});