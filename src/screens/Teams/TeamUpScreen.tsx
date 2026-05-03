import React, {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {doc, onSnapshot} from 'firebase/firestore';

import {AppStackParamList} from '../../navigation/AppStack';
import {auth, db} from '../../services/firebase';
import {createTeam, joinTeamByCode} from '../../services/teamService';

import {
    AppButton,
    AppCard,
    AppGradientScreen,
    AppInput,
    AppSectionHeader,
    AppStatusToast,
    AppText,
    InfoBanner,
} from '../../components/ui';

import {spacing} from '../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'TeamUp'>;

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone?: 'success' | 'info' | 'warning' | 'danger';
};

export default function TeamUpScreen({navigation}: Props) {
    const user = auth.currentUser;

    const [teamName, setTeamName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [loading, setLoading] = useState(false);
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

    if (!user) return null;

    const displayName = user.displayName ?? null;
    const email = user.email ?? null;
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

    const handleCreate = async () => {
        if (blocked) {
            showToast(
                'Already in a team',
                'Leave your current team before creating a new one.',
                'warning',
            );
            return;
        }

        if (!teamName.trim()) {
            showToast('Team name required', 'Please enter a team name.', 'warning');
            return;
        }

        try {
            setLoading(true);
            const res = await createTeam(teamName.trim(), user.uid, displayName, email);
            const code = typeof res === 'string' ? undefined : res.code;

            showToast(
                'Team created',
                code ? `Team code: ${code}` : 'Your team has been created.',
                'success',
            );

            setTeamName('');

            setTimeout(() => {
                navigation.navigate('TeamDetail');
            }, 500);
        } catch (e: any) {
            showToast('Create failed', e?.message ?? 'Failed to create team.', 'danger');
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (blocked) {
            showToast(
                'Already in a team',
                'Leave your current team before joining another one.',
                'warning',
            );
            return;
        }

        if (!joinCode.trim()) {
            showToast('Team code required', 'Please enter a team code.', 'warning');
            return;
        }

        try {
            setLoading(true);
            await joinTeamByCode(joinCode.trim(), user.uid, displayName, email);

            showToast('Team joined', 'You joined the team successfully.', 'success');
            setJoinCode('');

            setTimeout(() => {
                navigation.navigate('TeamDetail');
            }, 500);
        } catch (e: any) {
            showToast('Join failed', e?.message ?? 'Failed to join team.', 'danger');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AppGradientScreen>
            <AppText variant="caption" color="textMuted">
                Collaboration
            </AppText>

            <AppText variant="title" style={styles.title}>
                Team Up
            </AppText>

            <AppText variant="body" color="textMuted" style={styles.subtitle}>
                Create a team, join with a code, or explore public teams for STEMM Lab activities.
            </AppText>

            {blocked ? (
                <>
                    <InfoBanner
                        title="You are already in a team"
                        message="Open My Team to view your members, team code, and visibility settings."
                        tone="info"
                    />

                    <AppButton
                        title="Go to My Team"
                        onPress={() => navigation.navigate('TeamDetail')}
                        style={styles.topButton}
                    />
                </>
            ) : null}

            <AppButton
                title="Explore Public Teams"
                variant="outline"
                disabled={loading}
                onPress={() => navigation.navigate('ExploreTeams')}
                style={styles.topButton}
            />

            <AppCard style={styles.sectionCard}>
                <AppSectionHeader
                    title="Create Team"
                    subtitle="Start a new team and invite classmates using your team code."
                />

                <AppInput
                    placeholder="Team name"
                    value={teamName}
                    onChangeText={setTeamName}
                    editable={!blocked && !loading}
                />

                <AppButton
                    title={loading ? 'Please wait...' : 'Create Team'}
                    disabled={loading || blocked}
                    loading={loading}
                    onPress={handleCreate}
                />
            </AppCard>

            <AppCard style={styles.sectionCard}>
                <AppSectionHeader
                    title="Join Team"
                    subtitle="Use a private team code shared by your teammate."
                />

                <AppInput
                    placeholder="Team code"
                    value={joinCode}
                    autoCapitalize="characters"
                    onChangeText={setJoinCode}
                    editable={!blocked && !loading}
                />

                <AppButton
                    title={loading ? 'Please wait...' : 'Join Team'}
                    disabled={loading || blocked}
                    loading={loading}
                    onPress={handleJoin}
                />
            </AppCard>

            <AppText variant="caption" color="textMuted" style={styles.hint}>
                Public teams appear in Explore. Private teams require a team code.
            </AppText>

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
    title: {
        marginTop: spacing.xs,
    },

    subtitle: {
        marginTop: spacing.sm,
        marginBottom: spacing.lg,
    },

    topButton: {
        marginBottom: spacing.md,
    },

    sectionCard: {
        marginTop: spacing.md,
    },

    hint: {
        marginTop: spacing.md,
        marginBottom: spacing.xl,
    },
});