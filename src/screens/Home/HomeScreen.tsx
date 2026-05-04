import React, {useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';

import {AppStackParamList} from '../../navigation/AppStack';
import {auth} from '../../services/firebase';
import {backfillTeamStats} from '../../services/teamMigrationService';
import {seedActivities} from '../../services/activityAdminService';
import {activityCatalog} from '../../features/activities/activityCatalog';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppIconButton,
    AppSectionHeader,
    AppText,
    InfoBanner,
    AppBottomNavBar,
} from '../../components/ui';

import {spacing} from '../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'Home'>;

export default function HomeScreen({navigation}: Props) {
    const user = auth.currentUser;
    const [migrating, setMigrating] = useState(false);

    const ADMIN_UIDS = ['U9Uicg91tbVUTBQvyFpmB3rXtI92'];
    const isAdmin = !!user?.uid && ADMIN_UIDS.includes(user.uid);

    const displayName = user?.displayName ?? user?.email ?? 'STEMM Lab learner';

    const smartHint =
        user?.displayName || user?.email
            ? 'Continue your latest experiment, manage your team, or review your learning progress.'
            : 'Start your first STEMM activity and explore prediction, measurement, and reflection.';

    const handleBackfill = async () => {
        try {
            setMigrating(true);
            const result = await backfillTeamStats();

            Alert.alert(
                'Backfill Complete ✅',
                `Scanned: ${result.scanned}\nUpdated: ${result.updated}`,
            );
        } catch (error: any) {
            Alert.alert('Error ❌', error?.message ?? 'Unknown error');
        } finally {
            setMigrating(false);
        }
    };

    const handleSeedActivities = async () => {
        try {
            setMigrating(true);
            const res = await seedActivities(activityCatalog);

            Alert.alert('Seed Complete ✅', `Upserted: ${res.upserted}`);
        } catch (error: any) {
            Alert.alert('Error ❌', error?.message ?? 'Unknown error');
        } finally {
            setMigrating(false);
        }
    };

    return (
        <AppGradientScreen>
            <View style={styles.topActionRow}>
                <View/>
                <AppIconButton
                    label="⚙"
                    accessibilityLabel="Open profile"
                    onPress={() => navigation.navigate('Profile')}
                />
            </View>

            <View style={styles.hero}>
                <AppText variant="caption" color="textMuted">
                    Welcome back
                </AppText>

                <AppText variant="title" style={styles.title}>
                    {displayName}
                </AppText>

                <AppText
                    variant="body"
                    color="textMuted"
                    style={styles.heroSubtitle}
                >
                    What would you like to explore today?
                </AppText>
            </View>

            <InfoBanner
                title="STEMM Lab is ready"
                message={smartHint}
                tone="info"
            />

            <AppSectionHeader
                title="Main actions"
                subtitle="Quick access to your learning workflow"
            />

            <AppCard>
                <View style={styles.cardHeader}>
                    <AppBadge label="Activities" tone="primary"/>
                </View>

                <AppText variant="subtitle" style={styles.cardTitle}>
                    Start or continue an experiment
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.cardText}>
                    Explore prediction, measurement, reflection, results insights, and smart feedback.
                </AppText>

                <AppButton
                    title="Open Activities"
                    onPress={() => navigation.navigate('Activities')}
                    style={styles.cardButton}
                />
            </AppCard>

            <View style={styles.grid}>
                <AppCard
                    style={styles.gridCard}
                    onPress={() => navigation.navigate('TeamUp')}
                >
                    <AppText variant="sectionTitle">Team Up</AppText>
                    <AppText variant="caption" color="textMuted" style={styles.gridText}>
                        Join or create a student team.
                    </AppText>
                </AppCard>

                <AppCard
                    style={styles.gridCard}
                    onPress={() => navigation.navigate('TeamDetail')}
                >
                    <AppText variant="sectionTitle">My Team</AppText>
                    <AppText variant="caption" color="textMuted" style={styles.gridText}>
                        View team details and progress.
                    </AppText>
                </AppCard>
            </View>

            <AppCard onPress={() => navigation.navigate('Leaderboard')}>
                <AppText variant="sectionTitle">Leaderboard</AppText>
                <AppText variant="caption" color="textMuted" style={styles.gridText}>
                    Compare scores and learning progress.
                </AppText>
            </AppCard>

            {__DEV__ && isAdmin ? (
                <>
                    <AppSectionHeader title="Developer tools"/>

                    <AppButton
                        title={migrating ? 'DEV: Migrating...' : 'DEV: Backfill team stats'}
                        onPress={handleBackfill}
                        disabled={migrating}
                        variant="outline"
                        style={styles.devButton}
                    />

                    <AppButton
                        title={migrating ? 'DEV: Seeding...' : 'DEV: Seed activities'}
                        onPress={handleSeedActivities}
                        disabled={migrating}
                        variant="outline"
                        style={styles.devButton}
                    />
                </>
            ) : null}

            <AppBottomNavBar
                items={[
                    {
                        label: 'Home',
                        icon: 'home',
                        active: true,
                        onPress: () => navigation.navigate('Home'),
                    },
                    {
                        label: 'Activity',
                        icon: 'activity',
                        onPress: () => navigation.navigate('Activities'),
                    },
                    {
                        label: 'Profile',
                        icon: 'user',
                        onPress: () => navigation.navigate('Profile'),
                    },
                ]}
            />
        </AppGradientScreen>
    );
}

const styles = StyleSheet.create({
    topActionRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.sm,
    },

    hero: {
        marginBottom: spacing.xl,
    },

    title: {
        marginTop: spacing.xs,
    },

    heroSubtitle: {
        marginTop: spacing.sm,
    },

    cardHeader: {
        marginBottom: spacing.md,
    },

    cardTitle: {
        marginBottom: spacing.sm,
    },

    cardText: {
        marginBottom: spacing.lg,
    },

    cardButton: {
        marginTop: spacing.sm,
    },

    grid: {
        flexDirection: 'row',
        gap: spacing.md,
    },

    gridCard: {
        flex: 1,
    },

    gridText: {
        marginTop: spacing.sm,
    },

    devButton: {
        marginBottom: spacing.md,
    },
});