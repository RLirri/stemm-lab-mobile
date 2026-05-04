// src/screens/Activities/Activity4/A4ReflectionSubmitScreen.tsx

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {doc, getDoc} from 'firebase/firestore';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth, db} from '../../../services/firebase';
import {queueFinalSubmission} from '../../../services/offlineSubmissionQueueService';
import {
    clearActivity4RunDraft,
    getActivity4RunDraft,
    setActivity4Reflection,
    setActivity4SessionVideo,
    type Activity4RunDraft,
} from '../../../store/activity4RunDraftStore';
import {pickVideoFromLibrary, recordVideoWithCamera} from '../../../services/evidenceService';
import {submitActivity4} from '../../../services/activitySubmissionService';
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

type Props = NativeStackScreenProps<AppStackParamList, 'A4ReflectionSubmit'>;

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

function getSessionVideoUri(run: Activity4RunDraft): string | null {
    const uri = run.evidence?.sessionVideo?.uri;
    return isNonEmptyString(uri) ? uri : null;
}

function hasSessionVideo(run: Activity4RunDraft) {
    return isNonEmptyString(getSessionVideoUri(run));
}

function hasGpsGranted(run: Activity4RunDraft) {
    return run.session.gpsEnabled === true && run.session.gpsPermission === 'granted';
}

function hasRealGeo(run: Activity4RunDraft) {
    const g = run.session.geo;
    return !!g && isFiniteNumber(g.lat) && isFiniteNumber(g.lng);
}

function formatGeoText(geo: Activity4RunDraft['session']['geo'] | undefined): string {
    if (!geo) return 'No coordinate saved yet';
    if (!isFiniteNumber(geo.lat) || !isFiniteNumber(geo.lng)) return 'No coordinate saved yet';

    const accText = isFiniteNumber(geo.accuracyM) ? ` (±${Math.round(geo.accuracyM)}m)` : '';
    const timeText = isFiniteNumber(geo.capturedAt)
        ? ` • ${new Date(geo.capturedAt).toLocaleString()}`
        : '';

    return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${accText}${timeText}`;
}

function hasPrediction(run: Activity4RunDraft) {
    return Boolean(run.prediction?.createdAt);
}

function measurementScore(m: Activity4RunDraft['measurements'][number]): number | null {
    if (isFiniteNumber(m.finalScore)) return m.finalScore;
    if (isFiniteNumber(m.movementScore)) return m.movementScore;
    return null;
}

function bestMovementScore(run: Activity4RunDraft): number | null {
    const scores = run.measurements
        .map((m) => measurementScore(m))
        .filter((x): x is number => isFiniteNumber(x));

    if (scores.length === 0) return null;
    return Math.min(...scores);
}

function validMeasurementCount(run: Activity4RunDraft): number {
    return run.measurements.filter((m) => measurementScore(m) != null).length;
}

function distinctMeasuredDesignCount(run: Activity4RunDraft): number {
    const designs = new Set<number>();

    for (const measurement of run.measurements) {
        const score = measurementScore(measurement);

        if (score != null && Number.isFinite(score)) {
            designs.add(measurement.designIndex);
        }
    }

    return designs.size;
}

function bestMeasuredDesignName(run: Activity4RunDraft): string | null {
    const validMeasurements = run.measurements.filter((m) => measurementScore(m) != null);

    if (validMeasurements.length === 0) return null;

    const best = validMeasurements.reduce((currentBest, current) => {
        const bestScore = measurementScore(currentBest) ?? Number.POSITIVE_INFINITY;
        const currentScore = measurementScore(current) ?? Number.POSITIVE_INFINITY;

        return currentScore < bestScore ? current : currentBest;
    }, validMeasurements[0]);

    const designName = run.session.designs?.[best.designIndex]?.name;
    return designName ?? `Design ${best.designIndex + 1}`;
}

export default function A4ReflectionSubmitScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);
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
        const d = getActivity4RunDraft(runId);
        setDraft(d ?? null);

        if (d) {
            setReflectionText(d.reflection?.reflectionText ?? '');
            setRating(d.reflection?.rating ?? 4);
        }
    }, [runId]);

    useEffect(() => {
        if (!user) return;

        const d = getActivity4RunDraft(runId);

        if (!d) {
            Alert.alert(
                'Session expired',
                'Your draft session was reset. Please start again.',
                [
                    {
                        text: 'OK',
                        onPress: () => navigation.replace('A4SessionSetup', {activityId}),
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

        return {
            bestScore: bestMovementScore(draft),
            bestDesignName: bestMeasuredDesignName(draft),
            measurementCount: validMeasurementCount(draft),
            distinctDesignsMeasured: distinctMeasuredDesignCount(draft),
            predictionOk: hasPrediction(draft),
            sessionVid: hasSessionVideo(draft),
            gpsGranted: hasGpsGranted(draft),
            geoCaptured: hasRealGeo(draft),
            geoText: formatGeoText(draft.session.geo),
            requiredDesigns: Math.max(3, draft.session.designCount ?? 3),
        };
    }, [draft]);

    const smartReflectionSummary = useMemo(() => {
        if (!draft || !viewModel) {
            return 'Explain which structure was most stable during the simulated earthquake test.';
        }

        if (viewModel.bestScore == null || !viewModel.bestDesignName) {
            return 'Use your accelerometer measurements to explain which structure reduced movement the most.';
        }

        return `${viewModel.bestDesignName} had the lowest movement score (${viewModel.bestScore.toFixed(3)}), so it showed the strongest vibration resistance. Compare this result with your prediction and explain what design features may have improved stability.`;
    }, [draft, viewModel]);

    function validate(): string | null {
        if (!draft) return 'Draft not found.';

        const measuredDesigns = distinctMeasuredDesignCount(draft);

        if (measuredDesigns < 3) {
            return 'Please measure at least 3 designs before submitting.';
        }

        if (!hasPrediction(draft)) {
            return 'Prediction is required before submission.';
        }

        if (!hasGpsGranted(draft)) {
            return 'GPS must be enabled and granted before submission.';
        }

        if (!hasRealGeo(draft)) {
            return 'GPS coordinate not saved yet. Please capture location before submitting.';
        }

        if (reflectionQuality.isSubmissionBlocked) {
            return 'Please improve your reflection before submitting. It may be empty, too short, or contain inappropriate language.';
        }

        if (!isFiniteNumber(rating) || rating < 1 || rating > 5) {
            return 'Rating must be between 1 and 5.';
        }

        if (bestMovementScore(draft) == null) {
            return 'No movement score recorded. Please run at least one vibration measurement.';
        }

        return null;
    }

    async function onAttachVideoPick() {
        try {
            setAttaching(true);

            const picked = await pickVideoFromLibrary();
            if (!picked) return;

            setActivity4SessionVideo(runId, {
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

            setActivity4SessionVideo(runId, {
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
                        setActivity4SessionVideo(runId, undefined);
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

        const err = validate();

        if (err) {
            Alert.alert('Cannot submit', err, [
                err.toLowerCase().includes('coordinate') || err.toLowerCase().includes('gps')
                    ? {
                        text: 'Capture Location',
                        onPress: () => navigation.navigate('A4SessionSetup', {activityId, runId}),
                    }
                    : err.toLowerCase().includes('measure')
                        ? {
                            text: 'Go to Measurements',
                            onPress: () => navigation.navigate('A4Measurements', {activityId, runId}),
                        }
                        : err.toLowerCase().includes('prediction')
                            ? {
                                text: 'Go to Prediction',
                                onPress: () => navigation.navigate('A4Prediction', {activityId, runId}),
                            }
                            : {text: 'OK'},
            ]);
            return;
        }

        try {
            setSubmitting(true);

            const updated = setActivity4Reflection(runId, {
                reflectionText: reflectionText.trim(),
                rating,
            });

            setDraft(updated);

            const userSnap = await getDoc(doc(db, 'users', user.uid));
            const teamId = userSnap.data()?.teamId;

            if (!isNonEmptyString(teamId)) {
                Alert.alert('Join a team', 'You must join a team before submitting.');
                return;
            }

            const res = await submitActivity4({
                run: updated,
                teamId,
                createdBy: user.uid,
                reflection: updated.reflection?.reflectionText ?? reflectionText.trim(),
                rating: updated.reflection?.rating ?? rating,
            });

            clearActivity4RunDraft(runId);

            showToast(
                'Submission successful',
                'success',
                `Score: ${res.score}. Lower is better.`,
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
                const updated = setActivity4Reflection(runId, {
                    reflectionText: reflectionText.trim(),
                    rating,
                });

                const userSnap = await getDoc(doc(db, 'users', user.uid));
                const teamId = userSnap.data()?.teamId;

                if (!isNonEmptyString(teamId)) {
                    Alert.alert('Error', getErrorMessage(error));
                    return;
                }

                await queueFinalSubmission({
                    runId: updated.runId,
                    activityId: 'activity04_earthquake',
                    userId: user.uid,
                    teamId,
                    payload: {
                        activityNumber: 4,
                        args: {
                            run: updated,
                            teamId,
                            createdBy: user.uid,
                            reflection: updated.reflection?.reflectionText ?? reflectionText.trim(),
                            rating: updated.reflection?.rating ?? rating,
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
                    <AppBadge label="Activity 4" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Reflection & Submit
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Review earthquake stability evidence, write a meaningful reflection,
                        and submit.
                    </AppText>
                </View>

                <InfoBanner
                    title="Final submission check"
                    message="Activity 4 requires prediction, at least 3 measured designs, GPS permission, saved coordinate, and a complete reflection."
                    tone="info"
                />

                <View style={styles.heroCard}>
                    <AppText variant="bodyStrong" color="inverseText">
                        Best Movement Score
                    </AppText>

                    <AppText variant="title" color="inverseText" style={styles.heroScore}>
                        {viewModel.bestScore == null ? '—' : viewModel.bestScore.toFixed(3)}
                    </AppText>

                    <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                        Lower movement score indicates stronger vibration resistance.
                    </AppText>
                </View>

                <AppSectionHeader
                    title="Submission Checklist"
                    subtitle="Required evidence and context before final submission."
                />

                <AppCard>
                    <View style={styles.checkList}>
                        <ChecklistRow label="Prediction completed" ok={viewModel.predictionOk}/>

                        <ChecklistRow
                            label="Measured designs"
                            ok={viewModel.distinctDesignsMeasured >= 3}
                            meta={`${viewModel.distinctDesignsMeasured} measured`}
                        />

                        <ChecklistRow
                            label="Sensor measurements"
                            ok={viewModel.measurementCount > 0}
                            meta={`${viewModel.measurementCount} captured`}
                        />

                        <ChecklistRow
                            label="Session video"
                            ok={viewModel.sessionVid}
                            meta={viewModel.sessionVid ? 'Attached' : 'Optional'}
                        />

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
                    </View>

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

                    {viewModel.gpsGranted && !viewModel.geoCaptured ? (
                        <AppButton
                            title="Capture Location"
                            variant="outline"
                            onPress={() => navigation.navigate('A4SessionSetup', {activityId, runId})}
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
                            • Which structure reduced movement the most and why.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • Whether your prediction matched the accelerometer result.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • How shape, base width, height, or material affected stability.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • One design improvement you would test next.
                        </AppText>
                    </View>

                    <AppInput
                        label="Your reflection"
                        value={reflectionText}
                        onChangeText={setReflectionText}
                        placeholder="Example: Design 2 had the lowest movement score because its wider base made it more stable during vibration..."
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