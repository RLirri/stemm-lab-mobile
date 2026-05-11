// src/screens/Activities/Activity6/A6ReflectionSubmitScreen.tsx

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View,} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {doc, getDoc} from 'firebase/firestore';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth, db} from '../../../services/firebase';
import {queueFinalSubmission} from '../../../services/offlineSubmissionQueueService';
import {
    type Activity6RunDraft,
    clearActivity6RunDraft,
    getA6LeaderboardMetrics,
    getActivity6RunDraft,
    isA6LeaderboardEligible,
    setActivity6Reflection,
    setActivity6SessionVideo,
    validateA6Submission,
} from '../../../store/activity6RunDraftStore';
import {pickVideoFromLibrary, recordVideoWithCamera} from '../../../services/evidenceService';
import {submitActivity6} from '../../../services/activitySubmissionService';
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

type Props = NativeStackScreenProps<AppStackParamList, 'A6ReflectionSubmit'>;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function now() {
    return Date.now();
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

function getNumberProperty(value: unknown, key: string): number | undefined {
    if (typeof value !== 'object' || value === null) return undefined;

    const record = value as Record<string, unknown>;
    const rawValue = record[key];

    return isFiniteNumber(rawValue) ? rawValue : undefined;
}

function getSessionVideoUri(run: Activity6RunDraft): string | null {
    const uri = run.evidence?.sessionVideo?.uri;
    return isNonEmptyString(uri) ? uri : null;
}

function hasSessionVideo(run: Activity6RunDraft) {
    return isNonEmptyString(getSessionVideoUri(run));
}

function hasGpsGranted(run: Activity6RunDraft) {
    return run.session.gpsEnabled === true && run.session.gpsPermission === 'granted';
}

function hasRealGeo(run: Activity6RunDraft) {
    const g = run.session.geo;
    return !!g && isFiniteNumber(g.lat) && isFiniteNumber(g.lng);
}

function formatGeoText(geo: Activity6RunDraft['session']['geo'] | undefined): string {
    if (!geo) return 'No coordinate saved yet';
    if (!isFiniteNumber(geo.lat) || !isFiniteNumber(geo.lng)) return 'No coordinate saved yet';

    const accText = isFiniteNumber(geo.accuracyM) ? ` (±${Math.round(geo.accuracyM)}m)` : '';
    const timeText = isFiniteNumber(geo.capturedAt)
        ? ` • ${new Date(geo.capturedAt).toLocaleString()}`
        : '';

    return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${accText}${timeText}`;
}

function stripVideoFromMissing(missing: string[]): string[] {
    return (missing ?? []).filter((m) => !String(m).toLowerCase().includes('video'));
}

function fmtMs(v?: number) {
    if (!isFiniteNumber(v)) return '—';
    return `${Math.round(v)} ms`;
}

function fmtPct(v?: number) {
    if (!isFiniteNumber(v)) return '—';
    return `${Math.round(v)}%`;
}

export default function A6ReflectionSubmitScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity6RunDraft | null>(null);
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
        const d = getActivity6RunDraft(runId);
        setDraft(d ?? null);

        if (d) {
            setReflectionText(d.reflection?.reflectionText ?? '');
            setRating(d.reflection?.rating ?? 4);
        }
    }, [runId]);

    useEffect(() => {
        if (!user) return;

        const d = getActivity6RunDraft(runId);

        if (!d) {
            Alert.alert(
                'Session expired',
                'Your draft session was reset. Please start again.',
                [
                    {
                        text: 'OK',
                        onPress: () => navigation.replace('A6SessionSetup', {activityId}),
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

        const missingAll = validateA6Submission(draft);
        const missingNoVideo = stripVideoFromMissing(missingAll);
        const leaderboard = getA6LeaderboardMetrics(draft);
        const eligible = isA6LeaderboardEligible(draft);
        const accThreshold = clampInt(draft.session.accuracyThresholdPct ?? 70, 0, 100);

        const hasAnyReaction = (draft.reactionTrials ?? []).some((t) =>
            isFiniteNumber(t?.reactionTimeMs),
        );

        const hasAnyTrace = (draft.tracingResults ?? []).some((r) =>
            isFiniteNumber(r?.accuracyScorePct),
        );

        const latestTracingOverall = [...(draft.tracingResults ?? [])].sort(
            (a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0),
        )[0];

        return {
            teamMeanReactionTimeMs: leaderboard?.teamMeanReactionTimeMs,
            avgTracingAccuracyPct: leaderboard?.avgTracingAccuracyPct,
            minTracingAccuracyPct: leaderboard?.minTracingAccuracyPct,

            latestAvgDeviationPx: latestTracingOverall?.avgDeviationPx,
            latestAccPct: latestTracingOverall?.accuracyScorePct,

            eligible,
            accThreshold,

            reactionOk: hasAnyReaction,
            tracingOk: hasAnyTrace,

            sessionVid: hasSessionVideo(draft),

            gpsEnabled: draft.session.gpsEnabled === true,
            gpsGranted: hasGpsGranted(draft),
            geoCaptured: hasRealGeo(draft),
            geoText: formatGeoText(draft.session.geo),

            missingListNoVideo: missingNoVideo,
        };
    }, [draft]);

    const smartReflectionSummary = useMemo(() => {
        if (!viewModel) {
            return 'Explain how your reaction time and tracing accuracy changed during the activity.';
        }

        return `Your team mean reaction time was ${fmtMs(
            viewModel.teamMeanReactionTimeMs,
        )}, and your average tracing accuracy was ${fmtPct(
            viewModel.avgTracingAccuracyPct,
        )}. Compare your reaction performance with tracing control, then explain what affected speed, accuracy, and consistency.`;
    }, [viewModel]);

    const attachedName = useMemo(() => {
        if (!draft) return null;

        const uri = getSessionVideoUri(draft);
        if (!uri) return null;

        const last = uri.split('/').slice(-1)[0];
        return last || 'video';
    }, [draft]);

    function validateLocal(targetDraft: Activity6RunDraft): string | null {
        const missingNoVideo = stripVideoFromMissing(validateA6Submission(targetDraft));

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

            setActivity6SessionVideo(runId, {
                uri: picked.uri,
                createdAt: now(),
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

            setActivity6SessionVideo(runId, {
                uri: recorded.uri,
                createdAt: now(),
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
                        setActivity6SessionVideo(runId, undefined);
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

        buttons.push({text: 'Cancel', style: 'cancel'});

        Alert.alert(
            'Session video evidence',
            'Optional evidence. Attach a short video if available.',
            buttons,
        );
    }

    async function onSubmit() {
        if (!user || !draft) return;

        const updated = setActivity6Reflection(runId, {
            reflectionText: reflectionText.trim(),
            rating: clampInt(rating, 1, 5),
        });

        setDraft(updated);

        const err = validateLocal(updated);

        if (err) {
            const low = err.toLowerCase();

            Alert.alert('Cannot submit', err, [
                low.includes('gps') || low.includes('coordinate')
                    ? {
                        text: 'Capture Location',
                        onPress: () =>
                            navigation.navigate('A6SessionSetup', {activityId, runId}),
                    }
                    : low.includes('prediction')
                        ? {
                            text: 'Go to Prediction',
                            onPress: () =>
                                navigation.navigate('A6Prediction', {activityId, runId}),
                        }
                        : low.includes('reaction')
                            ? {
                                text: 'Go to Reaction',
                                onPress: () =>
                                    navigation.navigate('A6ReactionTrial', {activityId, runId}),
                            }
                            : low.includes('tracing')
                                ? {
                                    text: 'Go to Tracing',
                                    onPress: () =>
                                        navigation.navigate('A6TracingChallenge', {
                                            activityId,
                                            runId,
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

            if (!isNonEmptyString(teamId)) {
                Alert.alert('Join a team', 'You must join a team before submitting.');
                return;
            }

            const submitArgs = {
                run: updated,
                teamId,
                createdBy: user.uid,
                reflection: updated.reflection?.reflectionText ?? reflectionText.trim(),
                rating: updated.reflection?.rating ?? rating,
                accuracyThreshold: updated.session.accuracyThresholdPct ?? 70,
            };

            const res = await submitActivity6(submitArgs);

            clearActivity6RunDraft(runId);

            const meanTxt = fmtMs(getNumberProperty(res, 'meanReactionTimeMs'));
            const accTxt = fmtPct(getNumberProperty(res, 'avgAccuracyPct'));

            showToast(
                'Submission successful',
                'success',
                `Team mean reaction time: ${meanTxt} • Avg accuracy: ${accTxt}`,
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

                const submitArgs = {
                    run: updated,
                    teamId,
                    createdBy: user.uid,
                    reflection: updated.reflection?.reflectionText ?? reflectionText.trim(),
                    rating: updated.reflection?.rating ?? rating,
                    accuracyThreshold: updated.session.accuracyThresholdPct ?? 70,
                };

                await queueFinalSubmission({
                    runId: updated.runId,
                    activityId: 'activity06_reactionBoard',
                    userId: user.uid,
                    teamId,
                    payload: {
                        activityNumber: 6,
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
                    <AppBadge label="Activity 6" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Reflection & Submit
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Review reaction speed, tracing accuracy, evidence, reflection
                        quality, and final submission readiness.
                    </AppText>
                </View>

                <InfoBanner
                    title="Final submission check"
                    message="Activity 6 requires reaction trials, tracing results, reflection quality, rating, and GPS if enabled. Video evidence is optional."
                    tone="info"
                />

                <View style={styles.heroCard}>
                    <AppText variant="bodyStrong" color="inverseText">
                        Team Mean Reaction Time
                    </AppText>

                    <AppText variant="title" color="inverseText" style={styles.heroScore}>
                        {fmtMs(viewModel.teamMeanReactionTimeMs)}
                    </AppText>

                    <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                        Average tracing accuracy: {fmtPct(viewModel.avgTracingAccuracyPct)}
                    </AppText>
                </View>

                <AppSectionHeader
                    title="Performance Summary"
                    subtitle="Final activity metrics before submission."
                />

                <AppCard>
                    <View style={styles.checkList}>
                        <ChecklistRow label="Reaction trials recorded" ok={viewModel.reactionOk}/>

                        <ChecklistRow
                            label={`Tracing accuracy threshold ≥ ${viewModel.accThreshold}%`}
                            ok={viewModel.eligible}
                            meta={`Avg: ${fmtPct(viewModel.avgTracingAccuracyPct)} • Min: ${fmtPct(
                                viewModel.minTracingAccuracyPct,
                            )}`}
                        />

                        <ChecklistRow
                            label="Latest tracing snapshot"
                            ok={viewModel.tracingOk}
                            meta={`Latest: ${fmtPct(viewModel.latestAccPct)} • Avg deviation: ${
                                isFiniteNumber(viewModel.latestAvgDeviationPx)
                                    ? `${Math.round(viewModel.latestAvgDeviationPx)} px`
                                    : '—'
                            }`}
                        />
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Submission Checklist"
                    subtitle="Required items are checked before submission."
                />

                <AppCard>
                    <View style={styles.checkList}>
                        <ChecklistRow label="Reaction dataset recorded" ok={viewModel.reactionOk} required/>
                        <ChecklistRow label="Tracing result recorded" ok={viewModel.tracingOk} required/>

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
                            meta={`${reflectionQuality.wordCount} words • ${reflectionQuality.status.replace(
                                '_',
                                ' ',
                            )}`}
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
                            onPress={() =>
                                navigation.navigate('A6SessionSetup', {activityId, runId})
                            }
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
                            • Whether your reaction-time prediction matched the result.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • How dominant and non-dominant hand performance differed.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • What affected tracing accuracy, such as speed, control, or focus.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • One way to improve fairness or accuracy if repeating the test.
                        </AppText>
                    </View>

                    <AppInput
                        label="Your reflection"
                        value={reflectionText}
                        onChangeText={setReflectionText}
                        placeholder="Example: My dominant hand reacted faster, but tracing accuracy dropped when I moved too quickly..."
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