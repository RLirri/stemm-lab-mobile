import React, {useEffect, useMemo, useRef, useState} from 'react';
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
    type A5ParticipantDraft,
    type Activity5RunDraft,
    createActivity5RunDraft,
    discardActivity5RunDraft,
    getActivity5RunDraft,
    getLatestRecoverableActivity5RunDraft,
    hydrateActivity5RunDraftFromLocalDb,
    updateActivity5Participant,
    updateActivity5Session,
    validateA5Session,
} from '../../../store/activity5RunDraftStore';

import {confirmBatteryBeforeActivity} from '../../../services/battery';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A5SessionSetup'>;
type ToastTone = 'success' | 'info' | 'warning' | 'danger';

function clampInt(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
}

function digitsOnly(s: string) {
    return s.replace(/[^\d]/g, '');
}

function isFiniteNumber(x: unknown): x is number {
    return typeof x === 'number' && Number.isFinite(x);
}

function trimOrEmpty(s: string) {
    return s.trim();
}

function formatGeoText(geo: Activity5RunDraft['session']['geo'] | undefined): string {
    if (!geo) return 'No coordinate saved yet';
    if (!isFiniteNumber(geo.lat) || !isFiniteNumber(geo.lng)) {
        return 'No coordinate saved yet';
    }

    const accText = isFiniteNumber(geo.accuracyM)
        ? ` (±${Math.round(geo.accuracyM)}m)`
        : '';

    const timeText = isFiniteNumber(geo.capturedAt)
        ? ` • ${new Date(geo.capturedAt).toLocaleString()}`
        : '';

    return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${accText}${timeText}`;
}

async function requestGpsPermissionSafe(): Promise<'granted' | 'denied'> {
    try {
        const Location = await import('expo-location');
        const res = await Location.requestForegroundPermissionsAsync();
        return res.status === 'granted' ? 'granted' : 'denied';
    } catch {
        return 'denied';
    }
}

async function getCurrentGeoSafe(): Promise<
    | {
    lat: number;
    lng: number;
    accuracyM?: number;
}
    | null
> {
    try {
        const Location = await import('expo-location');

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) return null;

        const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });

        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        const acc = pos?.coords?.accuracy ?? undefined;
        const accuracyM =
            typeof acc === 'number' && Number.isFinite(acc) ? acc : undefined;

        return {lat, lng, accuracyM};
    } catch {
        return null;
    }
}

export default function A5SessionSetupScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;
    const routeRunId = route.params.runId;

    const [draft, setDraft] = useState<Activity5RunDraft | null>(null);
    const [bootstrapping, setBootstrapping] = useState(true);

    const hasBootstrappedRef = useRef(false);

    const [sessionLabel, setSessionLabel] = useState('');
    const [samplingHzRaw, setSamplingHzRaw] = useState('50');
    const [movementDurationSecRaw, setMovementDurationSecRaw] = useState('20');
    const [participantCountRaw, setParticipantCountRaw] = useState('1');
    const [feedbackEnabled, setFeedbackEnabled] = useState(true);

    const [gpsEnabled, setGpsEnabled] = useState(true);
    const [gpsPermission, setGpsPermission] = useState<
        'unknown' | 'granted' | 'denied'
    >('unknown');
    const [capturingGps, setCapturingGps] = useState(false);

    const [newParticipantName, setNewParticipantName] = useState('');

    const [toast, setToast] = useState<{
        visible: boolean;
        title: string;
        message?: string;
        tone?: ToastTone;
    }>({
        visible: false,
        title: '',
    });

    function showToast(title: string, message?: string, tone: ToastTone = 'info') {
        setToast({
            visible: true,
            title,
            message,
            tone,
        });
    }

    useEffect(() => {
        if (!toast.visible) return;

        const timer = setTimeout(() => {
            setToast((prev) => ({
                ...prev,
                visible: false,
            }));
        }, 2500);

        return () => clearTimeout(timer);
    }, [toast.visible]);

    useEffect(() => {
        if (!user) return;
        if (hasBootstrappedRef.current) return;

        hasBootstrappedRef.current = true;
        const userId = user.uid;

        async function bootstrap() {
            try {
                setBootstrapping(true);

                if (routeRunId) {
                    const existing = getActivity5RunDraft(routeRunId);
                    if (existing) {
                        setDraft(existing);
                        return;
                    }

                    const hydrated = await hydrateActivity5RunDraftFromLocalDb(routeRunId);
                    if (hydrated) {
                        setDraft(hydrated);
                        navigation.setParams({runId: hydrated.runId});
                        return;
                    }

                    const recreated = createActivity5RunDraft({
                        activityId,
                        createdBy: userId,
                        gpsEnabled: true,
                        feedbackEnabled: true,
                        samplingHz: 50,
                        movementDurationSec: 20,
                        participantCount: 1,
                    });
                    setDraft(recreated);
                    navigation.setParams({runId: recreated.runId});
                    return;
                }

                const recoverable = await getLatestRecoverableActivity5RunDraft({
                    activityId,
                    createdBy: userId,
                });

                if (recoverable) {
                    Alert.alert(
                        'Resume previous draft?',
                        'We found an unfinished Activity 5 draft. Would you like to continue it or start a new session?',
                        [
                            {
                                text: 'Start New',
                                style: 'destructive',
                                onPress: async () => {
                                    try {
                                        await discardActivity5RunDraft(recoverable.runId);
                                    } catch (error) {
                                        console.error(
                                            '[A5SessionSetup] Failed to discard old draft',
                                            error,
                                        );
                                    }

                                    const created = createActivity5RunDraft({
                                        activityId,
                                        createdBy: userId,
                                        gpsEnabled: true,
                                        feedbackEnabled: true,
                                        samplingHz: 50,
                                        movementDurationSec: 20,
                                        participantCount: 1,
                                    });
                                    setDraft(created);
                                    navigation.setParams({runId: created.runId});
                                },
                            },
                            {
                                text: 'Resume',
                                onPress: () => {
                                    setDraft(recoverable);
                                    navigation.setParams({runId: recoverable.runId});
                                },
                            },
                        ],
                    );
                    return;
                }

                const created = createActivity5RunDraft({
                    activityId,
                    createdBy: userId,
                    gpsEnabled: true,
                    feedbackEnabled: true,
                    samplingHz: 50,
                    movementDurationSec: 20,
                    participantCount: 1,
                });
                setDraft(created);
                navigation.setParams({runId: created.runId});
            } catch (error) {
                console.error('[A5SessionSetup] Failed to bootstrap draft', error);

                const fallback = createActivity5RunDraft({
                    activityId,
                    createdBy: userId,
                    gpsEnabled: true,
                    feedbackEnabled: true,
                    samplingHz: 50,
                    movementDurationSec: 20,
                    participantCount: 1,
                });
                setDraft(fallback);
                navigation.setParams({runId: fallback.runId});
            } finally {
                setBootstrapping(false);
            }
        }

        void bootstrap();
    }, [activityId, navigation, routeRunId, user]);

    useEffect(() => {
        if (!draft) return;

        setSessionLabel(draft.session.sessionLabel ?? '');
        setSamplingHzRaw(String(draft.session.samplingHz ?? 50));
        setMovementDurationSecRaw(String(draft.session.movementDurationSec ?? 20));
        setParticipantCountRaw(String(draft.session.participantCount ?? 1));

        setFeedbackEnabled(Boolean(draft.session.feedbackEnabled));

        setGpsEnabled(Boolean(draft.session.gpsEnabled));
        setGpsPermission(draft.session.gpsPermission ?? 'unknown');
    }, [draft]);

    const participants = draft?.session.participants ?? [];
    const geoCaptured = !!draft?.session.geo;

    const sessionError = useMemo(() => {
        if (!draft) return null;

        const samplingHz = clampInt(Number(samplingHzRaw || '50'), 10, 100);
        const movementDurationSec = clampInt(
            Number(movementDurationSecRaw || '20'),
            10,
            60,
        );
        const participantCount = clampInt(Number(participantCountRaw || '1'), 1, 6);

        const shadow: Activity5RunDraft = {
            ...draft,
            session: {
                ...draft.session,
                sessionLabel: sessionLabel.trim() ? sessionLabel.trim() : undefined,
                samplingHz,
                movementDurationSec,
                participantCount,
                feedbackEnabled,
                gpsEnabled,
                gpsPermission,
            },
        };

        return validateA5Session(shadow);
    }, [
        draft,
        sessionLabel,
        samplingHzRaw,
        movementDurationSecRaw,
        participantCountRaw,
        feedbackEnabled,
        gpsEnabled,
        gpsPermission,
    ]);

    function persistSessionBase(): Activity5RunDraft | null {
        if (!draft) return null;

        const samplingHz = clampInt(Number(samplingHzRaw || '50'), 10, 100);
        const movementDurationSec = clampInt(
            Number(movementDurationSecRaw || '20'),
            10,
            60,
        );
        const participantCount = clampInt(Number(participantCountRaw || '1'), 1, 6);

        const next = updateActivity5Session(draft.runId, {
            sessionLabel: sessionLabel.trim() ? sessionLabel.trim() : undefined,
            samplingHz,
            movementDurationSec,
            participantCount,
            feedbackEnabled,
            gpsEnabled,
            gpsPermission,
        });

        setDraft(next);
        return next;
    }

    function onRenameParticipant(participantId: string, name: string) {
        if (!draft) return;

        const next = updateActivity5Participant(draft.runId, participantId, {
            name,
        });
        setDraft(next);
    }

    function onAddParticipant() {
        if (!draft) return;

        const name = trimOrEmpty(newParticipantName);
        if (!name) {
            showToast('Missing name', 'Enter a participant name first.', 'warning');
            return;
        }

        const currentCount = draft.session.participantCount ?? participants.length ?? 1;
        if (currentCount >= 6) {
            showToast('Limit reached', 'Participant count cannot exceed 6.', 'warning');
            return;
        }

        const afterCount = updateActivity5Session(draft.runId, {
            participantCount: currentCount + 1,
        });

        const appended =
            afterCount.session.participants?.[afterCount.session.participants.length - 1];

        if (!appended?.id) {
            setDraft(afterCount);
            setNewParticipantName('');
            return;
        }

        const afterRename = updateActivity5Participant(afterCount.runId, appended.id, {
            name,
        });

        setDraft(afterRename);
        setParticipantCountRaw(String(afterRename.session.participantCount));
        setNewParticipantName('');

        showToast('Participant added', `${name} was added to this session.`, 'success');
    }

    function onRemoveParticipant(participantId: string) {
        if (!draft) return;

        const currentCount = draft.session.participantCount ?? participants.length ?? 1;
        if (currentCount <= 1) {
            showToast('Not allowed', 'At least 1 participant is required.', 'warning');
            return;
        }

        Alert.alert('Remove participant?', 'This will remove the participant from the session.', [
            {text: 'Cancel', style: 'cancel'},
            {
                text: 'Remove',
                style: 'destructive',
                onPress: () => {
                    const filtered: A5ParticipantDraft[] = (
                        draft.session.participants ?? []
                    ).filter((p) => p.id !== participantId);

                    const next = updateActivity5Session(draft.runId, {
                        participantCount: currentCount - 1,
                        participants: filtered,
                    });

                    setDraft(next);
                    setParticipantCountRaw(String(next.session.participantCount));

                    showToast(
                        'Participant removed',
                        'The participant was removed from this session.',
                        'info',
                    );
                },
            },
        ]);
    }

    async function onCaptureGps() {
        if (!draft) return;

        if (!gpsEnabled) {
            showToast('GPS disabled', 'Enable GPS first to capture coordinates.', 'warning');
            return;
        }

        try {
            setCapturingGps(true);

            let status = gpsPermission;
            if (status === 'unknown' || status === 'denied') {
                status = await requestGpsPermissionSafe();
                setGpsPermission(status);

                const nextPerm = updateActivity5Session(draft.runId, {
                    gpsPermission: status,
                });
                setDraft(nextPerm);
            }

            if (status !== 'granted') {
                Alert.alert(
                    'Permission denied',
                    'Location permission is required for submission. Please enable it in device settings.',
                );
                return;
            }

            const g = await getCurrentGeoSafe();
            if (!g) {
                Alert.alert(
                    'Location unavailable',
                    'Could not capture your location. Please ensure Location Services are ON and try again.',
                );
                return;
            }

            const next = updateActivity5Session(draft.runId, {
                gpsEnabled: true,
                gpsPermission: 'granted',
                geo: {
                    lat: g.lat,
                    lng: g.lng,
                    accuracyM: g.accuracyM,
                    capturedAt: Date.now(),
                },
            });

            setDraft(next);

            showToast(
                'Location captured',
                'GPS coordinate has been saved for submission.',
                'success',
            );
        } finally {
            setCapturingGps(false);
        }
    }

    function onToggleGps(nextVal: boolean) {
        setGpsEnabled(nextVal);

        if (!draft) return;

        const next = updateActivity5Session(draft.runId, {
            gpsEnabled: nextVal,
            geo: nextVal ? draft.session.geo : undefined,
        });

        setDraft(next);

        if (!nextVal) {
            showToast(
                'GPS disabled',
                'Location evidence will be removed until GPS is enabled again.',
                'warning',
            );
        }
    }

    async function onContinue() {
        if (!user || !draft) return;

        if (sessionError) {
            Alert.alert('Check setup', sessionError);
            return;
        }

        const canContinue = await confirmBatteryBeforeActivity({
            activityId,
            activityTitle: 'Activity 5: Human Performance',
            intensity: 'HIGH',
        });

        if (!canContinue) return;

        const next = persistSessionBase();
        if (!next) return;

        navigation.navigate('A5Prediction', {
            activityId,
            runId: next.runId,
        });
    }

    if (!user) return null;

    if (bootstrapping || !draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Checking for unfinished Activity 5 session..."/>
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
                    <AppBadge label="Activity 5" tone="success"/>

                    <AppText variant="title" style={styles.title}>
                        Performance Setup
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Configure participants, movement settings, feedback mode, and GPS evidence before prediction.
                    </AppText>
                </View>

                <InfoBanner
                    title="Movement performance activity"
                    message="Keep settings consistent across participants so movement smoothness and control can be compared fairly."
                    tone="success"
                />

                <AppSectionHeader
                    title="Session"
                    subtitle="Add a meaningful label so the run is easier to identify later."
                />

                <AppCard>
                    <AppInput
                        label="Session label"
                        value={sessionLabel}
                        onChangeText={setSessionLabel}
                        placeholder="e.g. Week 5 – Human Performance Lab"
                    />

                    <AppText variant="caption" color="textMuted">
                        Tip: Use a clear label so your team can find the submission later.
                    </AppText>
                </AppCard>

                <AppSectionHeader
                    title="Sensor Settings"
                    subtitle="Use consistent settings for fair comparison between participants."
                />

                <AppCard>
                    <View style={styles.grid}>
                        <View style={styles.gridCol}>
                            <AppInput
                                label="Sampling rate"
                                value={samplingHzRaw}
                                onChangeText={(t) => setSamplingHzRaw(digitsOnly(t))}
                                placeholder="50"
                                keyboardType="number-pad"
                                maxLength={3}
                            />

                            <AppText variant="caption" color="textMuted">
                                10–100 Hz
                            </AppText>
                        </View>

                        <View style={styles.gridCol}>
                            <AppInput
                                label="Duration"
                                value={movementDurationSecRaw}
                                onChangeText={(t) => setMovementDurationSecRaw(digitsOnly(t))}
                                placeholder="20"
                                keyboardType="number-pad"
                                maxLength={2}
                            />

                            <AppText variant="caption" color="textMuted">
                                10–60 seconds
                            </AppText>
                        </View>
                    </View>

                    <View style={styles.settingRow}>
                        <View style={styles.settingText}>
                            <AppText variant="bodyStrong">Enable Feedback Mode</AppText>
                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                Provides real-time guidance to encourage smoother movement.
                            </AppText>
                        </View>

                        <Switch value={feedbackEnabled} onValueChange={setFeedbackEnabled}/>
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Participants"
                    subtitle="Each guided trial is linked to one participant."
                />

                <AppCard>
                    <AppInput
                        label="Participant count (1–6)"
                        value={participantCountRaw}
                        onChangeText={(t) => setParticipantCountRaw(digitsOnly(t))}
                        placeholder="1"
                        keyboardType="number-pad"
                        maxLength={1}
                        onBlur={() => {
                            if (!draft) return;
                            const nextCount = clampInt(Number(participantCountRaw || '1'), 1, 6);
                            const next = updateActivity5Session(draft.runId, {
                                participantCount: nextCount,
                            });
                            setDraft(next);
                            setParticipantCountRaw(String(next.session.participantCount));
                        }}
                    />

                    <View style={styles.addRow}>
                        <View style={styles.addInput}>
                            <AppInput
                                label="Add participant"
                                value={newParticipantName}
                                onChangeText={setNewParticipantName}
                                placeholder="e.g. Ruixin"
                            />
                        </View>

                        <AppButton
                            title="Add"
                            onPress={onAddParticipant}
                            fullWidth={false}
                            style={styles.addButton}
                        />
                    </View>

                    {participants.length === 0 ? (
                        <InfoBanner
                            title="No participants initialized"
                            message="Add at least one participant before running trials."
                            tone="warning"
                        />
                    ) : (
                        <View style={styles.participantList}>
                            {participants.map((p, idx) => (
                                <View key={p.id} style={styles.participantCard}>
                                    <View style={styles.participantHeader}>
                                        <AppBadge label={`Participant ${idx + 1}`} tone="info"/>

                                        <Pressable
                                            onPress={() => onRemoveParticipant(p.id)}
                                            style={styles.removeButton}
                                        >
                                            <AppText variant="caption" color="danger">
                                                Remove
                                            </AppText>
                                        </Pressable>
                                    </View>

                                    <AppInput
                                        label="Name"
                                        value={p.name}
                                        onChangeText={(t) => onRenameParticipant(p.id, t)}
                                        placeholder={`Participant ${idx + 1}`}
                                    />

                                    <AppText variant="caption" color="textMuted">
                                        Added • {new Date(p.createdAt).toLocaleString()}
                                    </AppText>
                                </View>
                            ))}
                        </View>
                    )}

                    <AppText variant="caption" color="textMuted" style={styles.blockGap}>
                        At least 1 participant is required. You can run more trials per participant later.
                    </AppText>
                </AppCard>

                <AppSectionHeader
                    title="GPS Evidence"
                    subtitle="Required before final submission."
                />

                <AppCard>
                    <View style={styles.settingRow}>
                        <View style={styles.settingText}>
                            <AppText variant="bodyStrong">Enable GPS</AppText>
                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                Submission will be blocked until GPS is granted and a coordinate is captured.
                            </AppText>
                        </View>

                        <Switch value={gpsEnabled} onValueChange={onToggleGps}/>
                    </View>

                    <StatusRow
                        label="Permission"
                        value={
                            gpsPermission === 'unknown'
                                ? 'Not requested'
                                : gpsPermission === 'granted'
                                    ? 'Granted'
                                    : 'Denied'
                        }
                        good={gpsPermission === 'granted'}
                    />

                    <StatusRow
                        label="Coordinate"
                        value={geoCaptured ? 'Captured' : gpsEnabled ? 'Not captured' : 'GPS off'}
                        good={geoCaptured}
                    />

                    <View style={styles.coordinateBox}>
                        <AppText variant="caption" color="textMuted">
                            Saved coordinate
                        </AppText>

                        <AppText variant="bodyStrong" style={styles.coordinateText}>
                            {formatGeoText(draft.session.geo)}
                        </AppText>
                    </View>

                    <AppButton
                        title={capturingGps ? 'Capturing...' : 'Capture GPS Coordinate'}
                        onPress={onCaptureGps}
                        disabled={capturingGps || !gpsEnabled}
                        variant="outline"
                        style={styles.blockGap}
                    />

                    {capturingGps ? (
                        <View style={styles.loadingInline}>
                            <ActivityIndicator color={colors.primary}/>
                            <AppText variant="caption" color="textMuted">
                                Waiting for location response...
                            </AppText>
                        </View>
                    ) : null}
                </AppCard>

                {sessionError ? (
                    <InfoBanner title="Fix before continuing" message={sessionError} tone="danger"/>
                ) : null}

                <AppButton title="Continue to Prediction" onPress={onContinue}/>

                <View style={styles.bottomSpace}/>

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
            </AppGradientScreen>
        </KeyboardAvoidingView>
    );
}

type StatusRowProps = {
    label: string;
    value: string;
    good?: boolean;
};

function StatusRow({label, value, good = false}: StatusRowProps) {
    return (
        <View style={styles.statusRow}>
            <AppText variant="bodyStrong">{label}</AppText>

            <View
                style={[
                    styles.statusPill,
                    good ? styles.statusPillGood : styles.statusPillBad,
                ]}
            >
                <AppText variant="caption" color={good ? 'success' : 'danger'}>
                    {value} {good ? '✓' : '!'}
                </AppText>
            </View>
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

    grid: {
        flexDirection: 'row',
        gap: spacing.md,
    },

    gridCol: {
        flex: 1,
    },

    settingRow: {
        marginTop: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    settingText: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    blockGap: {
        marginTop: spacing.lg,
    },

    addRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.md,
    },

    addInput: {
        flex: 1,
    },

    addButton: {
        minWidth: 86,
        marginBottom: spacing.md,
    },

    participantList: {
        marginTop: spacing.md,
        gap: spacing.md,
    },

    participantCard: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.md,
    },

    participantHeader: {
        marginBottom: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },

    removeButton: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
    },

    statusRow: {
        marginTop: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    statusPill: {
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
    },

    statusPillGood: {
        backgroundColor: colors.successSoft,
    },

    statusPillBad: {
        backgroundColor: colors.dangerSoft,
    },

    coordinateBox: {
        marginTop: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },

    coordinateText: {
        marginTop: spacing.xs,
    },

    loadingInline: {
        marginTop: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});