import React, {useEffect, useMemo, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../navigation/AppStack';
import {auth} from '../../services/firebase';
import {getActivityById} from '../../services/activityService';
import type {Activity} from '../../types/activity';
import {activityCatalog} from '../../features/activities/activityCatalog';

import {createRunDraft} from '../../store/activityRunDraftStore';
import {createActivity2RunDraft} from '../../store/activity2RunDraftStore';
import {createActivity3RunDraft} from '../../store/activity3RunDraftStore';
import {createActivity4RunDraft} from '../../store/activity4RunDraftStore';
import {createActivity5RunDraft} from '../../store/activity5RunDraftStore';
import {createActivity6RunDraft} from '../../store/activity6RunDraftStore';
import {createActivity7RunDraft} from '../../store/activity7RunDraftStore';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppText,
    InfoBanner,
    LoadingState,
    AppExpandableCard,
    AppStepList,
} from '../../components/ui';

import {spacing} from '../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'ActivityDetail'>;

type ActivityFlowMeta = {
    id: string;
    slug?: string;
    startRoute?: keyof AppStackParamList;
};

function getActivitySlug(activity: Activity | null): string | null {
    if (!activity) return null;
    const maybeSlug = (activity as unknown as { slug?: string }).slug;
    return typeof maybeSlug === 'string' && maybeSlug.trim()
        ? maybeSlug.trim()
        : null;
}

function isNonEmptyString(x: unknown): x is string {
    return typeof x === 'string' && x.trim().length > 0;
}

export default function ActivityDetailScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;

    const [activity, setActivity] = useState<Activity | null>(null);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        let mounted = true;

        (async () => {
            try {
                const a = await getActivityById(activityId);
                if (mounted) setActivity(a);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Failed to load activity';
                Alert.alert('Error', msg);
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [activityId]);

    const flow = useMemo<ActivityFlowMeta | null>(() => {
        const defs = activityCatalog as unknown as ActivityFlowMeta[];
        const slug = getActivitySlug(activity);

        if (slug) {
            const bySlug = defs.find(
                (d) => isNonEmptyString(d.slug) && d.slug === slug,
            );
            if (bySlug) return bySlug;
        }

        return defs.find((d) => d.id === activityId) ?? null;
    }, [activity, activityId]);

    const timeSpanLabel =
        activity?.timeSpanMinutes && activity.timeSpanMinutes > 0
            ? `~${activity.timeSpanMinutes} min`
            : null;

    async function onStart() {
        if (!user || !activity) return;

        try {
            setStarting(true);

            const startRoute = flow?.startRoute;

            if (!startRoute) {
                Alert.alert(
                    'Not implemented',
                    'This activity flow hasn’t been implemented yet for this build.',
                );
                return;
            }

            switch (startRoute) {
                case 'A1SessionSetup': {
                    const draft = createRunDraft(activityId, user.uid);
                    navigation.navigate('A1SessionSetup', {
                        activityId,
                        runId: draft.runId,
                    });
                    return;
                }

                case 'A1AttemptPlan':
                case 'A1Measurements':
                case 'A1Result':
                case 'A1Comparison':
                case 'A1ReflectionSubmit': {
                    Alert.alert(
                        'Flow misconfigured',
                        'Activity 1 must start at Session Setup. Please set startRoute to A1SessionSetup.',
                    );
                    return;
                }

                case 'A2Overview': {
                    navigation.navigate('A2Overview', {activityId});
                    return;
                }

                case 'A2SessionSetup': {
                    const draft = createActivity2RunDraft(activityId, user.uid);
                    navigation.navigate('A2SessionSetup', {
                        activityId,
                        runId: draft.runId,
                    });
                    return;
                }

                case 'A2Prediction':
                case 'A2Measurement':
                case 'A2Map':
                case 'A2Results':
                case 'A2ReflectionSubmit': {
                    Alert.alert(
                        'Flow misconfigured',
                        'Activity 2 must start at Overview or Session Setup. Please set startRoute to A2Overview or A2SessionSetup.',
                    );
                    return;
                }

                case 'A3Overview': {
                    navigation.navigate('A3Overview', {activityId});
                    return;
                }

                case 'A3SessionSetup': {
                    const draft = createActivity3RunDraft({
                        activityId,
                        createdBy: user.uid,
                    });
                    navigation.navigate('A3SessionSetup', {
                        activityId,
                        runId: draft.runId,
                    });
                    return;
                }

                case 'A3Prediction':
                case 'A3Measurements':
                case 'A3Results':
                case 'A3Comparison':
                case 'A3ReflectionSubmit': {
                    Alert.alert(
                        'Flow misconfigured',
                        'Activity 3 must start at Overview or Session Setup. Please set startRoute to A3Overview or A3SessionSetup.',
                    );
                    return;
                }

                case 'A4Overview': {
                    navigation.navigate('A4Overview', {activityId});
                    return;
                }

                case 'A4SessionSetup': {
                    const draft = createActivity4RunDraft({
                        activityId,
                        createdBy: user.uid,
                        designCount: 3,
                    });
                    navigation.navigate('A4SessionSetup', {
                        activityId,
                        runId: draft.runId,
                    });
                    return;
                }

                case 'A4Prediction':
                case 'A4Measurements':
                case 'A4Results':
                case 'A4Comparison':
                case 'A4ReflectionSubmit': {
                    Alert.alert(
                        'Flow misconfigured',
                        'Activity 4 must start at Overview or Session Setup. Please set startRoute to A4Overview or A4SessionSetup.',
                    );
                    return;
                }

                case 'A5Overview': {
                    navigation.navigate('A5Overview', {activityId});
                    return;
                }

                case 'A5SessionSetup': {
                    const draft = createActivity5RunDraft({
                        activityId,
                        createdBy: user.uid,
                        participantCount: 1,
                        samplingHz: 50,
                        movementDurationSec: 20,
                        gpsEnabled: true,
                        feedbackEnabled: true,
                    });

                    navigation.navigate('A5SessionSetup', {
                        activityId,
                        runId: draft.runId,
                    });
                    return;
                }

                case 'A5Prediction':
                case 'A5GuidedTrials':
                case 'A5Results':
                case 'A5Comparison':
                case 'A5ReflectionSubmit': {
                    Alert.alert(
                        'Flow misconfigured',
                        'Activity 5 must start at Overview or Session Setup. Please set startRoute to A5Overview or A5SessionSetup.',
                    );
                    return;
                }

                case 'A6Overview': {
                    navigation.navigate('A6Overview', {activityId});
                    return;
                }

                case 'A6SessionSetup': {
                    const draft = createActivity6RunDraft({
                        activityId,
                        createdBy: user.uid,
                        participantCount: 1,
                        trialsPerHand: 3,
                        target: {
                            delayMinSec: 1.0,
                            delayMaxSec: 3.0,
                            targetSizePx: 56,
                        },
                        tracingPathType: 'circle',
                        maxAllowedDeviationPx: 100,
                        accuracyThresholdPct: 60,
                        gpsEnabled: true,
                        sessionLabel: undefined,
                    });

                    navigation.navigate('A6SessionSetup', {
                        activityId,
                        runId: draft.runId,
                    });
                    return;
                }

                case 'A6Prediction':
                case 'A6ReactionTrial':
                case 'A6TracingChallenge':
                case 'A6Results':
                case 'A6ReflectionSubmit': {
                    Alert.alert(
                        'Flow misconfigured',
                        'Activity 6 must start at Overview or Session Setup. Please set startRoute to A6Overview or A6SessionSetup.',
                    );
                    return;
                }

                case 'A7Overview': {
                    navigation.navigate('A7Overview', {activityId});
                    return;
                }

                case 'A7SessionSetup': {
                    const draft = createActivity7RunDraft({
                        activityId,
                        createdBy: user.uid,
                        participantCount: 1,
                        measurementDurationSec: 30,
                        targetSamplingHz: 25,
                        smoothingWindowSec: 0.6,
                        minPeakGapMs: 1500,
                        gpsEnabled: true,
                        sessionLabel: undefined,
                    });

                    navigation.navigate('A7SessionSetup', {
                        activityId,
                        runId: draft.runId,
                    });
                    return;
                }

                case 'A7Prediction':
                case 'A7Measurements':
                case 'A7Results':
                case 'A7ReflectionSubmit': {
                    Alert.alert(
                        'Flow misconfigured',
                        'Activity 7 must start at Overview or Session Setup. Please set startRoute to A7Overview or A7SessionSetup.',
                    );
                    return;
                }

                case 'Home':
                case 'Profile':
                case 'TeamUp':
                case 'TeamDetail':
                case 'ExploreTeams':
                case 'Leaderboard':
                case 'Activities':
                case 'ActivityDetail': {
                    Alert.alert(
                        'Flow misconfigured',
                        'startRoute must point to an activity flow screen.',
                    );
                    return;
                }

                default: {
                    Alert.alert(
                        'Unknown route',
                        `startRoute "${String(startRoute)}" is not supported.`,
                    );
                }
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            Alert.alert('Start failed', msg);
        } finally {
            setStarting(false);
        }
    }

    if (!user) return null;

    if (loading) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading activity..."/>
            </AppGradientScreen>
        );
    }

    if (!activity) {
        return (
            <AppGradientScreen>
                <AppText variant="title">Activity not found</AppText>
                <InfoBanner
                    title="Unable to open activity"
                    message="This activity doesn’t exist or you don’t have permission to view it."
                    tone="danger"
                />
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <AppText variant="caption" color="textMuted">
                STEMM Activity
            </AppText>

            <AppText variant="title" style={styles.title}>
                {activity.title}
            </AppText>

            <View style={styles.badgeRow}>
                <AppBadge label={activity.category} tone="info"/>
                <AppBadge label={activity.difficulty} tone="primary"/>
                {timeSpanLabel ? <AppBadge label={timeSpanLabel} tone="success"/> : null}
            </View>

            {activity.shortDescription ? (
                <AppText variant="body" color="textMuted" style={styles.shortDescription}>
                    {activity.shortDescription}
                </AppText>
            ) : null}


            {activity.description ? (
                <AppExpandableCard title="Overview" defaultExpanded>
                    <AppText variant="body" color="textMuted" style={styles.sectionBody}>
                        {activity.description}
                    </AppText>
                </AppExpandableCard>
            ) : null}

            {activity.instructions ? (
                <AppExpandableCard title="Instructions">
                    <AppStepList
                        items={activity.instructions
                            .split('\n')
                            .map((s) =>
                                s
                                    .trim()
                                    .replace(/^\d+\)\s*/, '')
                                    .replace(/^\d+\.\s*/, ''),
                            )
                            .filter(Boolean)}
                    />
                </AppExpandableCard>
            ) : null}

            {activity.equipment?.length ? (
                <AppExpandableCard title="Equipment">
                    <View style={styles.equipmentList}>
                        {activity.equipment.map((item, idx) => (
                            <View key={`${item}-${idx}`} style={styles.equipmentItem}>
                                <AppText variant="bodyStrong" color="primary">
                                    {idx + 1}.
                                </AppText>

                                <AppText variant="body" color="textMuted" style={styles.equipmentText}>
                                    {item}
                                </AppText>
                            </View>
                        ))}
                    </View>
                </AppExpandableCard>
            ) : null}

            <AppButton
                title={starting ? 'Starting...' : 'Start Activity'}
                onPress={onStart}
                disabled={starting}
                loading={starting}
                style={styles.startButton}
            />

            {!flow?.startRoute ? (
                <InfoBanner
                    title="Flow routing not configured"
                    message="Missing startRoute in activityCatalog."
                    tone="warning"
                />
            ) : __DEV__ ? (
                <AppText variant="caption" color="textMuted" style={styles.hint}>
                    Start route: {String(flow.startRoute)}
                </AppText>
            ) : null}
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

    shortDescription: {
        marginTop: spacing.lg,
    },

    sectionCard: {
        marginTop: spacing.md,
        padding: spacing.lg,
    },

    sectionBody: {
        marginTop: spacing.sm,
    },

    equipmentList: {
        marginTop: spacing.md,
        gap: spacing.sm,
    },

    equipmentItem: {
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'flex-start',
    },

    equipmentText: {
        flex: 1,
    },

    startButton: {
        marginTop: spacing.xl,
        marginBottom: spacing.md,
    },

    hint: {
        marginTop: spacing.sm,
        marginBottom: spacing.xl,
    },
});