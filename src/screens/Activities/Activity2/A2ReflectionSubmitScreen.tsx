// src/screens/Activities/Activity2/A2ReflectionSubmitScreen.tsx

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {doc, getDoc} from 'firebase/firestore';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth, db} from '../../../services/firebase';
import {queueFinalSubmission} from '../../../services/offlineSubmissionQueueService';
import {
    getActivity2RunDraft,
    updateActivity2Session,
    type Activity2RunDraft,
} from '../../../store/activity2RunDraftStore';
import {
    pickVideoFromLibrary,
    recordVideoWithCamera,
} from '../../../services/evidenceService';
import {submitActivity2} from '../../../services/activitySubmissionService';
import {ReflectionQualityCard} from '../../../components/reflection/ReflectionQualityCard';
import {checkReflectionQuality} from '../../../services/reflectionQualityService';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppInput,
    AppSectionHeader,
    AppStatusToast,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A2ReflectionSubmit'>;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'Submission failed.';
}

export default function A2ReflectionSubmitScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity2RunDraft | null>(null);
    const [reflection, setReflection] = useState<string>('');
    const [rating, setRating] = useState<number>(4);
    const [submitting, setSubmitting] = useState(false);
    const [attaching, setAttaching] = useState(false);

    const [toast, setToast] = useState<ToastState>({
        visible: false,
        title: '',
        message: undefined,
        tone: 'success',
    });

    const reflectionQuality = useMemo(
        () => checkReflectionQuality(reflection),
        [reflection],
    );

    const refreshDraft = useCallback(() => {
        const d = getActivity2RunDraft(runId);
        setDraft(d ?? null);
    }, [runId]);

    function showToast(title: string, tone: ToastTone = 'success', message?: string) {
        setToast({
            visible: true,
            title,
            message,
            tone,
        });
    }

    useEffect(() => {
        if (!user) return;

        const d = getActivity2RunDraft(runId);

        if (!d) {
            Alert.alert(
                'Session expired',
                'Your draft session was reset. Please start again.',
                [
                    {
                        text: 'OK',
                        onPress: () => navigation.replace('A2SessionSetup', {activityId}),
                    },
                ],
            );
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            refreshDraft();
        }, [refreshDraft, user]),
    );

    const computed = useMemo(() => draft?.computed ?? null, [draft]);

    const validCount = useMemo(
        () => draft?.actions.filter((a) => a.isValid).length ?? 0,
        [draft],
    );

    const sessionVideoUri = draft?.session?.sessionVideo?.uri;
    const hasSessionVideo =
        typeof sessionVideoUri === 'string' && sessionVideoUri.length > 0;

    const predicted = draft?.session?.predictedLoudestAction?.trim() || '—';
    const loudest = computed?.loudestActionLabel?.trim() || '—';
    const wasRight = computed?.wasPredictionCorrect;

    const smartReflectionSummary = useMemo(() => {
        const avgDbText =
            computed?.avgDb != null ? `${computed.avgDb.toFixed(1)} dB` : 'not calculated yet';

        const resultText = `Your average sound level was ${avgDbText}.`;

        const comparisonText =
            typeof wasRight === 'boolean'
                ? wasRight
                    ? `Your prediction matched the result: ${loudest} was the loudest action.`
                    : `Your prediction was ${predicted}, but the measured loudest action was ${loudest}.`
                : `Compare your predicted loudest action (${predicted}) with the actual loudest action (${loudest}).`;

        return `${resultText} ${comparisonText}`;
    }, [computed?.avgDb, loudest, predicted, wasRight]);

    function validate(): string | null {
        if (!draft) return 'Draft not loaded.';

        if (validCount < 3) {
            return 'You must have at least 3 valid measurements before submitting.';
        }

        if (reflectionQuality.isSubmissionBlocked) {
            return 'Please improve your reflection before submitting. It may be empty, too short, or contain inappropriate language.';
        }

        if (rating < 1 || rating > 5) {
            return 'Rating must be between 1 and 5.';
        }

        return null;
    }

    async function onAttachVideoPick() {
        try {
            setAttaching(true);

            const picked = await pickVideoFromLibrary();
            if (!picked) return;

            updateActivity2Session(runId, {
                sessionVideo: {
                    type: 'video',
                    uri: picked.uri,
                    createdAt: Date.now(),
                },
            });

            refreshDraft();

            showToast(
                'Session video attached',
                'success',
                'The video will be uploaded during submission.',
            );
        } catch (error: unknown) {
            Alert.alert('Attach failed', getErrorMessage(error));
        } finally {
            setAttaching(false);
        }
    }

    async function onAttachVideoRecord() {
        try {
            setAttaching(true);

            const recorded = await recordVideoWithCamera();
            if (!recorded) return;

            updateActivity2Session(runId, {
                sessionVideo: {
                    type: 'video',
                    uri: recorded.uri,
                    createdAt: Date.now(),
                },
            });

            refreshDraft();

            showToast(
                'Session video recorded',
                'success',
                'The video will be uploaded during submission.',
            );
        } catch (error: unknown) {
            Alert.alert('Attach failed', getErrorMessage(error));
        } finally {
            setAttaching(false);
        }
    }

    function onRemoveVideo() {
        Alert.alert(
            'Remove video?',
            'This will detach the session video evidence from this draft.',
            [
                {text: 'Cancel', style: 'cancel'},
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: () => {
                        updateActivity2Session(runId, {sessionVideo: undefined});
                        refreshDraft();

                        showToast(
                            'Session video removed',
                            'info',
                            'You can attach another video anytime.',
                        );
                    },
                },
            ],
        );
    }

    function onAttachVideoMenu() {
        const buttons: Array<{
            text: string;
            onPress?: () => void;
            style?: 'cancel' | 'destructive';
        }> = [
            {text: 'Pick from library', onPress: () => void onAttachVideoPick()},
            {text: 'Record with camera', onPress: () => void onAttachVideoRecord()},
        ];

        if (hasSessionVideo) {
            buttons.push({
                text: 'Remove attached video',
                style: 'destructive',
                onPress: onRemoveVideo,
            });
        }

        buttons.push({text: 'Cancel', style: 'cancel'});

        Alert.alert(
            'Session video evidence',
            'Optional evidence. Attach a short video if available.',
            buttons,
        );
    }

    async function onSubmit() {
        if (!user) return;
        if (!draft) return;

        const err = validate();

        if (err) {
            Alert.alert('Cannot submit', err);
            return;
        }

        try {
            setSubmitting(true);

            const userSnap = await getDoc(doc(db, 'users', user.uid));
            const teamId = userSnap.data()?.teamId;

            if (!teamId) {
                Alert.alert('Join a team', 'You must join a team before submitting.');
                return;
            }

            const submitArgs = {
                run: draft,
                teamId,
                createdBy: user.uid,
                reflection,
                rating,
            };

            const res = await submitActivity2(submitArgs);

            showToast(
                'Submission successful',
                'success',
                `Score: ${res.score}`,
            );

            setTimeout(() => {
                navigation.reset({
                    index: 1,
                    routes: [
                        {name: 'Home' as never},
                        {name: 'Leaderboard' as never},
                    ],
                });
            }, 1400);
        } catch (error: unknown) {
            try {
                const userSnap = await getDoc(doc(db, 'users', user.uid));
                const teamId = userSnap.data()?.teamId;

                if (!teamId) {
                    Alert.alert('Error', getErrorMessage(error));
                    return;
                }

                const submitArgs = {
                    run: draft,
                    teamId,
                    createdBy: user.uid,
                    reflection,
                    rating,
                };

                await queueFinalSubmission({
                    runId: draft.runId,
                    activityId: draft.activityId,
                    userId: user.uid,
                    teamId,
                    payload: {
                        activityNumber: 2,
                        args: submitArgs,
                    },
                });

                showToast(
                    'Submission saved offline',
                    'info',
                    'It will sync automatically when connection is available.',
                );

                setTimeout(() => {
                    navigation.reset({
                        index: 0,
                        routes: [{name: 'Home' as never}],
                    });
                }, 1600);
            } catch (queueError: unknown) {
                Alert.alert('Error', getErrorMessage(queueError));
            }
        } finally {
            setSubmitting(false);
        }
    }

    if (!user) return null;

    if (!draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading reflection draft..."/>
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 2" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    Reflection & Submit
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Confirm your sound results, write a meaningful reflection, optionally
                    attach evidence, then submit.
                </AppText>
            </View>

            <InfoBanner
                title="Final submission check"
                message="Make sure you have at least three valid measurements and a complete reflection before submitting."
                tone="info"
            />

            <AppSectionHeader
                title="Session Summary"
                subtitle="Review the key results before submitting."
            />

            <AppCard>
                <MetricRow
                    label="Valid measurements"
                    value={`${validCount} / 3 minimum`}
                />

                <MetricRow
                    label="Average dB score"
                    value={computed?.avgDb != null ? `${computed.avgDb.toFixed(1)} dB` : '—'}
                />

                <View style={styles.divider}/>

                <MetricRow label="Predicted loudest" value={predicted}/>
                <MetricRow label="Actual loudest" value={loudest}/>

                <MetricRow
                    label="Prediction correct?"
                    value={
                        typeof wasRight === 'boolean'
                            ? wasRight
                                ? 'Yes'
                                : 'No'
                            : '—'
                    }
                />

                <View style={styles.evidenceBox}>
                    <View style={styles.evidenceText}>
                        <AppText variant="bodyStrong">Session video evidence</AppText>

                        <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                            Optional, but useful for explaining the sound source and classroom
                            context.
                        </AppText>
                    </View>

                    <AppBadge
                        label={hasSessionVideo ? 'Attached' : 'Optional'}
                        tone={hasSessionVideo ? 'success' : 'info'}
                    />
                </View>

                <AppButton
                    title={hasSessionVideo ? 'Manage Session Video' : 'Attach Session Video'}
                    variant="outline"
                    onPress={onAttachVideoMenu}
                    disabled={attaching}
                    loading={attaching}
                    style={styles.videoButton}
                />

                {hasSessionVideo ? (
                    <AppText variant="caption" color="textMuted" style={styles.note}>
                        Keep evidence short. Upload happens on submit; attaching here stores
                        the local URI in the draft.
                    </AppText>
                ) : null}
            </AppCard>

            <AppSectionHeader
                title="Reflection"
                subtitle="Explain what happened and what you learned."
            />

            <AppCard>
                <View style={styles.smartBox}>
                    <AppText variant="bodyStrong" color="primary">
                        Smart reflection guide
                    </AppText>

                    <AppText variant="body" style={styles.smartText}>
                        {smartReflectionSummary}
                    </AppText>

                    <AppText variant="bodyStrong" style={styles.promptIntro}>
                        Try to include:
                    </AppText>

                    <AppText variant="caption" color="textMuted" style={styles.promptText}>
                        • Whether your loudest-action prediction matched the measurements.
                    </AppText>

                    <AppText variant="caption" color="textMuted" style={styles.promptText}>
                        • What may have affected sound level, such as distance, surface, or
                        background noise.
                    </AppText>

                    <AppText variant="caption" color="textMuted" style={styles.promptText}>
                        • Whether the measured sound level could be uncomfortable or unsafe
                        in a classroom.
                    </AppText>

                    <AppText variant="caption" color="textMuted" style={styles.promptText}>
                        • One way to improve measurement accuracy next time.
                    </AppText>
                </View>

                <AppInput
                    label="Outcome comment"
                    value={reflection}
                    onChangeText={setReflection}
                    placeholder="Example: My prediction was different from the result because the surface and distance affected the sound level..."
                    multiline
                    style={styles.reflectionInput}
                />

                <ReflectionQualityCard result={reflectionQuality}/>
            </AppCard>

            <AppSectionHeader
                title="Rating"
                subtitle="How did this activity feel overall?"
            />

            <AppCard>
                <View style={styles.ratingRow}>
                    {[1, 2, 3, 4, 5].map((n) => {
                        const on = rating === n;

                        return (
                            <Pressable
                                key={n}
                                onPress={() => setRating(clampInt(n, 1, 5))}
                                style={[styles.rateButton, on && styles.rateButtonOn]}
                            >
                                <AppText
                                    variant="bodyStrong"
                                    color={on ? 'inverseText' : 'text'}
                                    align="center"
                                >
                                    {n}
                                </AppText>
                            </Pressable>
                        );
                    })}
                </View>
            </AppCard>

            <AppButton
                title={submitting ? 'Submitting...' : 'Submit'}
                onPress={onSubmit}
                disabled={submitting}
                loading={submitting}
            />

            {submitting ? (
                <View style={styles.submittingHint}>
                    <ActivityIndicator color={colors.primary}/>
                    <AppText variant="caption" color="textMuted">
                        Preparing final submission...
                    </AppText>
                </View>
            ) : null}

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

            <View style={styles.bottomSpace}/>
        </AppGradientScreen>
    );
}

type MetricRowProps = {
    label: string;
    value: string;
};

function MetricRow({label, value}: MetricRowProps) {
    return (
        <View style={styles.metricRow}>
            <AppText variant="bodyStrong" style={styles.metricLabel}>
                {label}
            </AppText>

            <AppText variant="bodyStrong" align="right" style={styles.metricValue}>
                {value}
            </AppText>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        marginBottom: spacing.lg,
    },

    title: {
        marginTop: spacing.md,
    },

    subtitle: {
        marginTop: spacing.sm,
    },

    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingVertical: spacing.sm,
    },

    metricLabel: {
        flex: 1,
    },

    metricValue: {
        flex: 1,
    },

    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.divider,
        marginVertical: spacing.md,
    },

    evidenceBox: {
        marginTop: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    evidenceText: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    videoButton: {
        marginTop: spacing.md,
    },

    note: {
        marginTop: spacing.md,
    },

    smartBox: {
        borderWidth: 1,
        borderColor: colors.primarySoft,
        backgroundColor: colors.accentSoft,
        borderRadius: radius.lg,
        padding: spacing.md,
        marginBottom: spacing.lg,
    },

    smartText: {
        marginTop: spacing.sm,
    },

    promptIntro: {
        marginTop: spacing.md,
    },

    promptText: {
        marginTop: spacing.xs,
    },

    reflectionInput: {
        minHeight: 150,
        textAlignVertical: 'top',
    },

    ratingRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },

    rateButton: {
        flex: 1,
        minHeight: 48,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },

    rateButtonOn: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    submittingHint: {
        marginTop: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});