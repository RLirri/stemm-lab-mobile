// src/screens/Activities/Activity2/A2MeasurementScreen.tsx

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View,} from 'react-native';
import * as Location from 'expo-location';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';

import {
    type A2GpsPoint,
    type Activity2RunDraft,
    addA2Measurement,
    getActivity2RunDraft,
    removeA2Measurement,
    setA2Computed,
    updateA2Measurement,
} from '../../../store/activity2RunDraftStore';

import {classifySoundRisk, isValidDbReading, scoreActivity2AverageDb,} from '../../../services/scoringService';
import {measureSoundLevel} from '../../../services/microphoneService';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A2Measurement'>;

type RecordUIState = {
    measurementId: string;
    startedAtMs: number;
    durationSec: number;
    countdownSec: number;
};

type GpsState =
    | { status: 'disabled_in_session' }
    | { status: 'unknown' }
    | { status: 'denied' }
    | { status: 'services_off' }
    | { status: 'ready' };

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function fmtGps(gps?: A2GpsPoint) {
    if (!gps) return 'Not captured';

    const lat = Number.isFinite(gps.lat) ? gps.lat.toFixed(5) : '—';
    const lng = Number.isFinite(gps.lng) ? gps.lng.toFixed(5) : '—';
    const acc =
        typeof gps.accuracyM === 'number' ? ` ±${Math.round(gps.accuracyM)}m` : '';

    return `${lat}, ${lng}${acc}`;
}

function toFiniteOrUndefined(x: unknown): number | undefined {
    return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
}

async function withTimeout<T>(
    p: Promise<T>,
    ms: number,
    label = 'timeout',
): Promise<T> {
    let t: ReturnType<typeof setTimeout> | null = null;

    try {
        return await Promise.race([
            p,
            new Promise<T>((_, reject) => {
                t = setTimeout(() => reject(new Error(label)), ms);
            }),
        ]);
    } finally {
        if (t) clearTimeout(t);
    }
}

export default function A2MeasurementScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity2RunDraft | null>(null);
    const [recording, setRecording] = useState<RecordUIState | null>(null);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [gpsState, setGpsState] = useState<GpsState>({status: 'unknown'});
    const [manualDbById, setManualDbById] = useState<Record<string, string>>({});

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

        const d = getActivity2RunDraft(runId);

        if (!d) {
            Alert.alert('Session expired', 'Please restart the activity.', [
                {
                    text: 'OK',
                    onPress: () => navigation.replace('A2SessionSetup', {activityId}),
                },
            ]);
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    function refreshDraft() {
        const d = getActivity2RunDraft(runId);
        if (d) setDraft(d);
    }

    const gpsEnabled = draft?.session?.gpsEnabled === true;

    async function refreshGpsReadiness(): Promise<GpsState> {
        if (!gpsEnabled) {
            const s: GpsState = {status: 'disabled_in_session'};
            setGpsState(s);
            return s;
        }

        try {
            const servicesOn = await Location.hasServicesEnabledAsync();

            if (!servicesOn) {
                const s: GpsState = {status: 'services_off'};
                setGpsState(s);
                return s;
            }
        } catch {
            // Continue to permission check.
        }

        try {
            const perm = await Location.getForegroundPermissionsAsync();

            if (!perm.granted) {
                const req = await Location.requestForegroundPermissionsAsync();

                if (!req.granted) {
                    const s: GpsState = {status: 'denied'};
                    setGpsState(s);
                    return s;
                }
            }
        } catch {
            const s: GpsState = {status: 'denied'};
            setGpsState(s);
            return s;
        }

        const s: GpsState = {status: 'ready'};
        setGpsState(s);
        return s;
    }

    useEffect(() => {
        void refreshGpsReadiness();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gpsEnabled]);

    async function getBestEffortLocation(): Promise<A2GpsPoint | undefined> {
        const ready = await refreshGpsReadiness();

        if (ready.status !== 'ready') return undefined;

        try {
            const loc = await withTimeout(
                Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                }),
                4500,
                'location_timeout',
            );

            const lat = toFiniteOrUndefined(loc.coords.latitude);
            const lng = toFiniteOrUndefined(loc.coords.longitude);

            if (lat == null || lng == null) return undefined;

            return {
                lat,
                lng,
                accuracyM: toFiniteOrUndefined(loc.coords.accuracy),
            };
        } catch {
            // Fall back to last known location.
        }

        try {
            const last = await Location.getLastKnownPositionAsync();

            if (!last) return undefined;

            const lat = toFiniteOrUndefined(last.coords.latitude);
            const lng = toFiniteOrUndefined(last.coords.longitude);

            if (lat == null || lng == null) return undefined;

            return {
                lat,
                lng,
                accuracyM: toFiniteOrUndefined(last.coords.accuracy),
            };
        } catch {
            return undefined;
        }
    }

    function onAddAction() {
        addA2Measurement(runId, 'New action');
        refreshDraft();

        showToast(
            'Action added',
            'success',
            'You can now rename it and record a sound measurement.',
        );
    }

    function onRemove(measurementId: string) {
        if (recording?.measurementId === measurementId) return;

        removeA2Measurement(runId, measurementId);
        refreshDraft();

        showToast('Action removed', 'info');
    }

    function applyDbToMeasurement(params: {
        measurementId: string;
        dbAvg: number;
        dbMax?: number;
        durationSec: number;
        gps?: A2GpsPoint;
    }) {
        const {measurementId, dbAvg, dbMax, durationSec, gps} = params;

        const valid = isValidDbReading(dbAvg, durationSec);
        const risk = valid ? classifySoundRisk(dbAvg) : undefined;

        updateA2Measurement(runId, measurementId, {
            dbAvg: valid ? dbAvg : undefined,
            dbMax:
                valid && typeof dbMax === 'number' && Number.isFinite(dbMax)
                    ? dbMax
                    : undefined,
            durationSec,
            isValid: valid,
            riskCategory: risk?.category,
            riskLabel: risk?.label,
            recordedAt: Date.now(),
            gps,
        });

        refreshDraft();
    }

    function clearCountdownTimer() {
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
        }
    }

    async function onRecord(measurementId: string) {
        if (!draft) return;
        if (recording) return;

        const durationSec = 3;

        try {
            const startedAtMs = Date.now();

            setRecording({
                measurementId,
                startedAtMs,
                durationSec,
                countdownSec: durationSec,
            });

            clearCountdownTimer();

            countdownTimerRef.current = setInterval(() => {
                setRecording((prev) => {
                    if (!prev) return prev;

                    const elapsed = (Date.now() - prev.startedAtMs) / 1000;
                    const left = Math.max(0, Math.ceil(prev.durationSec - elapsed));

                    return {
                        ...prev,
                        countdownSec: left,
                    };
                });
            }, 200);

            const gps = await getBestEffortLocation();

            const reading = await measureSoundLevel({
                durationSec,
                calibrationOffsetDb: 100,
            });

            applyDbToMeasurement({
                measurementId,
                dbAvg: reading.dbAvg,
                dbMax: reading.dbMax,
                durationSec: reading.durationSec,
                gps,
            });

            if (gpsEnabled && !gps) {
                showToast(
                    'Sound recorded without GPS',
                    'warning',
                    'Location was not available. You can retry GPS for this action.',
                );
            } else {
                showToast(
                    'Sound measurement saved',
                    'success',
                    gps ? 'dB and GPS were captured.' : 'dB value was captured.',
                );
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Failed to record sound.';
            Alert.alert('Recording failed', msg);
        } finally {
            clearCountdownTimer();
            setRecording(null);
        }
    }

    async function onSaveManualDb(measurementId: string) {
        const raw = manualDbById[measurementId] ?? '';
        const n = Number(raw);

        if (!Number.isFinite(n)) {
            Alert.alert('Invalid dB', 'Please enter a valid number, for example 72.');
            return;
        }

        const gps = await getBestEffortLocation();

        applyDbToMeasurement({
            measurementId,
            dbAvg: n,
            durationSec: 3,
            gps,
        });

        if (gpsEnabled && !gps) {
            showToast(
                'Manual dB saved without GPS',
                'warning',
                'Location was not available. You can retry GPS for this action.',
            );
        } else {
            showToast(
                'Manual dB saved',
                'success',
                gps ? 'dB and GPS were saved.' : 'dB value was saved.',
            );
        }
    }

    async function onRetryGps(measurementId: string) {
        if (!draft) return;
        if (recording) return;

        const gps = await getBestEffortLocation();

        if (!gps) {
            const s = gpsState.status;

            const hint =
                s === 'services_off'
                    ? 'Location services are off.'
                    : s === 'denied'
                        ? 'Location permission is denied.'
                        : 'Location is not available yet.';

            showToast('GPS still unavailable', 'warning', hint);
            return;
        }

        updateA2Measurement(runId, measurementId, {gps});
        refreshDraft();

        showToast('GPS updated', 'success', fmtGps(gps));
    }

    const validCount = useMemo(
        () => draft?.actions.filter((a) => a.isValid).length ?? 0,
        [draft],
    );

    const gpsHint = useMemo(() => {
        if (!gpsEnabled) return 'GPS is disabled in Session Setup.';

        if (gpsState.status === 'services_off') {
            return 'Location services are off. Turn on Location on your phone.';
        }

        if (gpsState.status === 'denied') {
            return 'Location permission is denied. Enable it in settings and retry.';
        }

        if (gpsState.status === 'ready') {
            return 'GPS will be attached automatically if available.';
        }

        return 'Checking GPS status.';
    }, [gpsEnabled, gpsState.status]);

    function onContinue() {
        if (!draft) return;

        const {score, validCount: vc} = scoreActivity2AverageDb(draft.actions);

        if (vc < 3) {
            Alert.alert(
                'Minimum requirement',
                'You must record at least 3 valid measurements.',
            );
            return;
        }

        setA2Computed(runId, {
            validCount: vc,
            avgDb: score,
            score,
            updatedAt: Date.now(),
        });

        showToast(
            'Measurements ready',
            'success',
            'Opening the sound map.',
        );

        setTimeout(() => {
            navigation.navigate('A2Map', {activityId, runId});
        }, 700);
    }

    useEffect(() => {
        return () => clearCountdownTimer();
    }, []);

    if (!user) return null;

    if (!draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading measurement draft..."/>
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
                    <AppBadge label="Activity 2" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Measurements
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Record at least three valid sound actions. {gpsHint}
                    </AppText>
                </View>

                <InfoBanner
                    title="Sound measurement guidance"
                    message="Phone microphone dB readings are approximate. Use the same device per team for fair comparison."
                    tone="info"
                />

                {gpsEnabled && gpsState.status !== 'ready' ? (
                    <InfoBanner
                        title="GPS status"
                        message={gpsHint}
                        tone="warning"
                    />
                ) : null}

                {gpsEnabled && gpsState.status !== 'ready' ? (
                    <AppButton
                        title="Re-check GPS"
                        variant="outline"
                        onPress={() => {
                            void refreshGpsReadiness().then((state) => {
                                showToast(
                                    state.status === 'ready' ? 'GPS ready' : 'GPS checked',
                                    state.status === 'ready' ? 'success' : 'warning',
                                    state.status === 'ready'
                                        ? 'Location can now be attached to measurements.'
                                        : gpsHint,
                                );
                            });
                        }}
                        style={styles.gpsButton}
                    />
                ) : null}

                <AppSectionHeader
                    title="Sound Actions"
                    subtitle="Record or manually enter dB values for each classroom action."
                />

                {draft.actions.map((a, index) => {
                    const busy = recording?.measurementId === a.id;
                    const hasDb = typeof a.dbAvg === 'number' && Number.isFinite(a.dbAvg);

                    return (
                        <AppCard key={a.id}>
                            <View style={styles.cardHeader}>
                                <View style={styles.cardHeaderText}>
                                    <AppText variant="sectionTitle">Action {index + 1}</AppText>

                                    <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                        Rename the action, then record or manually save its average dB.
                                    </AppText>
                                </View>

                                <AppBadge
                                    label={a.isValid ? 'Valid' : hasDb ? 'Invalid' : 'Pending'}
                                    tone={a.isValid ? 'success' : hasDb ? 'danger' : 'warning'}
                                />
                            </View>

                            <AppInput
                                label="Action label"
                                value={a.actionLabel}
                                onChangeText={(t) => {
                                    updateA2Measurement(runId, a.id, {actionLabel: t});
                                    refreshDraft();
                                }}
                                placeholder="e.g. Drop a book"
                                editable={!busy}
                            />

                            <View style={styles.recordBox}>
                                <View style={styles.recordText}>
                                    <AppText variant="bodyStrong">Microphone recording</AppText>
                                    <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                        Capture a 3-second sound sample.
                                    </AppText>
                                </View>

                                <Pressable
                                    onPress={() => void onRecord(a.id)}
                                    disabled={busy || !!recording}
                                    style={[
                                        styles.recordButton,
                                        (busy || !!recording) && styles.disabledButton,
                                    ]}
                                >
                                    {busy ? (
                                        <View style={styles.inlineRow}>
                                            <ActivityIndicator color={colors.inverseText}/>
                                            <AppText variant="caption" color="inverseText">
                                                {recording?.countdownSec ?? 0}s
                                            </AppText>
                                        </View>
                                    ) : (
                                        <AppText variant="caption" color="inverseText">
                                            Record
                                        </AppText>
                                    )}
                                </Pressable>
                            </View>

                            <AppText variant="caption" color="textMuted" style={styles.helpText}>
                                Keep the phone distance and position as consistent as possible.
                            </AppText>

                            <View style={styles.manualRow}>
                                <View style={styles.manualInput}>
                                    <AppInput
                                        label="Manual dB fallback"
                                        keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                                        placeholder="Avg dB, e.g. 72"
                                        value={manualDbById[a.id] ?? ''}
                                        onChangeText={(t) =>
                                            setManualDbById((m) => ({
                                                ...m,
                                                [a.id]: t,
                                            }))
                                        }
                                        editable={!busy}
                                    />
                                </View>

                                <AppButton
                                    title="Save"
                                    variant="outline"
                                    onPress={() => void onSaveManualDb(a.id)}
                                    disabled={busy}
                                    fullWidth={false}
                                    style={styles.saveButton}
                                />
                            </View>

                            <View style={styles.metaBox}>
                                <MetricRow label="GPS" value={fmtGps(a.gps)}/>

                                <MetricRow
                                    label="Status"
                                    value={a.isValid ? 'Valid' : hasDb ? 'Invalid' : 'Not recorded'}
                                />
                            </View>

                            {gpsEnabled ? (
                                <AppButton
                                    title="Retry GPS for This Action"
                                    variant="ghost"
                                    onPress={() => void onRetryGps(a.id)}
                                    disabled={busy || !!recording}
                                    style={styles.retryButton}
                                />
                            ) : null}

                            {a.isValid ? (
                                <View style={styles.resultBox}>
                                    <AppText variant="bodyStrong">
                                        {a.dbAvg?.toFixed(1)} dB
                                    </AppText>

                                    <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                        {a.riskLabel ?? 'Risk unknown'}
                                    </AppText>

                                    {typeof a.dbMax === 'number' ? (
                                        <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                            Max: {a.dbMax.toFixed(1)} dB
                                        </AppText>
                                    ) : null}
                                </View>
                            ) : null}

                            <AppButton
                                title="Remove Action"
                                variant="danger"
                                onPress={() => onRemove(a.id)}
                                disabled={busy || !!recording}
                                style={styles.removeButton}
                            />
                        </AppCard>
                    );
                })}

                <AppButton
                    title="Add Action"
                    variant="outline"
                    onPress={onAddAction}
                    disabled={!!recording}
                />

                <View style={styles.progressBox}>
                    <AppText variant="bodyStrong">Valid measurements</AppText>

                    <AppBadge
                        label={`${validCount} / 3 minimum`}
                        tone={validCount >= 3 ? 'success' : 'warning'}
                    />
                </View>

                <AppButton
                    title="Continue to Map"
                    onPress={onContinue}
                    disabled={!!recording}
                    style={styles.continueButton}
                />

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

type MetricRowProps = {
    label: string;
    value: string;
};

function MetricRow({label, value}: MetricRowProps) {
    return (
        <View style={styles.metricRow}>
            <AppText variant="caption" color="textMuted" style={styles.metricLabel}>
                {label}
            </AppText>

            <AppText variant="caption" align="right" style={styles.metricValue}>
                {value}
            </AppText>
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

    gpsButton: {
        marginBottom: spacing.md,
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

    recordBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    recordText: {
        flex: 1,
    },

    recordButton: {
        minWidth: 86,
        minHeight: 44,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.md,
    },

    disabledButton: {
        opacity: 0.65,
    },

    inlineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },

    helpText: {
        marginTop: spacing.md,
    },

    manualRow: {
        marginTop: spacing.md,
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: spacing.md,
    },

    manualInput: {
        flex: 1,
    },

    saveButton: {
        minWidth: 86,
        marginBottom: spacing.md,
    },

    metaBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        gap: spacing.sm,
    },

    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    metricLabel: {
        flex: 1,
    },

    metricValue: {
        flex: 2,
    },

    retryButton: {
        marginTop: spacing.sm,
    },

    resultBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing.md,
    },

    removeButton: {
        marginTop: spacing.md,
    },

    progressBox: {
        marginTop: spacing.lg,
        marginBottom: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    continueButton: {
        marginTop: spacing.sm,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});