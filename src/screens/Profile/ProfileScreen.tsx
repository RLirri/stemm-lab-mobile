import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {doc, onSnapshot, updateDoc} from 'firebase/firestore';

import {auth, db} from '../../services/firebase';
import {logout} from '../../services/authService';
import {syncQueuedSubmissions} from '../../services/syncService';
import {submitOfflineToFirebase} from '../../services/offlineSubmissionSyncAdapter';

import {BatteryStatusCard} from '../../components/battery/BatteryStatusCard';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppConfirmDialog,
    AppGradientScreen,
    AppInput,
    AppSectionHeader,
    AppStatusToast,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../components/ui';

import {colors, spacing} from '../../theme';

type UserProfileDoc = {
    uid: string;
    email: string | null;
    displayName: string | null;
    provider: string;
    teamId: string | null;
    createdAt?: any;
    updatedAt?: any;
};

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone?: 'success' | 'info' | 'warning' | 'danger';
};

function formatMemberSince(createdAt?: any): string {
    const date =
        createdAt?.toDate instanceof Function
            ? createdAt.toDate()
            : createdAt instanceof Date
                ? createdAt
                : null;

    if (!date) {
        return 'Member since unavailable';
    }

    return `Member since ${date.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
    })}`;
}

export default function ProfileScreen() {
    const user = auth.currentUser;

    const [profile, setProfile] = useState<UserProfileDoc | null>(null);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [technicalOpen, setTechnicalOpen] = useState(false);
    const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
    const [toast, setToast] = useState<ToastState>({
        visible: false,
        title: '',
    });

    useEffect(() => {
        if (!user) return;

        const ref = doc(db, 'users', user.uid);
        const unsub = onSnapshot(ref, (snap) => {
            if (!snap.exists()) return;

            const data = snap.data() as UserProfileDoc;
            setProfile(data);
            setName(data.displayName ?? '');
        });

        return unsub;
    }, [user?.uid]);

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

    if (!user) {
        return (
            <AppGradientScreen>
                <AppText variant="title">Not logged in</AppText>
                <InfoBanner
                    title="Session unavailable"
                    message="Please sign in again to access your profile."
                    tone="warning"
                />
            </AppGradientScreen>
        );
    }

    if (!profile) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading profile..."/>
            </AppGradientScreen>
        );
    }

    const saveName = async () => {
        const trimmed = name.trim();

        if (trimmed.length < 2) {
            showToast('Invalid name', 'Name must be at least 2 characters.', 'warning');
            return;
        }

        try {
            setSaving(true);

            await updateDoc(doc(db, 'users', user.uid), {
                displayName: trimmed,
            });

            showToast('Profile updated', 'Your display name has been saved.', 'success');
        } catch (e: any) {
            showToast('Update failed', e?.message ?? 'Please try again.', 'danger');
        } finally {
            setSaving(false);
        }
    };

    const retryOfflineSubmissions = async () => {
        try {
            setSyncing(true);

            const results = await syncQueuedSubmissions({
                submitToRemote: submitOfflineToFirebase,
            });

            const syncedCount = results.filter(
                (result) => result.status === 'synced',
            ).length;

            const failedCount = results.filter(
                (result) => result.status === 'failed',
            ).length;

            showToast(
                'Offline sync complete',
                `Synced: ${syncedCount} · Failed: ${failedCount}`,
                failedCount > 0 ? 'warning' : 'success',
            );
        } catch (e: any) {
            showToast(
                'Sync failed',
                e?.message ?? 'Unable to retry offline submissions.',
                'danger',
            );
        } finally {
            setSyncing(false);
        }
    };

    const providerLabel =
        profile.provider === 'password' ? 'Email account' : profile.provider;

    const teamStatusLabel = profile.teamId ? 'Team member' : 'No team';
    const memberSinceLabel = formatMemberSince(profile.createdAt);

    return (
        <AppGradientScreen>
            <AppText variant="caption" color="textMuted">
                Account
            </AppText>

            <AppText variant="title" style={styles.title}>
                Profile
            </AppText>

            <AppText variant="body" color="textMuted" style={styles.subtitle}>
                Manage your account settings, device status, and offline learning data.
            </AppText>

            <AppCard style={styles.profileCard}>
                <View style={styles.avatar}>
                    <AppText variant="subtitle" color="inverseText">
                        {(profile.displayName ?? profile.email ?? 'U').charAt(0).toUpperCase()}
                    </AppText>
                </View>

                <View style={styles.profileTextArea}>
                    <AppText variant="subtitle">
                        {profile.displayName ?? 'Unnamed user'}
                    </AppText>

                    <AppText variant="caption" color="textMuted" style={styles.email}>
                        {profile.email ?? '-'}
                    </AppText>

                    <AppText variant="caption" color="textMuted" style={styles.memberSince}>
                        {memberSinceLabel}
                    </AppText>

                    <View style={styles.badgeRow}>
                        <AppBadge label={providerLabel} tone="info"/>
                        <AppBadge
                            label={teamStatusLabel}
                            tone={profile.teamId ? 'success' : 'warning'}
                        />
                    </View>
                </View>
            </AppCard>

            <AppCard style={styles.sectionCard}>
                <AppSectionHeader
                    title="Display name"
                    subtitle="This name is shown in teams and activity collaboration."
                />

                <AppInput
                    value={name}
                    placeholder="Your name"
                    onChangeText={setName}
                    editable={!saving}
                />

                <AppButton
                    title={saving ? 'Saving...' : 'Save Changes'}
                    onPress={saveName}
                    loading={saving}
                    disabled={saving}
                    style={styles.cardButton}
                />
            </AppCard>

            <View style={styles.sectionCard}>
                <BatteryStatusCard/>
            </View>

            <AppCard style={styles.sectionCard}>
                <AppSectionHeader
                    title="Account information"
                    subtitle="Basic account information used in your learning experience."
                />

                <View style={styles.infoRow}>
                    <AppText variant="caption" color="textMuted">
                        Email
                    </AppText>
                    <AppText variant="bodyStrong" style={styles.infoValue}>
                        {profile.email ?? '-'}
                    </AppText>
                </View>

                <View style={styles.infoRow}>
                    <AppText variant="caption" color="textMuted">
                        Team
                    </AppText>
                    <AppText variant="bodyStrong" style={styles.infoValue}>
                        {profile.teamId ?? 'Not in a team'}
                    </AppText>
                </View>

                <Pressable
                    onPress={() => setTechnicalOpen((prev) => !prev)}
                    style={styles.technicalHeader}
                >
                    <View>
                        <AppText variant="bodyStrong">
                            Technical details
                        </AppText>
                        <AppText variant="caption" color="textMuted" style={styles.technicalHint}>
                            {technicalOpen ? 'Hide account identifier' : 'Show account identifier'}
                        </AppText>
                    </View>

                    <AppText variant="bodyStrong" color="primary">
                        {technicalOpen ? 'Hide' : 'Show'}
                    </AppText>
                </Pressable>

                {technicalOpen ? (
                    <View style={styles.technicalPanel}>
                        <AppText variant="caption" color="textMuted">
                            UID
                        </AppText>
                        <AppText variant="caption" color="textMuted" style={styles.uidText}>
                            {profile.uid}
                        </AppText>
                    </View>
                ) : null}
            </AppCard>

            <AppCard style={styles.sectionCard}>
                <AppSectionHeader
                    title="Offline submissions"
                    subtitle="Retry queued activity submissions when connection is available."
                />

                <AppButton
                    title={syncing ? 'Retrying sync...' : 'Retry Offline Submissions'}
                    onPress={retryOfflineSubmissions}
                    loading={syncing}
                    disabled={syncing}
                    style={styles.cardButton}
                />
            </AppCard>

            <AppButton
                title="Logout"
                variant="outline"
                onPress={() => setLogoutDialogVisible(true)}
                style={styles.logoutButton}
            />

            <AppConfirmDialog
                visible={logoutDialogVisible}
                title="Logout?"
                message="You will need to sign in again to access your STEMM Lab account."
                confirmLabel="Logout"
                cancelLabel="Stay"
                danger
                onCancel={() => setLogoutDialogVisible(false)}
                onConfirm={() => {
                    setLogoutDialogVisible(false);
                    void logout();
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
    title: {
        marginTop: spacing.xs,
    },

    subtitle: {
        marginTop: spacing.sm,
        marginBottom: spacing.lg,
    },

    profileCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },

    avatar: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },

    profileTextArea: {
        flex: 1,
    },

    email: {
        marginTop: spacing.xs,
    },

    memberSince: {
        marginTop: spacing.xs,
    },

    badgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginTop: spacing.sm,
    },

    sectionCard: {
        marginTop: spacing.md,
    },

    cardButton: {
        marginTop: spacing.md,
    },

    infoRow: {
        marginTop: spacing.md,
    },

    infoValue: {
        marginTop: spacing.xs,
    },

    technicalHeader: {
        marginTop: spacing.lg,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    technicalHint: {
        marginTop: spacing.xs,
    },

    technicalPanel: {
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: 16,
        backgroundColor: colors.surfaceMuted,
    },

    uidText: {
        marginTop: spacing.xs,
    },

    logoutButton: {
        marginTop: spacing.xl,
        marginBottom: spacing.xl,
        borderColor: colors.danger,
        backgroundColor: colors.dangerSoft,
    },
});