import React, {useEffect, useMemo, useState} from 'react';
import {Alert, FlatList, StyleSheet, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {doc, onSnapshot, updateDoc} from 'firebase/firestore';
import * as Clipboard from 'expo-clipboard';

import {auth, db} from '../../services/firebase';
import {leaveTeam} from '../../services/teamService';
import type {AppStackParamList} from '../../navigation/AppStack';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppConfirmDialog,
    AppGradientScreen,
    AppSectionHeader,
    AppStatusToast,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../components/ui';

import {colors, spacing} from '../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'TeamDetail'>;

type TeamDoc = {
    name: string;
    code: string;
    createdBy: string;
    isPublic?: boolean;
    members: string[];
    memberMap?: Record<string, { displayName: string | null; email: string | null }>;
    stats?: {
        totalScore?: number;
        memberCount?: number;
        lastUpdated?: any;
    };
};

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone?: 'success' | 'info' | 'warning' | 'danger';
};

export default function TeamDetailScreen({route}: Props) {
    const user = auth.currentUser;

    const mode: 'my' | 'view' = route.params?.mode ?? 'my';
    const routeTeamId = route.params?.teamId ?? null;
    const isViewMode = mode === 'view';

    const [teamId, setTeamId] = useState<string | null>(null);
    const [team, setTeam] = useState<TeamDoc | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [leaveDialogVisible, setLeaveDialogVisible] = useState(false);
    const [toast, setToast] = useState<ToastState>({
        visible: false,
        title: '',
    });

    useEffect(() => {
        setError(null);
        setLoading(true);
        setTeam(null);

        if (!user) {
            setTeamId(null);
            setLoading(false);
            return;
        }

        if (isViewMode) {
            if (!routeTeamId) {
                setTeamId(null);
                setLoading(false);
                setError('No teamId provided for view mode.');
                return;
            }

            setTeamId(routeTeamId);
            return;
        }

        const unsub = onSnapshot(
            doc(db, 'users', user.uid),
            (snap) => {
                const data = snap.data() as any;
                setTeamId(data?.teamId ?? null);
            },
            (err) => {
                setError(err?.message ?? 'Failed to load user profile.');
                setTeamId(null);
                setLoading(false);
            },
        );

        return unsub;
    }, [user?.uid, isViewMode, routeTeamId]);

    useEffect(() => {
        if (!teamId) {
            setTeam(null);
            setLoading(false);
            return;
        }

        const unsub = onSnapshot(
            doc(db, 'teams', teamId),
            (snap) => {
                if (!snap.exists()) {
                    setTeam(null);
                    setLoading(false);
                    setError('Team not found.');
                    return;
                }

                setTeam(snap.data() as TeamDoc);
                setLoading(false);
            },
            (err) => {
                setTeam(null);
                setLoading(false);
                setError(err?.message ?? 'Failed to load team.');
            },
        );

        return unsub;
    }, [teamId]);

    const memberList = useMemo(() => {
        const map = team?.memberMap ?? {};
        return Object.entries(map).map(([uid, info]) => ({
            uid,
            displayName: info.displayName,
            email: info.email,
        }));
    }, [team?.memberMap]);

    if (!user) return null;

    if (loading) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading team..."/>
            </AppGradientScreen>
        );
    }

    if (error && isViewMode) {
        return (
            <AppGradientScreen>
                <AppText variant="title">Cannot view this team</AppText>
                <InfoBanner
                    title="Team unavailable"
                    message={
                        error.includes('Missing or insufficient permissions')
                            ? "This team is private or you don't have permission to view it."
                            : error
                    }
                    tone="warning"
                />
            </AppGradientScreen>
        );
    }

    if (!teamId || !team) {
        return (
            <AppGradientScreen>
                <AppText variant="title">No team yet</AppText>
                <InfoBanner
                    title={isViewMode ? 'Team could not be loaded' : 'Create or join a team'}
                    message={
                        isViewMode
                            ? 'This team could not be loaded.'
                            : 'Go to Team Up to create a new team or join with a team code.'
                    }
                    tone="info"
                />
            </AppGradientScreen>
        );
    }

    const isCreator = team.createdBy === user.uid;
    const visibilityLabel = team.isPublic ? 'Public' : 'Private';
    const canCopyCode = !!team.isPublic || !isViewMode;

    const showToast = (
        title: string,
        message?: string,
        tone: ToastState['tone'] = 'success',
    ) => {
        setToast({
            visible: true,
            title,
            message,
            tone,
        });
    };

    const copyCode = async () => {
        if (!canCopyCode) {
            showToast('Unavailable', 'Team code is hidden for private teams.', 'warning');
            return;
        }

        try {
            await Clipboard.setStringAsync(team.code);
            showToast('Team code copied', 'You can now share it with your teammate.', 'success');
        } catch {
            showToast('Copy failed', 'Please try again.', 'danger');
        }
    };

    const handleLeave = async () => {
        if (isViewMode) return;

        try {
            await leaveTeam(teamId, user.uid);
            showToast('You left the team', 'You can create or join another team later.', 'info');
        } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Failed to leave team.');
        }
    };

    const toggleVisibility = async () => {
        if (isViewMode || !isCreator) return;

        try {
            await updateDoc(doc(db, 'teams', teamId), {
                isPublic: !team.isPublic,
                updatedAt: new Date(),
            });

            showToast(
                'Visibility updated',
                `Team is now ${!team.isPublic ? 'Public' : 'Private'}.`,
                'success',
            );
        } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Failed to update visibility.');
        }
    };

    return (
        <AppGradientScreen scroll={false} padded={false}>
            <FlatList
                data={memberList}
                keyExtractor={(item) => item.uid}
                contentContainerStyle={styles.content}
                ListHeaderComponent={
                    <View>
                        <AppText variant="caption" color="textMuted">
                            Collaboration
                        </AppText>

                        <AppText variant="title" style={styles.title}>
                            {isViewMode ? 'Team Preview' : 'My Team'}
                        </AppText>

                        {isViewMode ? (
                            <InfoBanner
                                title="Viewing Team"
                                message="This is a read-only team view."
                                tone="info"
                            />
                        ) : null}

                        <AppCard style={styles.card}>
                            <View style={styles.codeRow}>
                                <View style={styles.codeTextArea}>
                                    <AppText variant="caption" color="textMuted">
                                        Team code
                                    </AppText>

                                    <AppText variant="subtitle" style={styles.code}>
                                        {canCopyCode ? team.code : 'Hidden'}
                                    </AppText>
                                </View>

                                <AppButton
                                    title="Copy"
                                    onPress={copyCode}
                                    disabled={!canCopyCode}
                                    fullWidth={false}
                                    style={styles.copyButton}
                                />
                            </View>
                        </AppCard>

                        <AppCard style={styles.card}>
                            <View style={styles.visibilityHeader}>
                                <View>
                                    <AppText variant="caption" color="textMuted">
                                        Visibility
                                    </AppText>
                                    <AppText variant="subtitle" style={styles.visibilityTitle}>
                                        {visibilityLabel}
                                    </AppText>
                                </View>

                                <AppBadge
                                    label={visibilityLabel}
                                    tone={team.isPublic ? 'success' : 'warning'}
                                />
                            </View>

                            {!isViewMode ? (
                                isCreator ? (
                                    <AppButton
                                        title={`Make ${team.isPublic ? 'Private' : 'Public'}`}
                                        variant="outline"
                                        onPress={toggleVisibility}
                                        style={styles.visibilityButton}
                                    />
                                ) : (
                                    <AppText variant="body" color="textMuted" style={styles.helperText}>
                                        Only the creator can change visibility.
                                    </AppText>
                                )
                            ) : (
                                <AppText variant="body" color="textMuted" style={styles.helperText}>
                                    Read-only view from leaderboard.
                                </AppText>
                            )}
                        </AppCard>

                        <AppSectionHeader
                            title="Members"
                            subtitle={`${memberList.length} member${memberList.length === 1 ? '' : 's'} in this team`}
                        />
                    </View>
                }
                renderItem={({item}) => (
                    <AppCard style={styles.memberCard}>
                        <AppText variant="bodyStrong">
                            {item.displayName ?? '(No name)'}
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.memberEmail}>
                            {item.email ?? ''}
                        </AppText>
                    </AppCard>
                )}
                ListFooterComponent={
                    !isViewMode ? (
                        <AppButton
                            title="Leave Team"
                            variant="outline"
                            onPress={() => setLeaveDialogVisible(true)}
                            style={styles.leaveButton}
                        />
                    ) : null
                }
            />

            <AppConfirmDialog
                visible={leaveDialogVisible}
                title="Leave this team?"
                message="You will no longer be part of this team. You can join again later if you have the team code."
                confirmLabel="Leave"
                cancelLabel="Stay"
                danger
                onCancel={() => setLeaveDialogVisible(false)}
                onConfirm={() => {
                    setLeaveDialogVisible(false);
                    void handleLeave();
                }}
            />

            <AppStatusToast
                visible={toast.visible}
                title={toast.title}
                message={toast.message}
                tone={toast.tone}
                onHide={() =>
                    setToast((prev) => ({
                        ...prev,
                        visible: false,
                    }))
                }
            />
        </AppGradientScreen>
    );
}

const styles = StyleSheet.create({
    content: {
        padding: spacing.lg,
        paddingBottom: spacing.xxxl,
    },

    title: {
        marginTop: spacing.xs,
        marginBottom: spacing.lg,
    },

    card: {
        marginBottom: spacing.md,
    },

    codeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },

    codeTextArea: {
        flex: 1,
    },

    code: {
        marginTop: spacing.xs,
        letterSpacing: 1,
    },

    copyButton: {
        minWidth: 92,
        minHeight: 42,
        paddingHorizontal: spacing.lg,
    },

    visibilityHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

    visibilityTitle: {
        marginTop: spacing.xs,
    },

    visibilityButton: {
        marginTop: spacing.md,
    },

    helperText: {
        marginTop: spacing.sm,
    },

    memberCard: {
        marginBottom: spacing.sm,
        padding: spacing.lg,
    },

    memberEmail: {
        marginTop: spacing.xs,
    },

    leaveButton: {
        marginTop: spacing.xl,
        marginBottom: spacing.xl,
        borderColor: colors.danger,
        backgroundColor: colors.dangerSoft,
    },
});