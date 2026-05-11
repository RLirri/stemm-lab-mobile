// src/screens/Activities/Activity1/A1MeasurementsScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Switch,
    View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {
    type ActivityRunDraft,
    type AttemptDraft,
    type AttemptMeasurementsDraft,
    getRunDraft,
    updateAttempt,
} from '../../../store/activityRunDraftStore';

import {pickVideoFromLibrary, recordVideoWithCamera,} from '../../../services/evidenceService';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A1Measurements'>;

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function toNumberOrUndefined(raw: string): number | undefined {
    const v = raw.trim();
    if (!v) return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
}

function attemptLabel(index: number) {
    return index === 0 ? 'Baseline' : `Prototype ${index}`;
}

export default function A1MeasurementsScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId, attemptIndex} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);
    const [attempt, setAttempt] = useState<AttemptDraft | null>(null);

    const [tHitRaw, setTHitRaw] = useState<string>('');
    const [tStopRaw, setTStopRaw] = useState<string>('');

    const [inZone, setInZone] = useState<boolean | null>(null);
    const [distanceRaw, setDistanceRaw] = useState<string>('');

    const [bounceOccurred, setBounceOccurred] = useState<boolean>(false);
    const [tUpRaw, setTUpRaw] = useState<string>('');

    const [savingVideo, setSavingVideo] = useState(false);

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

        const a = d.attempts?.[attemptIndex];

        if (!a) {
            Alert.alert('Attempt missing', 'This attempt slot does not exist.', [
                {text: 'OK', onPress: () => navigation.goBack()},
            ]);
            return;
        }

        setDraft(d);
        setAttempt(a);
    }, [activityId, attemptIndex, navigation, runId, user]);

    useEffect(() => {
        if (!draft || !attempt) return;

        const m = attempt.measurements;

        setTHitRaw(m?.tHitSec != null ? String(m.tHitSec) : '');
        setTStopRaw(m?.tStopSec != null ? String(m.tStopSec) : '');

        setInZone(typeof m?.inTargetZone === 'boolean' ? m.inTargetZone : null);
        setDistanceRaw(
            m?.distanceFromCenterCm != null ? String(m.distanceFromCenterCm) : '',
        );

        setBounceOccurred(Boolean(m?.bounceOccurred));
        setTUpRaw(m?.bounceTimeToPeakSec != null ? String(m.bounceTimeToPeakSec) : '');
    }, [attempt, draft]);

    const targetRequired = useMemo(
        () => Boolean(draft?.session.targetZoneEnabled),
        [draft?.session.targetZoneEnabled],
    );

    function persistMeasurements(next: AttemptMeasurementsDraft) {
        const updated = updateAttempt(runId, attemptIndex, {
            measurements: next,
        });

        setDraft(updated);
        setAttempt(updated.attempts[attemptIndex]);
    }

    function validate(): string | null {
        const tHit = toNumberOrUndefined(tHitRaw);

        if (tHit == null || tHit <= 0) {
            return 'Time to First Ground Contact (t_hit) must be > 0.';
        }

        const tStop = toNumberOrUndefined(tStopRaw);

        if (tStop == null || tStop < 0) {
            return 'Stopping time (t_stop) must be ≥ 0.';
        }

        if (targetRequired && inZone === null) {
            return 'Target zone is enabled. Please answer whether it landed in the target zone.';
        }

        if (distanceRaw.trim()) {
            const d = toNumberOrUndefined(distanceRaw);

            if (d == null || d < 0) {
                return 'Distance from center must be a non-negative number.';
            }
        }

        if (bounceOccurred) {
            const tUp = toNumberOrUndefined(tUpRaw);

            if (tUp == null || tUp <= 0) {
                return 'Bounce is ON. Please enter time to peak after bounce (t_up) > 0.';
            }
        }

        return null;
    }

    function onCompute() {
        if (!draft || !attempt) return;

        const err = validate();

        if (err) {
            Alert.alert('Check fields', err);
            return;
        }

        const next: AttemptMeasurementsDraft = {
            tHitSec: toNumberOrUndefined(tHitRaw),
            tStopSec: toNumberOrUndefined(tStopRaw),
            inTargetZone: targetRequired ? inZone ?? undefined : undefined,
            distanceFromCenterCm: distanceRaw.trim()
                ? toNumberOrUndefined(distanceRaw)
                : undefined,
            bounceOccurred: bounceOccurred ? true : undefined,
            bounceTimeToPeakSec: bounceOccurred
                ? toNumberOrUndefined(tUpRaw)
                : undefined,
        };

        persistMeasurements(next);
        navigation.navigate('A1Result', {activityId, runId, attemptIndex});
    }

    async function attachVideo(kind: 'record' | 'pick') {
        try {
            if (!draft || !attempt) return;

            setSavingVideo(true);

            const picked =
                kind === 'record'
                    ? await recordVideoWithCamera()
                    : await pickVideoFromLibrary();

            if (!picked) return;

            const now = Date.now();

            const updated = updateAttempt(runId, attemptIndex, {
                video: {
                    type: 'video',
                    uri: picked.uri,
                    createdAt: now,
                },
            });

            setDraft(updated);
            setAttempt(updated.attempts[attemptIndex]);

            showToast(
                'Video attached',
                'success',
                'The video will be uploaded during submission.',
            );
        } catch (e: any) {
            Alert.alert('Video error', e?.message ?? 'Failed to attach video.');
        } finally {
            setSavingVideo(false);
        }
    }

    function clearVideo() {
        if (!draft || !attempt) return;

        const updated = updateAttempt(runId, attemptIndex, {
            video: undefined,
        });

        setDraft(updated);
        setAttempt(updated.attempts[attemptIndex]);

        showToast(
            'Video removed',
            'info',
            'You can attach another recording anytime.',
        );
    }

    if (!user) return null;

    if (!draft || !attempt) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading measurement draft..."/>
            </AppGradientScreen>
        );
    }

    const hasVideo =
        typeof attempt.video?.uri === 'string' && attempt.video.uri.length > 0;

    return (
        <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <AppGradientScreen>
                <View style={styles.header}>
                    <AppBadge
                        label={attemptIndex === 0 ? 'Baseline' : `Prototype ${attemptIndex}`}
                        tone={attemptIndex === 0 ? 'info' : 'primary'}
                    />

                    <AppText variant="title" style={styles.title}>
                        Measurements
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        {attemptLabel(attemptIndex)} · Record evidence and enter measured
                        values before computing results.
                    </AppText>
                </View>

                <InfoBanner
                    title="Measurement guidance"
                    message="Use slow-motion video when possible. Keep timing values consistent so the result screen can calculate fair comparisons."
                    tone="info"
                />

                <AppSectionHeader
                    title="Evidence"
                    subtitle="Attach one video per attempt for later submission."
                />

                <AppCard>
                    <View style={styles.cardHeader}>
                        <View style={styles.cardHeaderText}>
                            <AppText variant="sectionTitle">Video Evidence</AppText>
                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                Recording works best on a real device.
                            </AppText>
                        </View>

                        <AppBadge
                            label={hasVideo ? 'Attached' : 'Missing'}
                            tone={hasVideo ? 'success' : 'warning'}
                        />
                    </View>

                    <View style={styles.videoActions}>
                        <AppButton
                            title="Record Video"
                            variant="outline"
                            onPress={() => attachVideo('record')}
                            disabled={savingVideo}
                        />

                        <AppButton
                            title="Pick From Library"
                            variant="outline"
                            onPress={() => attachVideo('pick')}
                            disabled={savingVideo}
                        />
                    </View>

                    {savingVideo ? (
                        <View style={styles.loadingRow}>
                            <ActivityIndicator color={colors.primary}/>
                            <AppText variant="caption" color="textMuted">
                                Preparing video...
                            </AppText>
                        </View>
                    ) : null}

                    <View style={styles.statusBox}>
                        <AppText variant="bodyStrong">Status</AppText>
                        <AppText variant="caption" color={hasVideo ? 'success' : 'textMuted'}>
                            {hasVideo ? 'Video attached' : 'No video yet'}
                        </AppText>
                    </View>

                    {hasVideo ? (
                        <AppButton
                            title="Remove Video"
                            variant="danger"
                            onPress={clearVideo}
                            style={styles.removeButton}
                        />
                    ) : null}
                </AppCard>

                <AppSectionHeader
                    title="Flight Time"
                    subtitle="Measure time to first ground contact."
                />

                <AppCard>
                    <AppInput
                        label="t_hit (seconds)"
                        value={tHitRaw}
                        onChangeText={setTHitRaw}
                        placeholder="e.g. 1.2"
                        keyboardType="decimal-pad"
                    />

                    <AppText variant="caption" color="textMuted" style={styles.helpText}>
                        t_hit is the time from release until first ground contact.
                    </AppText>
                </AppCard>

                <AppSectionHeader
                    title="Stopping Time"
                    subtitle="Measure how long the object continues moving after contact."
                />

                <AppCard>
                    <AppInput
                        label="t_stop (seconds)"
                        value={tStopRaw}
                        onChangeText={setTStopRaw}
                        placeholder="e.g. 0.05"
                        keyboardType="decimal-pad"
                    />

                    <AppText variant="caption" color="textMuted" style={styles.helpText}>
                        t_stop is the time from first contact until the object stops moving.
                    </AppText>
                </AppCard>

                <AppSectionHeader
                    title="Landing Accuracy"
                    subtitle={
                        targetRequired
                            ? 'Required because target zone is enabled.'
                            : 'Optional for this session.'
                    }
                />

                {targetRequired ? (
                    <AppCard>
                        <AppText variant="bodyStrong">Did it land in the target zone?</AppText>

                        <View style={styles.choiceRow}>
                            <ChoiceButton
                                label="Yes"
                                active={inZone === true}
                                onPress={() => setInZone(true)}
                            />

                            <ChoiceButton
                                label="No"
                                active={inZone === false}
                                onPress={() => setInZone(false)}
                            />
                        </View>

                        <AppInput
                            label="Distance from center (cm) optional"
                            value={distanceRaw}
                            onChangeText={setDistanceRaw}
                            placeholder="e.g. 35"
                            keyboardType="decimal-pad"
                        />
                    </AppCard>
                ) : (
                    <AppCard>
                        <AppText variant="body" color="textMuted">
                            Target zone is not enabled. You can skip accuracy scoring for this
                            session.
                        </AppText>
                    </AppCard>
                )}

                <AppSectionHeader
                    title="Bounce"
                    subtitle="Optional extra impact estimate if the object bounced."
                />

                <AppCard>
                    <View style={styles.switchRow}>
                        <View style={styles.switchText}>
                            <AppText variant="bodyStrong">Bounce occurred?</AppText>
                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                Enable only if there was a visible bounce after contact.
                            </AppText>
                        </View>

                        <Switch
                            value={bounceOccurred}
                            onValueChange={(v) => {
                                setBounceOccurred(v);
                                if (!v) setTUpRaw('');
                            }}
                        />
                    </View>

                    {bounceOccurred ? (
                        <AppInput
                            label="t_up (seconds)"
                            value={tUpRaw}
                            onChangeText={setTUpRaw}
                            placeholder="e.g. 0.15"
                            keyboardType="decimal-pad"
                        />
                    ) : null}
                </AppCard>

                <AppButton title="Compute Results" onPress={onCompute}/>

                <AppText variant="caption" color="textMuted" style={styles.footerHint}>
                    Next: Results screen with computed values and interpretation. Then you
                    can save the attempt and continue.
                </AppText>

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

type ChoiceButtonProps = {
    label: string;
    active: boolean;
    onPress: () => void;
};

function ChoiceButton({label, active, onPress}: ChoiceButtonProps) {
    return (
        <Pressable
            onPress={onPress}
            style={[styles.choiceButton, active && styles.choiceButtonActive]}
        >
            <AppText
                variant="bodyStrong"
                color={active ? 'inverseText' : 'text'}
                align="center"
            >
                {label}
            </AppText>
        </Pressable>
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

    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    cardHeaderText: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    videoActions: {
        marginTop: spacing.lg,
        gap: spacing.md,
    },

    loadingRow: {
        marginTop: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },

    statusBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    removeButton: {
        marginTop: spacing.md,
    },

    helpText: {
        marginTop: -spacing.sm,
    },

    choiceRow: {
        flexDirection: 'row',
        gap: spacing.md,
        marginTop: spacing.md,
        marginBottom: spacing.lg,
    },

    choiceButton: {
        flex: 1,
        minHeight: 46,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.md,
    },

    choiceButtonActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    switchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    switchText: {
        flex: 1,
    },

    footerHint: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});