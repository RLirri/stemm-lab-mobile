// src/screens/Activities/Activity3/A3ReflectionSubmitScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {doc, getDoc} from 'firebase/firestore';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth, db} from '../../../services/firebase';
import {queueFinalSubmission} from '../../../services/offlineSubmissionQueueService';
import {submitActivity3} from '../../../services/activitySubmissionService';
import {ReflectionQualityCard} from '../../../components/reflection/ReflectionQualityCard';
import {checkReflectionQuality} from '../../../services/reflectionQualityService';

import {
    clearActivity3RunDraft,
    getActivity3RunDraft,
    setActivity3Reflection,
    type Activity3RunDraft,
} from '../../../store/activity3RunDraftStore';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A3ReflectionSubmit'>;

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

function isNonEmptyString(x: unknown): x is string {
    return typeof x === 'string' && x.trim().length > 0;
}

function hasSessionVideo(d: Activity3RunDraft) {
    return isNonEmptyString(d.evidence?.sessionVideo?.uri);
}

function countMeasurementVideos(d: Activity3RunDraft) {
    return d.measurements.reduce(
        (acc, m) => acc + (isNonEmptyString(m.video?.uri) ? 1 : 0),
        0,
    );
}

function hasAnyMeasurement(d: Activity3RunDraft) {
    return d.measurements.length > 0;
}

function hasAnyValidAngle(d: Activity3RunDraft) {
    return d.measurements.some(
        (m) => typeof m.bendAngleDeg === 'number' && Number.isFinite(m.bendAngleDeg),
    );
}

function hasPrediction(d: Activity3RunDraft) {
    return (
        typeof d.prediction?.predictedBestDesignIndex === 'number' &&
        typeof d.prediction?.predictedBestDistanceCm === 'number'
    );
}

function newestGeoText(d: Activity3RunDraft) {
    const geoRow = [...d.measurements]
        .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
        .find((m) => m.geo);

    const geo = geoRow?.geo;
    if (!geo) return 'No coordinate saved yet';

    const acc = geo.accuracyM ? ` (±${Math.round(geo.accuracyM)}m)` : '';
    return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${acc}`;
}

function friendlyFirebaseError(error: unknown) {
    if (error instanceof Error) return error.message;
    return 'Submission failed.';
}

export default function A3ReflectionSubmitScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);
    const [reflectionText, setReflectionText] = useState('');
    const [rating, setRating] = useState<number>(4);
    const [submitting, setSubmitting] = useState(false);

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

    useEffect(() => {
        if (!user) return;

        const d = getActivity3RunDraft(runId);

        if (!d) {
            Alert.alert(
                'Session expired',
                'Your draft session was reset. Please start again.',
                [
                    {
                        text: 'OK',
                        onPress: () => navigation.replace('A3SessionSetup', {activityId}),
                    },
                ],
            );
            return;
        }

        setDraft(d);
        setReflectionText(d.reflection?.reflectionText ?? '');
        setRating(d.reflection?.rating ?? 4);
    }, [activityId, navigation, runId, user]);

    const evidenceVM = useMemo(() => {
        if (!draft) return null;

        const sessionVid = hasSessionVideo(draft);
        const measVidCount = countMeasurementVideos(draft);
        const gpsOk =
            draft.session.gpsEnabled && draft.session.gpsPermission === 'granted';

        return {
            sessionVid,
            measVidCount,
            gpsOk,
            geoText: newestGeoText(draft),
        };
    }, [draft]);

    const bestMeasurement = useMemo(() => {
        if (!draft || draft.measurements.length === 0) return null;

        const valid = draft.measurements.filter(
            (m) => typeof m.bendAngleDeg === 'number' && Number.isFinite(m.bendAngleDeg),
        );

        if (valid.length === 0) return null;

        return valid.reduce((best, current) => {
            const bestAngle = best.bendAngleDeg ?? 0;
            const currentAngle = current.bendAngleDeg ?? 0;
            return currentAngle > bestAngle ? current : best;
        }, valid[0]);
    }, [draft]);

    const smartReflectionSummary = useMemo(() => {
        if (!draft || !bestMeasurement) {
            return 'Use your measurements to explain which fan setup produced the strongest air movement.';
        }

        const angle = bestMeasurement.bendAngleDeg;
        const angleText =
            typeof angle === 'number'
                ? `${angle.toFixed(1)}°`
                : 'the highest recorded angle';

        const distanceText =
            typeof bestMeasurement.distanceCm === 'number'
                ? ` at ${bestMeasurement.distanceCm} cm`
                : '';

        const predictedDistance = draft.prediction?.predictedBestDistanceCm;
        const predictedDistanceText =
            typeof predictedDistance === 'number'
                ? ` Your predicted best distance was ${predictedDistance} cm.`
                : '';

        return `Your strongest result was a bend angle of ${angleText}${distanceText}.${predictedDistanceText}`;
    }, [bestMeasurement, draft]);

    function validate(): string | null {
        if (!draft) return 'Draft not found.';

        if (!hasAnyMeasurement(draft) || !hasAnyValidAngle(draft)) {
            return 'No measurements found. Please record at least one bend angle before submitting.';
        }

        if (!hasPrediction(draft)) {
            return 'Prediction is required before submission.';
        }

        if (reflectionQuality.isSubmissionBlocked) {
            return 'Please improve your reflection before submitting. It may be empty, too short, or contain inappropriate language.';
        }

        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
            return 'Rating must be between 1 and 5.';
        }

        if (!hasSessionVideo(draft)) {
            return 'Session video is required before submission. Go back and attach a session video.';
        }

        if (!draft.session.gpsEnabled) return 'GPS must be enabled before submission.';
        if (draft.session.gpsPermission !== 'granted') {
            return 'GPS permission must be granted before submission.';
        }

        return null;
    }

    async function fetchTeamIdOrThrow(uid: string): Promise<string> {
        const snap = await getDoc(doc(db, 'users', uid));
        const teamId = snap.data()?.teamId;

        if (!teamId) throw new Error('You must join a team before submitting.');

        return teamId;
    }

    async function onSubmit() {
        if (!user) return;
        if (!draft) return;
        if (submitting) return;

        const err = validate();

        if (err) {
            const lower = err.toLowerCase();

            Alert.alert('Cannot submit', err, [
                lower.includes('session video')
                    ? {
                        text: 'Go attach video',
                        onPress: () =>
                            navigation.navigate('A3SessionSetup', {activityId, runId}),
                    }
                    : lower.includes('measurements')
                        ? {
                            text: 'Go to Measurements',
                            onPress: () =>
                                navigation.navigate('A3Measurements', {activityId, runId}),
                        }
                        : {text: 'OK'},
            ]);
            return;
        }

        try {
            setSubmitting(true);

            const updated = setActivity3Reflection(runId, {
                reflectionText: reflectionText.trim(),
                rating,
            });

            setDraft(updated);

            const teamId = await fetchTeamIdOrThrow(user.uid);

            const res = await submitActivity3({
                run: updated,
                teamId,
                createdBy: user.uid,
                reflection: reflectionText.trim(),
                rating,
            });

            clearActivity3RunDraft(runId);

            showToast('Submission successful', 'success', `Score: ${res.score}`);

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
                const teamId = await fetchTeamIdOrThrow(user.uid);

                const updated = setActivity3Reflection(runId, {
                    reflectionText: reflectionText.trim(),
                    rating,
                });

                await queueFinalSubmission({
                    runId: updated.runId,
                    activityId: 'activity03_handFan',
                    userId: user.uid,
                    teamId,
                    payload: {
                        activityNumber: 3,
                        args: {
                            run: updated,
                            teamId,
                            createdBy: user.uid,
                            reflection: reflectionText.trim(),
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
                Alert.alert('Error', friendlyFirebaseError(queueError));
            }
        } finally {
            setSubmitting(false);
        }
    }

    if (!user) return null;

    if (!draft || !evidenceVM) {
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
                    <AppBadge label="Activity 3" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Reflection & Submit
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Check evidence, write a meaningful reflection, and submit your Hand Fan
                        Challenge result.
                    </AppText>
                </View>

                <InfoBanner
                    title="Final submission check"
                    message="Activity 3 requires a prediction, valid measurement data, session video evidence, GPS enabled, and a complete reflection."
                    tone="info"
                />

                <AppSectionHeader
                    title="Evidence Checklist"
                    subtitle="Required evidence and context before final submission."
                />

                <AppCard>
                    <View style={styles.checkList}>
                        <ChecklistRow label="Session video" ok={evidenceVM.sessionVid} required/>

                        <ChecklistRow
                            label="Measurement videos"
                            ok={evidenceVM.measVidCount > 0}
                            meta={`${evidenceVM.measVidCount} attached`}
                        />

                        <ChecklistRow label="GPS enabled and granted" ok={evidenceVM.gpsOk} required/>
                    </View>

                    <View style={styles.coordinateBox}>
                        <View style={styles.coordinateText}>
                            <AppText variant="bodyStrong">Saved coordinate</AppText>

                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                {evidenceVM.geoText}
                            </AppText>
                        </View>

                        <AppBadge
                            label={evidenceVM.gpsOk ? 'Available' : 'Missing'}
                            tone={evidenceVM.gpsOk ? 'success' : 'warning'}
                        />
                    </View>

                    {!evidenceVM.sessionVid ? (
                        <AppButton
                            title="Attach Session Video"
                            variant="outline"
                            onPress={() =>
                                navigation.navigate('A3SessionSetup', {activityId, runId})
                            }
                            style={styles.attachButton}
                        />
                    ) : null}
                </AppCard>

                <AppSectionHeader
                    title="Reflection"
                    subtitle="Explain your result using evidence from the experiment."
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
                            • Which fan design bent the material the most, and why.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • How distance, folds, layers, or material stiffness affected airflow.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • Whether your prediction matched the measured bend angle.
                        </AppText>

                        <AppText variant="caption" color="textMuted" style={styles.promptText}>
                            • One improvement for making the test fairer or more accurate.
                        </AppText>
                    </View>

                    <AppInput
                        label="Your reflection"
                        value={reflectionText}
                        onChangeText={setReflectionText}
                        placeholder="Example: The strongest fan setup created the largest bend angle because the airflow was more focused..."
                        multiline
                        style={styles.reflectionInput}
                    />

                    <ReflectionQualityCard result={reflectionQuality}/>
                </AppCard>

                <AppSectionHeader title="Rating" subtitle="How did this activity feel overall?"/>

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

    attachButton: {
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