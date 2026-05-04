import React, {useEffect, useRef, useState} from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Switch,
    View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {
    createActivity2RunDraft,
    discardActivity2RunDraft,
    getActivity2RunDraft,
    getLatestRecoverableActivity2RunDraft,
    hydrateActivity2RunDraftFromLocalDb,
    updateActivity2Session,
    type Activity2RunDraft,
} from '../../../store/activity2RunDraftStore';
import {confirmBatteryBeforeActivity} from '../../../services/battery';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppInput,
    AppSectionHeader,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../../components/ui';

import {spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A2SessionSetup'>;

function normalizeLabel(x: string): string | undefined {
    const s = x.trim();
    return s.length ? s : undefined;
}

export default function A2SessionSetupScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;

    const [runId, setRunId] = useState<string | null>(route.params.runId ?? null);
    const [draft, setDraft] = useState<Activity2RunDraft | null>(null);
    const [bootstrapping, setBootstrapping] = useState(true);

    const hasBootstrappedRef = useRef(false);

    const [sessionLabel, setSessionLabel] = useState<string>('');
    const [gpsEnabled, setGpsEnabled] = useState<boolean>(true);

    useEffect(() => {
        if (!user) return;
        if (hasBootstrappedRef.current) return;

        hasBootstrappedRef.current = true;
        const userId = user.uid;

        async function bootstrap() {
            try {
                setBootstrapping(true);

                const existingId = route.params.runId;

                if (existingId) {
                    const existing = getActivity2RunDraft(existingId);
                    if (existing) {
                        setRunId(existingId);
                        setDraft(existing);
                        return;
                    }

                    const hydrated = await hydrateActivity2RunDraftFromLocalDb(existingId);
                    if (hydrated) {
                        setRunId(hydrated.runId);
                        setDraft(hydrated);
                        navigation.setParams({runId: hydrated.runId});
                        return;
                    }

                    const recreated = createActivity2RunDraft(activityId, userId);
                    setRunId(recreated.runId);
                    setDraft(recreated);
                    navigation.setParams({runId: recreated.runId});
                    return;
                }

                const recoverable = await getLatestRecoverableActivity2RunDraft({
                    activityId,
                    createdBy: userId,
                });

                if (recoverable) {
                    Alert.alert(
                        'Resume previous draft?',
                        'We found an unfinished Activity 2 draft. Would you like to continue it or start a new session?',
                        [
                            {
                                text: 'Start New',
                                style: 'destructive',
                                onPress: async () => {
                                    try {
                                        await discardActivity2RunDraft(recoverable.runId);
                                    } catch (error) {
                                        console.error(
                                            '[A2SessionSetup] Failed to discard old draft',
                                            error,
                                        );
                                    }

                                    const created = createActivity2RunDraft(activityId, userId);
                                    setRunId(created.runId);
                                    setDraft(created);
                                    navigation.setParams({runId: created.runId});
                                },
                            },
                            {
                                text: 'Resume',
                                onPress: () => {
                                    setRunId(recoverable.runId);
                                    setDraft(recoverable);
                                    navigation.setParams({runId: recoverable.runId});
                                },
                            },
                        ],
                    );
                    return;
                }

                const created = createActivity2RunDraft(activityId, userId);
                setRunId(created.runId);
                setDraft(created);
                navigation.setParams({runId: created.runId});
            } catch (error) {
                console.error('[A2SessionSetup] Failed to bootstrap draft', error);

                const fallback = createActivity2RunDraft(activityId, userId);
                setRunId(fallback.runId);
                setDraft(fallback);
                navigation.setParams({runId: fallback.runId});
            } finally {
                setBootstrapping(false);
            }
        }

        void bootstrap();
    }, [activityId, navigation, route.params.runId, user]);

    useEffect(() => {
        if (!draft) return;

        setSessionLabel(draft.session.sessionLabel ?? '');
        setGpsEnabled(Boolean(draft.session.gpsEnabled));
    }, [draft]);

    function persistSessionPatch(patch: Partial<Activity2RunDraft['session']>) {
        if (!runId) return;
        const next = updateActivity2Session(runId, patch);
        setDraft(next);
    }

    function validateBeforeContinue(): { ok: true } | { ok: false; message: string } {
        const label = sessionLabel.trim();
        if (label.length > 60) {
            return {
                ok: false,
                message: 'Session label is too long. Please keep it under 60 characters.',
            };
        }

        return {ok: true};
    }

    async function onContinue() {
        if (!user) return;
        if (!runId || !draft) return;

        const v = validateBeforeContinue();
        if (!v.ok) {
            Alert.alert('Check fields', v.message);
            return;
        }

        const canContinue = await confirmBatteryBeforeActivity({
            activityId,
            activityTitle: 'Activity 2: Sound Pollution Mapping',
            intensity: gpsEnabled ? 'HIGH' : 'MEDIUM',
        });

        if (!canContinue) return;

        persistSessionPatch({
            sessionLabel: normalizeLabel(sessionLabel),
            gpsEnabled,
        });

        navigation.navigate('A2Prediction', {activityId, runId});
    }

    if (!user) return null;

    if (bootstrapping || !draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Checking for unfinished Activity 2 session..."/>
            </AppGradientScreen>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <AppGradientScreen>
                <View style={styles.header}>
                    <AppBadge label="Activity 2" tone="info"/>

                    <AppText variant="title" style={styles.title}>
                        Sound Mapping Setup
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Prepare a labelled sound pollution session and choose whether GPS tagging should be used.
                    </AppText>
                </View>

                <InfoBanner
                    title="Tool-based activity"
                    message="This activity focuses on collecting sound readings and optionally mapping locations. No challenge timer is required."
                    tone="info"
                />

                <AppSectionHeader
                    title="Session Details"
                    subtitle="Use a clear label so you can compare locations or time periods later."
                />

                <AppCard>
                    <AppInput
                        label="Session label"
                        value={sessionLabel}
                        onChangeText={setSessionLabel}
                        placeholder="e.g. Week 3 — Classroom 210"
                        maxLength={60}
                    />

                    <AppText variant="caption" color="textMuted">
                        Optional but recommended. Examples: “Classroom A – front row”,
                        “Library corner”, or “Morning traffic area”.
                    </AppText>
                </AppCard>

                <AppSectionHeader
                    title="GPS Tagging"
                    subtitle="GPS helps connect sound measurements to physical locations."
                />

                <AppCard>
                    <View style={styles.settingRow}>
                        <View style={styles.settingText}>
                            <AppText variant="bodyStrong">Enable GPS tagging</AppText>

                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                Recommended for loud vs quiet zone mapping.
                            </AppText>
                        </View>

                        <Switch value={gpsEnabled} onValueChange={setGpsEnabled}/>
                    </View>

                    {!gpsEnabled ? (
                        <InfoBanner
                            title="GPS disabled"
                            message="Map view will still work, but pins may show “No location”, and location-based comparison will be limited."
                            tone="warning"
                        />
                    ) : (
                        <InfoBanner
                            title="GPS enabled"
                            message="Each measurement can store coordinates and appear more meaningfully on the map."
                            tone="success"
                        />
                    )}
                </AppCard>

                <AppButton title="Continue" onPress={onContinue} style={styles.continueButton}/>

                <AppText variant="caption" color="textMuted" style={styles.footerHint}>
                    Next: Prediction → Measurement loop → Map → Results → Reflection & Submit.
                </AppText>

                <View style={styles.bottomSpace}/>
            </AppGradientScreen>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    keyboard: {
        flex: 1,
    },

    header: {
        marginBottom: spacing.lg,
    },

    title: {
        marginTop: spacing.md,
    },

    subtitle: {
        marginTop: spacing.sm,
    },

    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        marginBottom: spacing.lg,
    },

    settingText: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    continueButton: {
        marginTop: spacing.lg,
    },

    footerHint: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});