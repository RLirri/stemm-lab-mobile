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
    type A7ParticipantDraft,
    type Activity7RunDraft,
    createActivity7RunDraft,
    discardActivity7RunDraft,
    getActivity7RunDraft,
    getLatestRecoverableActivity7RunDraft,
    hydrateActivity7RunDraftFromLocalDb,
    updateActivity7Participant,
    updateActivity7Session,
    validateA7Session,
} from '../../../store/activity7RunDraftStore';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A7SessionSetup'>;
type ToastTone = 'success' | 'info' | 'warning' | 'danger';

function clampInt(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNum(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

function digitsOnly(s: string) {
    return s.replace(/[^\d]/g, '');
}

function digitsAndSingleDot(s: string) {
    const cleaned = s.replace(/[^\d.]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot < 0) return cleaned;

    return (
        cleaned.slice(0, firstDot + 1) +
        cleaned.slice(firstDot + 1).replace(/\./g, '')
    );
}

function trimOrEmpty(s: string) {
    return s.trim();
}

function isFiniteNumber(x: unknown): x is number {
    return typeof x === 'number' && Number.isFinite(x);
}

function formatGeoText(geo: Activity7RunDraft['session']['geo'] | undefined): string {
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

export default function A7SessionSetupScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;
    const routeRunId = route.params.runId;

    const [draft, setDraft] = useState<Activity7RunDraft | null>(null);
    const [bootstrapping, setBootstrapping] = useState(true);

    const hasBootstrappedRef = useRef(false);

    const [sessionLabel, setSessionLabel] = useState('');
    const [participantCountRaw, setParticipantCountRaw] = useState('1');

    const [measurementDurationSecRaw, setMeasurementDurationSecRaw] =
        useState('30');
    const [targetSamplingHzRaw, setTargetSamplingHzRaw] = useState('25');
    const [smoothingWindowSecRaw, setSmoothingWindowSecRaw] = useState('0.6');
    const [minPeakGapMsRaw, setMinPeakGapMsRaw] = useState('1500');

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
                    const existing = getActivity7RunDraft(routeRunId);
                    if (existing) {
                        setDraft(existing);
                        return;
                    }

                    const hydrated = await hydrateActivity7RunDraftFromLocalDb(routeRunId);
                    if (hydrated) {
                        setDraft(hydrated);
                        navigation.setParams({runId: hydrated.runId});
                        return;
                    }

                    const recreated = createActivity7RunDraft({
                        activityId,
                        createdBy: userId,
                        gpsEnabled: true,
                        participantCount: 1,
                        measurementDurationSec: 30,
                        targetSamplingHz: 25,
                        smoothingWindowSec: 0.6,
                        minPeakGapMs: 1500,
                    });
                    setDraft(recreated);
                    navigation.setParams({runId: recreated.runId});
                    return;
                }

                const recoverable = await getLatestRecoverableActivity7RunDraft({
                    activityId,
                    createdBy: userId,
                });

                if (recoverable) {
                    Alert.alert(
                        'Resume previous draft?',
                        'We found an unfinished Activity 7 draft. Would you like to continue it or start a new session?',
                        [
                            {
                                text: 'Start New',
                                style: 'destructive',
                                onPress: async () => {
                                    try {
                                        await discardActivity7RunDraft(recoverable.runId);
                                    } catch (error) {
                                        console.error(
                                            '[A7SessionSetup] Failed to discard old draft',
                                            error,
                                        );
                                    }

                                    const created = createActivity7RunDraft({
                                        activityId,
                                        createdBy: userId,
                                        gpsEnabled: true,
                                        participantCount: 1,
                                        measurementDurationSec: 30,
                                        targetSamplingHz: 25,
                                        smoothingWindowSec: 0.6,
                                        minPeakGapMs: 1500,
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

                const created = createActivity7RunDraft({
                    activityId,
                    createdBy: userId,
                    gpsEnabled: true,
                    participantCount: 1,
                    measurementDurationSec: 30,
                    targetSamplingHz: 25,
                    smoothingWindowSec: 0.6,
                    minPeakGapMs: 1500,
                });
                setDraft(created);
                navigation.setParams({runId: created.runId});
            } catch (error) {
                console.error('[A7SessionSetup] Failed to bootstrap draft', error);

                const fallback = createActivity7RunDraft({
                    activityId,
                    createdBy: userId,
                    gpsEnabled: true,
                    participantCount: 1,
                    measurementDurationSec: 30,
                    targetSamplingHz: 25,
                    smoothingWindowSec: 0.6,
                    minPeakGapMs: 1500,
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
        setParticipantCountRaw(String(draft.session.participantCount ?? 1));

        setMeasurementDurationSecRaw(
            String(draft.session.measurementDurationSec ?? 30),
        );
        setTargetSamplingHzRaw(String(draft.session.targetSamplingHz ?? 25));
        setSmoothingWindowSecRaw(String(draft.session.smoothingWindowSec ?? 0.6));
        setMinPeakGapMsRaw(String(draft.session.minPeakGapMs ?? 1500));

        setGpsEnabled(Boolean(draft.session.gpsEnabled));
        setGpsPermission(draft.session.gpsPermission ?? 'unknown');
    }, [draft]);

    const participants = draft?.session.participants ?? [];
    const geoCaptured =
        !!draft?.session.geo &&
        isFiniteNumber(draft.session.geo.lat) &&
        isFiniteNumber(draft.session.geo.lng);

    const sessionError = useMemo(() => {
        if (!draft) return null;

        const measurementDurationSec = clampInt(
            Number(digitsOnly(measurementDurationSecRaw || '30')),
            10,
            120,
        );

        const participantCount = clampInt(
            Number(digitsOnly(participantCountRaw || '1')),
            1,
            6,
        );

        const targetSamplingHz = clampNum(Number(targetSamplingHzRaw || '25'), 1, 500);

        const smoothingWindowSec = clampNum(
            Number(smoothingWindowSecRaw || '0.6'),
            0.1,
            5,
        );

        const minPeakGapMs = clampInt(
            Number(digitsOnly(minPeakGapMsRaw || '1500')),
            500,
            10000,
        );

        const shadow: Activity7RunDraft = {
            ...draft,
            session: {
                ...draft.session,
                sessionLabel: sessionLabel.trim() ? sessionLabel.trim() : undefined,
                participantCount,
                measurementDurationSec,
                targetSamplingHz,
                smoothingWindowSec,
                minPeakGapMs,
                gpsEnabled,
                gpsPermission,
            },
        };

        return validateA7Session(shadow);
    }, [
        draft,
        sessionLabel,
        participantCountRaw,
        measurementDurationSecRaw,
        targetSamplingHzRaw,
        smoothingWindowSecRaw,
        minPeakGapMsRaw,
        gpsEnabled,
        gpsPermission,
    ]);

    function persistSessionBase(): Activity7RunDraft | null {
        if (!draft) return null;

        const nextParticipantCount = clampInt(
            parseInt(digitsOnly(participantCountRaw || '1'), 10),
            1,
            6,
        );

        const nextMeasurementDurationSec = clampInt(
            parseInt(digitsOnly(measurementDurationSecRaw || '30'), 10),
            10,
            120,
        );

        const nextTargetSamplingHz = clampNum(
            parseFloat(targetSamplingHzRaw || '25'),
            1,
            500,
        );

        const nextSmoothingWindowSec = clampNum(
            parseFloat(smoothingWindowSecRaw || '0.6'),
            0.1,
            5,
        );

        const nextMinPeakGapMs = clampInt(
            parseInt(digitsOnly(minPeakGapMsRaw || '1500'), 10),
            500,
            10000,
        );

        const next = updateActivity7Session(draft.runId, {
            sessionLabel: trimOrEmpty(sessionLabel) || undefined,
            participantCount: nextParticipantCount,
            participants: draft.session.participants,
            measurementDurationSec: nextMeasurementDurationSec,
            targetSamplingHz: nextTargetSamplingHz,
            smoothingWindowSec: nextSmoothingWindowSec,
            minPeakGapMs: nextMinPeakGapMs,
            gpsEnabled,
            geo: gpsEnabled ? draft.session.geo : undefined,
            gpsPermission,
        });

        setDraft(next);
        return next;
    }

    function onRenameParticipant(participantId: string, name: string) {
        if (!draft) return;

        const next = updateActivity7Participant(draft.runId, participantId, {name});
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

        const afterCount = updateActivity7Session(draft.runId, {
            participantCount: currentCount + 1,
        });

        const appended =
            afterCount.session.participants?.[afterCount.session.participants.length - 1];

        if (!appended?.id) {
            setDraft(afterCount);
            setNewParticipantName('');
            setParticipantCountRaw(String(afterCount.session.participantCount));
            return;
        }

        const afterRename = updateActivity7Participant(afterCount.runId, appended.id, {
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
                    const filtered: A7ParticipantDraft[] = (
                        draft.session.participants ?? []
                    ).filter((p) => p.id !== participantId);

                    const next = updateActivity7Session(draft.runId, {
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

    function onToggleGps(nextVal: boolean) {
        setGpsEnabled(nextVal);

        if (!draft) return;

        const next = updateActivity7Session(draft.runId, {
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

                const nextPerm = updateActivity7Session(draft.runId, {
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

            const next = updateActivity7Session(draft.runId, {
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

    async function onContinue() {
        if (!user || !draft) return;

        const persisted = persistSessionBase();
        if (!persisted) return;

        const err = validateA7Session(persisted);
        if (err) {
            showToast('Check setup', err, 'danger');
            return;
        }

        const canContinue = await confirmBatteryBeforeActivity({
            activityId,
            activityTitle: 'Activity 7: Breathing Pace Trainer',
            intensity: 'HIGH',
        });

        if (!canContinue) return;

        navigation.navigate('A7Prediction', {
            activityId,
            runId: persisted.runId,
        });
    }

    if (!user) return null;

    if (bootstrapping || !draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Checking for unfinished Activity 7 session..."/>
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
                    <AppBadge label="Activity 7" tone="info"/>

                    <AppText variant="title" style={styles.title}>
                        Breathing Setup
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Configure participants, measurement timing, breathing-signal settings, and GPS evidence before
                        prediction.
                    </AppText>
                </View>

                <InfoBanner
                    title="Breathing pace trainer"
                    message="Each participant completes rest, post-jog, and post-star-jumps breathing phases using consistent measurement settings."
                    tone="info"
                />

                <AppSectionHeader
                    title="Session"
                    subtitle="Use a clear label so your team can identify this breathing run later."
                />

                <AppCard>
                    <AppInput
                        label="Session label"
                        value={sessionLabel}
                        onChangeText={setSessionLabel}
                        placeholder="e.g. Week 7 – Breathing Pace Trainer"
                    />
                </AppCard>

                <AppSectionHeader
                    title="Participants"
                    subtitle="Each participant must complete the required breathing phases."
                />

                <AppCard>
                    <AppInput
                        label="Participant count (1–6)"
                        value={participantCountRaw}
                        onChangeText={(t) => setParticipantCountRaw(digitsOnly(t))}
                        keyboardType="number-pad"
                        placeholder="e.g. 3"
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
                            message="Add at least one participant before measuring breathing phases."
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
                </AppCard>

                <AppSectionHeader
                    title="Measurement Settings"
                    subtitle="Keep values consistent across participants for fair comparison."
                />

                <AppCard>
                    <AppInput
                        label="Measurement duration"
                        value={measurementDurationSecRaw}
                        onChangeText={(t) => setMeasurementDurationSecRaw(digitsOnly(t))}
                        keyboardType="number-pad"
                        placeholder="30"
                    />

                    <AppText variant="caption" color="textMuted">
                        Recommended range: 10–120 seconds.
                    </AppText>

                    <View style={styles.grid}>
                        <View style={styles.gridCol}>
                            <AppInput
                                label="Sampling rate"
                                value={targetSamplingHzRaw}
                                onChangeText={(t) => setTargetSamplingHzRaw(digitsAndSingleDot(t))}
                                keyboardType="decimal-pad"
                                placeholder="25"
                                containerStyle={styles.blockGap}
                            />

                            <AppText variant="caption" color="textMuted">
                                1–500 Hz
                            </AppText>
                        </View>

                        <View style={styles.gridCol}>
                            <AppInput
                                label="Smoothing window"
                                value={smoothingWindowSecRaw}
                                onChangeText={(t) => setSmoothingWindowSecRaw(digitsAndSingleDot(t))}
                                keyboardType="decimal-pad"
                                placeholder="0.6"
                                containerStyle={styles.blockGap}
                            />

                            <AppText variant="caption" color="textMuted">
                                0.1–5 sec
                            </AppText>
                        </View>
                    </View>

                    <AppInput
                        label="Minimum gap between breathing peaks"
                        value={minPeakGapMsRaw}
                        onChangeText={(t) => setMinPeakGapMsRaw(digitsOnly(t))}
                        keyboardType="number-pad"
                        placeholder="1500"
                        containerStyle={styles.blockGap}
                    />

                    <AppText variant="caption" color="textMuted">
                        Use a realistic peak gap to reduce unstable breathing-cycle counting.
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

    settingRow: {
        marginTop: spacing.sm,
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