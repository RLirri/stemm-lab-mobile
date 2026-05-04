// src/screens/Activities/Activity5/A5ReflectionSubmitScreen.tsx

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {doc, getDoc} from 'firebase/firestore';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth, db} from '../../../services/firebase';
import {queueFinalSubmission} from '../../../services/offlineSubmissionQueueService';
import {
    clearActivity5RunDraft,
    getActivity5RunDraft,
    setActivity5Reflection,
    setActivity5SessionVideo,
    validateA5Submission,
    getA5BestImprovement,
    type Activity5RunDraft,
    type A5MovementType,
} from '../../../store/activity5RunDraftStore';
import {pickVideoFromLibrary, recordVideoWithCamera} from '../../../services/evidenceService';
import {submitActivity5} from '../../../services/activitySubmissionService';
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

type Props = NativeStackScreenProps<AppStackParamList, 'A5ReflectionSubmit'>;

const A5_LEADERBOARD_SCORE_SCALE = 100;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function scaleA5Score(raw: number) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
    return Math.max(0, Math.round(raw * A5_LEADERBOARD_SCORE_SCALE));
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function isFiniteNumber(x: unknown): x is number {
    return typeof x === 'number' && Number.isFinite(x);
}

function isNonEmptyString(x: unknown): x is string {
    return typeof x === 'string' && x.trim().length > 0;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return 'Submission failed.';
}

function getSessionVideoUri(run: Activity5RunDraft): string | null {
    const uri = run.evidence?.sessionVideo?.uri;
    return isNonEmptyString(uri) ? uri : null;
}

function hasSessionVideo(run: Activity5RunDraft) {
    return isNonEmptyString(getSessionVideoUri(run));
}

function hasGpsGranted(run: Activity5RunDraft) {
    return run.session.gpsEnabled === true && run.session.gpsPermission === 'granted';
}

function hasRealGeo(run: Activity5RunDraft) {
    const g = run.session.geo;
    return !!g && isFiniteNumber(g.lat) && isFiniteNumber(g.lng);
}

function formatGeoText(geo: Activity5RunDraft['session']['geo'] | undefined): string {
    if (!geo) return 'No coordinate saved yet';
    if (!isFiniteNumber(geo.lat) || !isFiniteNumber(geo.lng)) return 'No coordinate saved yet';

    const accText = isFiniteNumber(geo.accuracyM) ? ` (±${Math.round(geo.accuracyM)}m)` : '';
    const timeText = isFiniteNumber(geo.capturedAt)
        ? ` • ${new Date(geo.capturedAt).toLocaleString()}`
        : '';

    return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${accText}${timeText}`;
}

function hasPrediction(run: Activity5RunDraft) {
    return Boolean(run.prediction?.createdAt);
}

function hasAnyDataset(run: Activity5RunDraft) {
    return (run.trials ?? []).some(
        (trial) =>
            trial?.dataset &&
            Array.isArray(trial.dataset.samples) &&
            trial.dataset.samples.length > 0,
    );
}

function movementTitleForType(run: Activity5RunDraft, movementType?: A5MovementType) {
    if (!movementType) return '—';

    const movement = run.session.movements.find((item) => item.type === movementType);
    return movement?.title ?? movementType;
}

function stripVideoFromMissing(missing: string[]): string[] {
    return (missing ?? []).filter((item) => !String(item).toLowerCase().includes('video'));
}

export default function A5ReflectionSubmitScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity5RunDraft | null>(null);
    const [reflectionText, setReflectionText] = useState('');
    const [rating, setRating] = useState<number>(4);
    const [submitting, setSubmitting] = useState(false);
    const [attaching, setAttaching] = useState(false);

    const [toast, setToast] = useState<ToastState>({
        visible: false,
        title: '',
        message: undefined,
        tone: 'success',
    });

    function showToast(title: string, tone: ToastTone = 'success', message?: string) {
        setToast({
            visible: true,
            title,
            message,
            tone,
        });
    }

    const reflectionQuality = useMemo(
        () => checkReflectionQuality(reflectionText),
        [reflectionText],
    );

    const refreshDraft = useCallback(() => {
        const d = getActivity5RunDraft(runId);
        setDraft(d ?? null);

        if (d) {
            setReflectionText(d.reflection?.reflectionText ?? '');
            setRating(d.reflection?.rating ?? 4);
        }
    }, [runId]);

    useEffect(() => {
        if (!user) return;

        const d = getActivity5RunDraft(runId);

        if (!d) {
            Alert.alert(
                'Session expired',
                'Your draft session was reset. Please start again.',
                [
                    {
                        text: 'OK',
                        onPress: () => navigation.replace('A5SessionSetup', {activityId}),
                    },
                ],
            );
            return;
        }

        setDraft(d);
        setReflectionText(d.reflection?.reflectionText ?? '');
        setRating(d.reflection?.rating ?? 4);
    }, [activityId, navigation, runId, user]);

    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            refreshDraft();
        }, [refreshDraft, user]),
    );

    const viewModel = useMemo(() => {
        if (!draft) return null;

        const best = getA5BestImprovement(draft);
        const missingAll = validateA5Submission(draft);
        const missingNoVideo = stripVideoFromMissing(missingAll);
        const bestImprovementScaled = scaleA5Score(best.bestScore);

        return {
            bestImprovementScaled,
            bestParticipantId: best.participantId,
            bestMovementType: best.movementType,
            bestMovementTitle: movementTitleForType(draft, best.movementType),
            predictionOk: hasPrediction(draft),
            datasetOk: hasAnyDataset(draft),
            sessionVid: hasSessionVideo(draft),
            gpsGranted: hasGpsGranted(draft),
            geoCaptured: hasRealGeo(draft),
            geoText: formatGeoText(draft.session.geo),
            missingListNoVideo: missingNoVideo,
            gpsEnabled: draft.session.gpsEnabled === true,
        };
    }, [draft]);

    const bestParticipantName = useMemo(() => {
        if (!draft || !viewModel?.bestParticipantId) return '—';

        return (
            draft.session.participants.find(
                (participant) => participant.id === viewModel.bestParticipantId,
            )?.name ?? '—'
        );
    }, [draft, viewModel?.bestParticipantId]);

    const attachedName = useMemo(() => {
        if (!draft) return null;

        const uri = getSessionVideoUri(draft);
        if (!uri) return null;

        const last = uri.split('/').slice(-1)[0];
        return last || 'video';
    }, [draft]);

    const smartReflectionSummary = useMemo(() => {
        if (!draft || !viewModel) {
            return 'Explain how your movement changed between baseline and feedback mode.';
        }

        const participantName = viewModel.bestParticipantId
            ? draft.session.participants.find(
            (participant) => participant.id === viewModel.bestParticipantId,
        )?.name ?? 'the selected participant'
            : 'the selected participant';

        const scoreText = Number.isFinite(viewModel.bestImprovementScaled)
            ? `${viewModel.bestImprovementScaled}`
            : '—';

        return `${participantName} showed the strongest improvement in ${viewModel.bestMovementTitle}, with a leaderboard improvement score of ${scoreText}. Compare the baseline and feedback trials, then explain what helped the movement become smoother or more controlled.`;
    }, [draft, viewModel]);

    function validateLocal(): string | null {
        if (!draft) return 'Draft not found.';

        const missingNoVideo = stripVideoFromMissing(validateA5Submission(draft));

        if (missingNoVideo.length > 0) {
            return `Missing:\n• ${missingNoVideo.join('\n• ')}`;
        }

        if (reflectionQuality.isSubmissionBlocked) {
            return 'Please improve your reflection before submitting. It may be empty, too short, or contain inappropriate language.';
        }

        if (!isFiniteNumber(rating) || rating < 1 || rating > 5) {
            return 'Rating must be between 1 and 5.';
        }

        return null;
    }

    async function onAttachVideoPick() {
        try {
            setAttaching(true);

            const picked = await pickVideoFromLibrary();
            if (!picked) return;

            setActivity5SessionVideo(runId, {
                uri: picked.uri,
                createdAt: Date.now(),
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

            setActivity5SessionVideo(runId, {
                uri: recorded.uri,
                createdAt: Date.now(),
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
                        setActivity5SessionVideo(runId, undefined);
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
        const hasVid = !!draft && hasSessionVideo(draft);

        const buttons: Array<{
            text: string;
            onPress?: () => void;
            style?: 'cancel' | 'destructive';
        }> = [
            {text: 'Close', style: 'cancel'},
            {text: 'Pick from library', onPress: () => void onAttachVideoPick()},
            {text: 'Record with camera', onPress: () => void onAttachVideoRecord()},
        ];

        if (hasVid) {
            buttons.push({
                text: 'Remove attached video',
                style: 'destructive',
                onPress: onRemoveVideo,
            });
        }

        Alert.alert(
            'Session video evidence',
            'Optional evidence. Attach a short video if available.',
            buttons,
        );
    }

    async function onSubmit() {
        if (!user || !draft) return;

        const updated = setActivity5Reflection(runId, {
            reflectionText: reflectionText.trim(),
            rating: clampInt(rating, 1, 5),
        });

        setDraft(updated);

        const err = validateLocal();

        if (err) {
            const low = err.toLowerCase();

            Alert.alert('Cannot submit', err, [
                low.includes('gps') || low.includes('coordinate')
                    ? {
                        text: 'Capture Location',
                        onPress: () => navigation.navigate('A5SessionSetup', {activityId, runId}),
                    }
                    : low.includes('prediction')
                        ? {
                            text: 'Go to Prediction',
                            onPress: () => navigation.navigate('A5Prediction', {activityId, runId}),
                        }
                        : low.includes('trial') ||
                        low.includes('dataset') ||
                        low.includes('baseline') ||
                        low.includes('feedback')
                            ? {
                                text: 'Go to Trials',
                                onPress: () =>
                                    navigation.navigate('A5GuidedTrials', {activityId, runId}),
                            }
                            : {text: 'OK'},
            ]);

            return;
        }

        try {
            setSubmitting(true);

            const userSnap = await getDoc(doc(db, 'users', user.uid));
            const teamId = userSnap.data()?.teamId;

            if (!isNonEmptyString(teamId)) {
                Alert.alert('Join a team', 'You must join a team before submitting.');
                return;
            }

            const best = getA5BestImprovement(updated);
            const bestImprovementScore = scaleA5Score(best.bestScore);

            const res = await submitActivity5({
                run: updated,
                teamId,
                createdBy: user.uid,
                reflection: updated.reflection?.reflectionText ?? reflectionText.trim(),
                rating: updated.reflection?.rating ?? rating,
                bestImprovementScore,
                bestParticipantId: best.participantId,
                bestMovementType: best.movementType,
            });

            clearActivity5RunDraft(runId);

            const returnedScore =
                'score' in res && typeof res.score === 'number' && Number.isFinite(res.score)
                    ? res.score
                    : bestImprovementScore;

            showToast(
                'Submission successful',
                'success',
                `Best improvement: ${returnedScore}`,
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

                if (!isNonEmptyString(teamId)) {
                    Alert.alert('Error', getErrorMessage(error));
                    return;
                }

                const best = getA5BestImprovement(updated);
                const bestImprovementScore = scaleA5Score(best.bestScore);

                const submitArgs = {
                    run: updated,
                    teamId,
                    createdBy: user.uid,
                    reflection: updated.reflection?.reflectionText ?? reflectionText.trim(),
                    rating: updated.reflection?.rating ?? rating,
                    bestImprovementScore,
                    bestParticipantId: best.participantId,
                    bestMovementType: best.movementType,
                };

                await queueFinalSubmission({
                    runId: updated.runId,
                    activityId: 'activity05_humanPerformance',
                    userId: user.uid,
                    teamId,
                    payload: {
                        activityNumber: 5,
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

    if (!draft || !viewModel) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading reflection draft..."/>
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
                    <AppBadge label="Activity 5" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Reflection & Submit
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Review best improvement, confirm evidence, write a reflection, and
                        submit.
                    </AppText>
                </View>

                <InfoBanner
                    title="Final submission check"
                    message={`Leaderboard score uses best improvement scaled ×${A5_LEADERBOARD_SCORE_SCALE}.`}
                    tone="info"
                />

                <View style={styles.heroCard}>
                    <AppText variant="bodyStrong" color="inverseText">
                        Best Improvement
                    </AppText>

                    <AppText variant="title" color="inverseText" style={styles.heroScore}>
                        {Number.isFinite(viewModel.bestImprovementScaled)
                            ? String(viewModel.bestImprovementScaled)
                            : '—'}
                    </AppText>

                    <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                        {bestParticipantName} • {viewModel.bestMovementTitle}
                    </AppText>
                </View>

                <AppSectionHeader
                    title="Submission Checklist"
                    subtitle="Required items are checked before submission."
                />

                <AppCard>
                    <View style={styles.checkList}>
                        <ChecklistRow label="Prediction completed" ok={viewModel.predictionOk} required/>
                        <ChecklistRow label="Recorded sensor dataset" ok={viewModel.datasetOk} required/>

                        <ChecklistRow
                            label="Session video"
                            ok={viewModel.sessionVid}
                            meta={viewModel.sessionVid ? 'Attached' : 'Optional'}
                        />

                        {viewModel.gpsEnabled ? (
                            <>
                                <ChecklistRow
                                    label="GPS enabled and granted"
                                    ok={viewModel.gpsGranted}
                                    meta={viewModel.gpsGranted ? 'Granted' : 'Not granted'}
                                    required
                                />

                                <ChecklistRow
                                    label="GPS coordinate captured"
                                    ok={viewModel.geoCaptured}
                                    meta={viewModel.geoCaptured ? 'Captured' : 'Not captured yet'}
                                    required
                                />
                            </>
                        ) : (
                            <ChecklistRow
                                label="GPS disabled for this session"
                                ok
                                meta="Not required"
                            />
                        )}

                        <ChecklistRow
                            label="Reflection quality"
                            ok={!reflectionQuality.isSubmissionBlocked}
                            meta={`${reflectionQuality.wordCount} words • ${reflectionQuality.status.replace('_', ' ')}`}
                            required
                        />
                    </View>

                    {viewModel.missingListNoVideo.length > 0 ? (
                        <InfoBanner
                            title="Missing required items"
                            message={viewModel.missingListNoVideo.join(' • ')}
                            tone="warning"
                        />
                    ) : (
                        <InfoBanner
                            title="Required items present"
                            message="All required non-video checks are currently satisfied."
                            tone="success"
                        />
                    )}

                    {viewModel.gpsEnabled ? (
                        <View style={styles.coordinateBox}>
                            <View style={styles.coordinateText}>
                                <AppText variant="bodyStrong">Saved coordinate</AppText>

                                <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                    {viewModel.geoText}
                                </AppText>
                            </View>

                            <AppBadge
                                label={viewModel.geoCaptured ? 'Available' : 'Missing'}
                                tone={viewModel.geoCaptured ? 'success' : 'warning'}
                            />
                        </View>
                    ) : null}

                    {viewModel.gpsEnabled && viewModel.gpsGranted && !viewModel.geoCaptured ? (
                        <AppButton
                            title="Capture Location"
                            variant="outline"
                            onPress={() => navigation.navigate('A5SessionSetup', {activityId, runId})}
                            style={styles.checkAction}
                        />
                    ) : null}

                    <AppButton
                        title={viewModel.sessionVid ? 'Manage Session Video' : 'Attach Session Video'}
                        variant="outline"
                        onPress={onAttachVideoMenu}
                        disabled={attaching}
                        loading={attaching}
                        style={styles.checkAction}
                    />

                    {attachedName ? (
                        <AppText variant="caption" color="textMuted" style={styles.note}>
                            Attached: {attachedName}
                        </AppText>
                    ) : null}
                </AppCard>

                <AppSectionHeader
                    title="Reflection"
                    subtitle="Explain what happened and what improved."
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
                            • Which movement was hardest to keep smooth or controlled.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • Whether your prediction matched the baseline and feedback results.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • What changed between baseline mode and feedback mode.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • One way to improve the test or participant performance next time.
                        </AppText>
                    </View>

                    <AppInput
                        label="Your reflection"
                        value={reflectionText}
                        onChangeText={setReflectionText}
                        placeholder="Example: The feedback trial improved smoothness because the participant adjusted their movement speed..."
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
        </KeyboardAvoidingView>
    );
}

type ChecklistRowProps = {
    label: string;
    ok: boolean;
    meta?: string;
    required?: boolean;
};

function ChecklistRow({label, ok, meta, required = false}: ChecklistRowProps) {
    return (
        <View style={styles.checkRow}>
            <View style={styles.checkText}>
                <AppText variant="bodyStrong">
                    {label}
                    {required ? ' required' : ''}
                </AppText>

                {meta ? (
                    <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                        {meta}
                    </AppText>
                ) : null}
            </View>

            <AppBadge label={ok ? 'OK' : 'Missing'} tone={ok ? 'success' : 'warning'}/>
        </View>
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

    heroCard: {
        borderRadius: radius.xl,
        backgroundColor: colors.primaryDark,
        padding: spacing.xl,
        marginBottom: spacing.lg,
    },

    heroScore: {
        marginTop: spacing.md,
    },

    heroHint: {
        marginTop: spacing.md,
        opacity: 0.75,
    },

    checkList: {
        gap: spacing.md,
        marginBottom: spacing.md,
    },

    checkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    checkText: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    coordinateBox: {
        marginTop: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    coordinateText: {
        flex: 1,
    },

    checkAction: {
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