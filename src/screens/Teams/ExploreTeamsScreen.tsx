import React, {useEffect, useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {collection, doc, onSnapshot, query, where} from 'firebase/firestore';
import * as Clipboard from 'expo-clipboard';

import {auth, db} from '../../services/firebase';
import {joinTeamById} from '../../services/teamService';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppSectionHeader,
    AppStatusToast,
    AppText,
    EmptyState,
    InfoBanner,
    LoadingState,
} from '../../components/ui';

import {spacing} from '../../theme';

type TeamCard = {
    id: string;
    name: string;
    code: string;
    members?: string[];
    isPublic?: boolean;
};

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone?: 'success' | 'info' | 'warning' | 'danger';
};

export default function ExploreTeamsScreen() {
    const user = auth.currentUser;

    const [teams, setTeams] = useState<TeamCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
    const [toast, setToast] = useState<ToastState>({
        visible: false,
        title: '',
    });

    useEffect(() => {
        if (!user) return;

        const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
            const data = snap.data() as any;
            setCurrentTeamId(data?.teamId ?? null);
        });

        return unsub;
    }, [user?.uid]);

    useEffect(() => {
        const q = query(collection(db, 'teams'), where('isPublic', '==', true));

        const unsub = onSnapshot(
            q,
            (snap) => {
                const list: TeamCard[] = snap.docs.map((d) => ({
                    id: d.id,
                    ...(d.data() as any),
                }));

                setTeams(list);
                setLoading(false);
            },
            (err) => {
                setLoading(false);
                showToast('Load failed', err?.message ?? 'Failed to load teams.', 'danger');
            },
        );

        return unsub;
    }, []);

    if (!user) return null;

    const blocked = !!currentTeamId;

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

    const copyCode = async (code: string) => {
        try {
            await Clipboard.setStringAsync(code);
            showToast('Team code copied', 'You can now share or reuse this code.', 'success');
        } catch {
            showToast('Copy failed', 'Please try again.', 'danger');
        }
    };

    const handleJoin = async (teamId: string) => {
        if (blocked) {
            showToast(
                'Already in a team',
                'Leave your current team before joining another one.',
                'warning',
            );
            return;
        }

        try {
            await joinTeamById(
                teamId,
                user.uid,
                user.displayName ?? null,
                user.email ?? null,
            );

            showToast('Team joined', 'You joined the team successfully.', 'success');
        } catch (e: any) {
            showToast('Join failed', e?.message ?? 'Failed to join team.', 'danger');
        }
    };

    if (loading) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading public teams..."/>
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen scroll={false} padded={false}>
            <FlatList
                data={teams}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.content}
                ListHeaderComponent={
                    <View>
                        <AppText variant="caption" color="textMuted">
                            Collaboration
                        </AppText>

                        <AppText variant="title" style={styles.title}>
                            Explore Teams
                        </AppText>

                        <AppText variant="body" color="textMuted" style={styles.subtitle}>
                            Browse public teams and join a group for shared STEMM Lab activities.
                        </AppText>

                        {blocked ? (
                            <InfoBanner
                                title="You are already in a team"
                                message="You need to leave your current team before joining another public team."
                                tone="warning"
                            />
                        ) : null}

                        <AppSectionHeader
                            title="Public Teams"
                            subtitle={`${teams.length} available team${teams.length === 1 ? '' : 's'}`}
                        />
                    </View>
                }
                ListEmptyComponent={
                    <EmptyState
                        title="No public teams yet"
                        message="Ask classmates to make their team public, or create your own team from Team Up."
                    />
                }
                renderItem={({item}) => (
                    <AppCard style={styles.card}>
                        <View style={styles.cardHeader}>
                            <View style={styles.teamTextArea}>
                                <AppText variant="sectionTitle">{item.name}</AppText>

                                <AppText variant="caption" color="textMuted" style={styles.meta}>
                                    {item.members?.length ?? 0} member
                                    {(item.members?.length ?? 0) === 1 ? '' : 's'}
                                </AppText>
                            </View>

                            <AppBadge label="Public" tone="success"/>
                        </View>

                        <View style={styles.codeRow}>
                            <View>
                                <AppText variant="caption" color="textMuted">
                                    Team code
                                </AppText>

                                <AppText variant="bodyStrong" style={styles.codeText}>
                                    {item.code}
                                </AppText>
                            </View>

                            <AppButton
                                title="Copy"
                                variant="outline"
                                fullWidth={false}
                                onPress={() => copyCode(item.code)}
                                style={styles.copyButton}
                            />
                        </View>

                        <AppButton
                            title={blocked ? 'Already in a team' : 'Join Team'}
                            disabled={blocked}
                            onPress={() => handleJoin(item.id)}
                            style={styles.joinButton}
                        />
                    </AppCard>
                )}
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
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    teamTextArea: {
        flex: 1,
    },

    meta: {
        marginTop: spacing.xs,
    },

    codeRow: {
        marginTop: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    codeText: {
        marginTop: spacing.xs,
        letterSpacing: 1,
    },

    copyButton: {
        minWidth: 86,
        minHeight: 40,
        paddingHorizontal: spacing.lg,
    },

    joinButton: {
        marginTop: spacing.lg,
    },
});