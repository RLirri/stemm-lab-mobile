// src/screens/Activities/Activity1/A1ReflectionSubmitScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {doc, getDoc} from 'firebase/firestore';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth, db} from '../../../services/firebase';
import {type ActivityRunDraft, getRunDraft} from '../../../store/activityRunDraftStore';
import {submitActivity1} from '../../../services/activitySubmissionService';
import {queueFinalSubmission} from '../../../services/offlineSubmissionQueueService';
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

type Props = NativeStackScreenProps<AppStackParamList, 'A1ReflectionSubmit'>;

function attemptLabel(index: number) {
    return index === 0 ? 'Baseline' : `Prototype ${index}`;
}

function hasAttemptData(run: ActivityRunDraft, i: number) {
    const a = run.attempts?.[i];
    return Boolean(a?.measurements?.tHitSec && (a.measurements.tHitSec ?? 0) > 0);
}

function hasAttemptVideo(run: ActivityRunDraft, i: number) {
    const uri = run.attempts?.[i]?.video?.uri;
    return typeof uri === 'string' && uri.length > 0;
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'Submission failed.';
}

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: 'success' | 'info' | 'warning' | 'danger';
};

export default function A1ReflectionSubmitScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);
    const [bestIndex, setBestIndex] = useState<number | null>(null);
    const [reflection, setReflection] = useState<string>('');
    const [rating, setRating] = useState<number>(4);
    const [submitting, setSubmitting] = useState(false);

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

    useEffect(() => {
        if (!user) return;

        const d = getRunDraft(runId);

        if (!d) {
            Alert.alert(
                'Session expired',
                'Your draft session was reset. Please start again.',
                [
                    {
                        text: 'OK',
                        onPress: () => navigation.replace('A1SessionSetup', {activityId}),
                    },
                ],
            );
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const completedWithin20 = useMemo(() => {
        if (!draft) return null;
        const s = draft.session;
        if (!s.startedAt || !s.endsAt) return null;
        return Date.now() <= s.endsAt;
    }, [draft]);

    const options = useMemo(() => {
        if (!draft) return [];

        return [0, 1, 2, 3].map((i) => {
            const a = draft.attempts?.[i];
            const enabled = hasAttemptData(draft, i);
            const hasVid = hasAttemptVideo(draft, i);

            const tHit = a?.measurements?.tHitSec;
            const inZone = a?.measurements?.inTargetZone;

            const metaParts: string[] = [];

            if (typeof tHit === 'number') metaParts.push(`t_hit ${tHit.toFixed(2)}s`);
            if (typeof inZone === 'boolean') metaParts.push(inZone ? 'in-zone' : 'out-of-zone');
            metaParts.push(hasVid ? 'video attached' : 'video missing');

            return {
                index: i,
                label: `${attemptLabel(i)}${i === 0 ? ' (No parachute)' : ''}`,
                enabled,
                meta: metaParts.length ? metaParts.join(' • ') : enabled ? 'Completed' : 'Not completed',
                hasVid,
            };
        });
    }, [draft]);

    const selectedAttemptSummary = useMemo(() => {
        if (!draft || bestIndex == null) {
            return 'Select your best attempt first, then explain why that design performed better.';
        }

        const attempt = draft.attempts?.[bestIndex];
        const tHit = attempt?.measurements?.tHitSec;
        const inZone = attempt?.measurements?.inTargetZone;

        const resultText =
            typeof tHit === 'number'
                ? `${attemptLabel(bestIndex)} recorded a t_hit of ${tHit.toFixed(2)} seconds`
                : `${attemptLabel(bestIndex)} was selected`;

        const zoneText =
            typeof inZone === 'boolean'
                ? inZone
                    ? 'and it was inside the target zone.'
                    : 'but it was outside the target zone.'
                : '.';

        return `${resultText} ${zoneText}`;
    }, [bestIndex, draft]);

    function showToast(
        title: string,
        tone: ToastState['tone'] = 'success',
        message?: string,
    ) {
        setToast({
            visible: true,
            title,
            message,
            tone,
        });
    }

    function validate(): string | null {
        if (!draft) return 'Draft not loaded.';

        const anyAttempt = [0, 1, 2, 3].some((i) => hasAttemptData(draft, i));
        if (!anyAttempt) return 'No attempts found. Please complete at least the baseline attempt.';

        if (bestIndex == null) return 'Please select the best design.';
        if (!hasAttemptData(draft, bestIndex)) return 'Selected best design has no recorded t_hit.';

        if (!hasAttemptVideo(draft, bestIndex)) {
            return 'Best attempt must have a video attached. Go back to Measurements and attach a video.';
        }

        if (reflectionQuality.isSubmissionBlocked) {
            return 'Please improve your reflection before submitting. It may be empty, too short, or contain inappropriate language.';
        }

        if (rating < 1 || rating > 5) return 'Rating must be between 1 and 5.';

        return null;
    }

    async function onSubmit() {
        if (!user) return;
        if (!draft) return;
        if (bestIndex == null) return;

        const err = validate();

        if (err) {
            Alert.alert('Cannot submit', err, [
                err.includes('video attached')
                    ? {
                        text: 'Go attach video',
                        onPress: () =>
                            navigation.navigate('A1Measurements', {
                                activityId,
                                runId,
                                attemptIndex: bestIndex,
                            }),
                    }
                    : {text: 'OK'},
            ]);
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

            const res = await submitActivity1({
                run: draft,
                teamId,
                createdBy: user.uid,
                bestAttemptIndex: bestIndex,
                reflection,
                rating,
            });

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

                await queueFinalSubmission({
                    runId: draft.runId,
                    activityId: draft.activityId,
                    userId: user.uid,
                    teamId,
                    payload: {
                        activityNumber: 1,
                        args: {
                            run: draft,
                            teamId,
                            createdBy: user.uid,
                            bestAttemptIndex: bestIndex,
                            reflection,
                            rating,
                        },
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
                <AppBadge label="Activity 1" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    Reflection & Submit
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Choose your best attempt, confirm evidence, write a meaningful reflection,
                    and submit your work.
                </AppText>
            </View>

            <InfoBanner
                title="Final submission check"
                message="Your best attempt must include recorded measurements and attached video evidence before submission."
                tone="info"
            />

            <AppSectionHeader
                title="Select Best Design"
                subtitle="Attempts require t_hit. The selected best attempt must also have video evidence."
            />

            <AppCard>
                <View style={styles.choiceList}>
                    {options.map((o) => {
                        const selected = bestIndex === o.index;
                        const disabled = !o.enabled;

                        return (
                            <Pressable
                                key={o.index}
                                onPress={() => {
                                    if (!disabled) setBestIndex(o.index);
                                }}
                                disabled={disabled}
                                style={[
                                    styles.choiceCard,
                                    selected && styles.choiceCardOn,
                                    disabled && styles.choiceCardDisabled,
                                ]}
                            >
                                <View style={styles.choiceTop}>
                                    <AppText
                                        variant="bodyStrong"
                                        color={selected ? 'inverseText' : 'text'}
                                        style={styles.choiceTitle}
                                    >
                                        {o.label}
                                    </AppText>

                                    <AppBadge
                                        label={o.hasVid ? 'Video' : 'No video'}
                                        tone={o.hasVid ? 'success' : 'warning'}
                                    />
                                </View>

                                <AppText
                                    variant="caption"
                                    color={selected ? 'inverseText' : 'textMuted'}
                                    style={styles.choiceMeta}
                                >
                                    {o.meta}
                                </AppText>
                            </Pressable>
                        );
                    })}
                </View>

                {completedWithin20 != null ? (
                    <View style={styles.timerBox}>
                        <AppText variant="bodyStrong">Completed within 20 minutes?</AppText>

                        <AppBadge
                            label={completedWithin20 ? 'Yes' : 'No'}
                            tone={completedWithin20 ? 'success' : 'warning'}
                        />
                    </View>
                ) : (
                    <AppText variant="caption" color="textMuted" style={styles.note}>
                        Timer was not started, so “within 20 minutes” is not recorded.
                    </AppText>
                )}
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
                        {selectedAttemptSummary}
                    </AppText>

                    <AppText variant="bodyStrong" style={styles.promptIntro}>
                        Try to include:
                    </AppText>

                    <AppText variant="caption" color="textMuted" style={styles.promptText}>
                        • Which parachute design worked best and why.
                    </AppText>
                    <AppText variant="caption" color="textMuted" style={styles.promptText}>
                        • Whether your prediction matched the result.
                    </AppText>
                    <AppText variant="caption" color="textMuted" style={styles.promptText}>
                        • What the t_hit result suggests about air resistance.
                    </AppText>
                    <AppText variant="caption" color="textMuted" style={styles.promptText}>
                        • One improvement you would test next.
                    </AppText>
                </View>

                <AppInput
                    label="Outcome comment"
                    value={reflection}
                    onChangeText={setReflection}
                    placeholder="Example: Prototype 2 worked best because it stayed in the air longer. My prediction was partly correct because..."
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

    choiceList: {
        gap: spacing.md,
    },

    choiceCard: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.md,
    },

    choiceCardOn: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    choiceCardDisabled: {
        opacity: 0.45,
    },

    choiceTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: spacing.md,
    },

    choiceTitle: {
        flex: 1,
    },

    choiceMeta: {
        marginTop: spacing.sm,
    },

    timerBox: {
        marginTop: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.md,
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
        minHeight: 140,
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