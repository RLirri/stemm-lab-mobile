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
    createActivity4RunDraft,
    discardActivity4RunDraft,
    getActivity4RunDraft,
    getLatestRecoverableActivity4RunDraft,
    hydrateActivity4RunDraftFromLocalDb,
    updateActivity4Session,
    updateActivity4Design,
    validateA4Session,
    type Activity4RunDraft,
    type A4MaterialContext,
} from '../../../store/activity4RunDraftStore';
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

type Props = NativeStackScreenProps<AppStackParamList, 'A4SessionSetup'>;

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

function formatGeoText(geo: Activity4RunDraft['session']['geo'] | undefined): string {
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
        const acc = pos?.coords?.accuracy ?? undefined;

        const accuracyM =
            typeof acc === 'number' && Number.isFinite(acc) ? acc : undefined;

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

        return {
            lat,
            lng,
            accuracyM,
        };
    } catch {
        return null;
    }
}

export default function A4SessionSetupScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;
    const routeRunId = route.params.runId;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);
    const [bootstrapping, setBootstrapping] = useState(true);

    const hasBootstrappedRef = useRef(false);

    const [surface, setSurface] = useState<A4MaterialContext | undefined>(undefined);
    const [designCountRaw, setDesignCountRaw] = useState<string>('3');

    const [gpsEnabled, setGpsEnabled] = useState<boolean>(true);
    const [gpsPermission, setGpsPermission] = useState<
        'unknown' | 'granted' | 'denied'
    >('unknown');
    const [askingGps, setAskingGps] = useState(false);

    const [toast, setToast] = useState<{
        visible: boolean;
        title: string;
        message?: string;
        tone?: ToastTone;
    }>({
        visible: false,
        title: '',
    });

    const geo = draft?.session.geo;
    const geoCaptured = !!geo && isFiniteNumber(geo.lat) && isFiniteNumber(geo.lng);

    const [expanded, setExpanded] = useState<Record<number, boolean>>({0: true});

    function showToast(
        title: string,
        message?: string,
        tone: ToastTone = 'info',
    ) {
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
                    const existing = getActivity4RunDraft(routeRunId);
                    if (existing) {
                        setDraft(existing);
                        return;
                    }

                    const hydrated = await hydrateActivity4RunDraftFromLocalDb(routeRunId);
                    if (hydrated) {
                        setDraft(hydrated);
                        navigation.setParams({runId: hydrated.runId});
                        return;
                    }

                    const recreated = createActivity4RunDraft({
                        activityId,
                        createdBy: userId,
                        designCount: 3,
                        gpsEnabled: true,
                    });
                    setDraft(recreated);
                    navigation.setParams({runId: recreated.runId});
                    return;
                }

                const recoverable = await getLatestRecoverableActivity4RunDraft({
                    activityId,
                    createdBy: userId,
                });

                if (recoverable) {
                    Alert.alert(
                        'Resume previous draft?',
                        'We found an unfinished Activity 4 draft. Would you like to continue it or start a new session?',
                        [
                            {
                                text: 'Start New',
                                style: 'destructive',
                                onPress: async () => {
                                    try {
                                        await discardActivity4RunDraft(recoverable.runId);
                                    } catch (error) {
                                        console.error(
                                            '[A4SessionSetup] Failed to discard old draft',
                                            error,
                                        );
                                    }

                                    const created = createActivity4RunDraft({
                                        activityId,
                                        createdBy: userId,
                                        designCount: 3,
                                        gpsEnabled: true,
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

                const created = createActivity4RunDraft({
                    activityId,
                    createdBy: userId,
                    designCount: 3,
                    gpsEnabled: true,
                });
                setDraft(created);
                navigation.setParams({runId: created.runId});
            } catch (error) {
                console.error('[A4SessionSetup] Failed to bootstrap draft', error);

                const fallback = createActivity4RunDraft({
                    activityId,
                    createdBy: userId,
                    designCount: 3,
                    gpsEnabled: true,
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

        setSurface(draft.session.surfaceContext);
        setDesignCountRaw(String(draft.session.designCount));

        setGpsEnabled(Boolean(draft.session.gpsEnabled));
        setGpsPermission(draft.session.gpsPermission);

        const nextExp: Record<number, boolean> = {};
        for (let i = 0; i < Math.min(3, draft.session.designCount); i++) {
            nextExp[i] = true;
        }
        setExpanded((prev) => ({...nextExp, ...prev}));
    }, [draft]);

    useEffect(() => {
        if (!draft) return;

        if (gpsEnabled === false) {
            const next = updateActivity4Session(draft.runId, {
                gpsEnabled: false,
                geo: undefined,
            });
            setDraft(next);
        }

        if (gpsEnabled === true) {
            const next = updateActivity4Session(draft.runId, {gpsEnabled: true});
            setDraft(next);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gpsEnabled]);

    const sessionError = useMemo(() => {
        if (!draft) return null;

        const designCount = clampInt(Number(designCountRaw || '3'), 3, 8);

        const shadow: Activity4RunDraft = {
            ...draft,
            session: {
                ...draft.session,
                surfaceContext: surface,
                designCount,
                gpsEnabled,
                gpsPermission,
            },
        };

        return validateA4Session(shadow);
    }, [designCountRaw, draft, gpsEnabled, gpsPermission, surface]);

    function persistSession(): Activity4RunDraft | null {
        if (!draft) return null;

        const designCount = clampInt(Number(designCountRaw || '3'), 3, 8);

        const next = updateActivity4Session(draft.runId, {
            surfaceContext: surface,
            designCount,
            gpsEnabled,
            gpsPermission,
        });

        setDraft(next);
        return next;
    }

    async function onRequestGpsPermissionOnly() {
        if (!draft) return;

        if (!gpsEnabled) {
            showToast(
                'GPS is off',
                'Enable GPS first if you want to request permission.',
                'warning',
            );
            return;
        }

        try {
            setAskingGps(true);
            const status = await requestGpsPermissionSafe();

            const next = updateActivity4Session(draft.runId, {
                gpsPermission: status,
            });

            setDraft(next);
            setGpsPermission(next.session.gpsPermission);

            if (status !== 'granted') {
                showToast(
                    'GPS not granted',
                    'You can still run the activity, but submission requires GPS permission and a saved coordinate.',
                    'warning',
                );
            } else {
                showToast(
                    'GPS permission granted',
                    'You can now capture your location coordinate.',
                    'success',
                );
            }
        } finally {
            setAskingGps(false);
        }
    }

    async function onCaptureLocation() {
        if (!draft) return;

        if (!gpsEnabled) {
            showToast(
                'GPS is off',
                'Enable GPS first, then capture location.',
                'warning',
            );
            return;
        }

        try {
            setAskingGps(true);

            let status = gpsPermission;
            if (status === 'unknown' || status === 'denied') {
                status = await requestGpsPermissionSafe();
                const nextPermission = updateActivity4Session(draft.runId, {
                    gpsPermission: status,
                });
                setDraft(nextPermission);
                setGpsPermission(status);
            }

            if (status !== 'granted') {
                Alert.alert(
                    'Permission denied',
                    'Location permission is required to capture coordinates. Please enable it in your device settings.',
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

            const next = updateActivity4Session(draft.runId, {
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
            setAskingGps(false);
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
            activityTitle: 'Activity 4: Earthquake Resistant Structure',
            intensity: gpsEnabled || geoCaptured ? 'HIGH' : 'MEDIUM',
        });

        if (!canContinue) return;

        const next = persistSession();
        if (!next) return;

        navigation.navigate('A4Prediction', {activityId, runId: next.runId});
    }

    function toggleExpanded(i: number) {
        setExpanded((prev) => ({...prev, [i]: !prev[i]}));
    }

    function onDesignFieldChange(
        designIndex: number,
        patch: {
            name?: string;
            foldCount?: number;
            pillarCount?: number;
            layers?: number;
            notes?: string;
        },
    ) {
        if (!draft) return;

        const next = updateActivity4Design(draft.runId, designIndex, patch);
        setDraft(next);
    }

    if (!user) return null;

    if (bootstrapping || !draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Checking for unfinished Activity 4 session..."/>
            </AppGradientScreen>
        );
    }

    const designs = draft.session.designs ?? [];

    return (
        <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <AppGradientScreen>
                <View style={styles.header}>
                    <AppBadge label="Activity 4" tone="warning"/>

                    <AppText variant="title" style={styles.title}>
                        Earthquake Setup
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Configure your structure designs, material context, and GPS evidence before prediction.
                    </AppText>
                </View>

                <InfoBanner
                    title="Design comparison activity"
                    message="Build at least 3 structure designs, predict stability, then run vibration measurements for comparison."
                    tone="info"
                />

                <AppSectionHeader
                    title="Material Context"
                    subtitle="Material choice affects vibration transfer and structural movement."
                />

                <AppCard>
                    <AppText variant="bodyStrong">Test material</AppText>

                    <View style={styles.segmentWrap}>
                        {(['paper', 'plastic'] as const).map((v) => (
                            <SegmentButton
                                key={v}
                                label={v}
                                active={surface === v}
                                onPress={() => setSurface(v)}
                            />
                        ))}

                        <SegmentButton
                            label="Not sure"
                            active={!surface}
                            onPress={() => setSurface(undefined)}
                        />
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Design Count"
                    subtitle="Minimum 3 designs are required for a meaningful comparison."
                />

                <AppCard>
                    <AppInput
                        label="Number of designs (3–8)"
                        value={designCountRaw}
                        onChangeText={(t) => setDesignCountRaw(digitsOnly(t))}
                        placeholder="3"
                        keyboardType="number-pad"
                        maxLength={1}
                    />

                    <AppText variant="caption" color="textMuted">
                        Tip: Keep it realistic — you will run a 10-second vibration test for each design.
                    </AppText>
                </AppCard>

                <AppSectionHeader
                    title="Design Builder"
                    subtitle="Record structure parameters so your results and reflection are meaningful."
                />

                {designs.map((d, i) => {
                    const isOpen = Boolean(expanded[i]);

                    return (
                        <AppCard key={i}>
                            <Pressable onPress={() => toggleExpanded(i)} style={styles.designHeader}>
                                <View style={styles.designHeaderText}>
                                    <AppBadge label={`Design ${i + 1}`} tone="info"/>

                                    <AppText variant="sectionTitle" style={styles.designTitle}>
                                        {d.name?.trim() ? d.name : `Design ${i + 1}`}
                                    </AppText>

                                    <AppText variant="caption" color="textMuted" style={styles.designMeta}>
                                        Folds: {d.foldCount ?? '—'} • Pillars: {d.pillarCount ?? '—'} • Layers:{' '}
                                        {d.layers ?? '—'}
                                    </AppText>
                                </View>

                                <AppText variant="subtitle" color="textMuted">
                                    {isOpen ? '▾' : '▸'}
                                </AppText>
                            </Pressable>

                            {isOpen ? (
                                <View style={styles.designBody}>
                                    <AppInput
                                        label="Design name"
                                        value={d.name ?? ''}
                                        onChangeText={(t) => onDesignFieldChange(i, {name: t})}
                                        placeholder={`Design ${i + 1}`}
                                    />

                                    <View style={styles.grid}>
                                        <View style={styles.gridCol}>
                                            <AppInput
                                                label="Fold count"
                                                value={d.foldCount == null ? '' : String(d.foldCount)}
                                                onChangeText={(t) =>
                                                    onDesignFieldChange(i, {
                                                        foldCount: clampInt(Number(digitsOnly(t) || '0'), 0, 60),
                                                    })
                                                }
                                                placeholder="e.g. 10"
                                                keyboardType="number-pad"
                                            />

                                            <AppText variant="caption" color="textMuted">
                                                0–60 folds
                                            </AppText>
                                        </View>

                                        <View style={styles.gridCol}>
                                            <AppInput
                                                label="Pillar count"
                                                value={d.pillarCount == null ? '' : String(d.pillarCount)}
                                                onChangeText={(t) =>
                                                    onDesignFieldChange(i, {
                                                        pillarCount: clampInt(Number(digitsOnly(t) || '0'), 0, 30),
                                                    })
                                                }
                                                placeholder="e.g. 4"
                                                keyboardType="number-pad"
                                            />

                                            <AppText variant="caption" color="textMuted">
                                                0–30 pillars
                                            </AppText>
                                        </View>
                                    </View>

                                    <AppInput
                                        label="Layers"
                                        value={d.layers == null ? '' : String(d.layers)}
                                        onChangeText={(t) =>
                                            onDesignFieldChange(i, {
                                                layers: clampInt(Number(digitsOnly(t) || '1'), 1, 10),
                                            })
                                        }
                                        placeholder="e.g. 2"
                                        keyboardType="number-pad"
                                    />

                                    <AppInput
                                        label="Notes"
                                        value={d.notes ?? ''}
                                        onChangeText={(t) => onDesignFieldChange(i, {notes: t})}
                                        placeholder="e.g. thicker base, wider pillars, extra tape..."
                                        multiline
                                        style={styles.notesInput}
                                    />
                                </View>
                            ) : null}
                        </AppCard>
                    );
                })}

                <AppSectionHeader
                    title="GPS Evidence"
                    subtitle="Required before final submission."
                />

                <AppCard>
                    <View style={styles.settingRow}>
                        <View style={styles.settingText}>
                            <AppText variant="bodyStrong">Enable GPS</AppText>
                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                Turn on GPS before requesting permission or capturing a coordinate.
                            </AppText>
                        </View>

                        <Switch value={gpsEnabled} onValueChange={setGpsEnabled}/>
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
                        value={!gpsEnabled ? 'GPS off' : geoCaptured ? 'Captured' : 'Not captured'}
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
                        title={askingGps ? 'Processing...' : 'Request GPS Permission'}
                        onPress={onRequestGpsPermissionOnly}
                        disabled={askingGps}
                        variant="outline"
                        style={styles.blockGap}
                    />

                    <AppButton
                        title={
                            askingGps
                                ? 'Capturing...'
                                : geoCaptured
                                    ? 'Refresh Location'
                                    : 'Capture Location'
                        }
                        onPress={onCaptureLocation}
                        disabled={askingGps || !gpsEnabled}
                        variant="outline"
                        style={styles.smallButtonGap}
                    />

                    {askingGps ? (
                        <View style={styles.loadingInline}>
                            <ActivityIndicator color={colors.primary}/>
                            <AppText variant="caption" color="textMuted">
                                Waiting for GPS response...
                            </AppText>
                        </View>
                    ) : null}

                    {gpsPermission === 'denied' ? (
                        <InfoBanner
                            title="GPS denied"
                            message="Enable location permissions in device settings, then try again."
                            tone="warning"
                        />
                    ) : null}

                    {!gpsEnabled ? (
                        <InfoBanner
                            title="GPS is off"
                            message="Turn GPS on if you want to capture coordinates for submission."
                            tone="warning"
                        />
                    ) : null}
                </AppCard>

                {sessionError ? (
                    <InfoBanner title="Fix before continuing" message={sessionError} tone="danger"/>
                ) : null}

                <AppButton title="Continue to Prediction" onPress={onContinue}/>

                <AppText variant="caption" color="textMuted" style={styles.footerHint}>
                    Next: Prediction → Measurements → Results → Reflection & Submit.
                </AppText>

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

type SegmentButtonProps = {
    label: string;
    active: boolean;
    onPress: () => void;
};

function SegmentButton({label, active, onPress}: SegmentButtonProps) {
    return (
        <Pressable
            onPress={onPress}
            style={[styles.segmentButton, active && styles.segmentButtonActive]}
        >
            <AppText
                variant="caption"
                color={active ? 'inverseText' : 'text'}
                align="center"
                style={styles.segmentText}
            >
                {label}
            </AppText>
        </Pressable>
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

    segmentWrap: {
        marginTop: spacing.md,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    segmentButton: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },

    segmentButtonActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    segmentText: {
        textTransform: 'capitalize',
    },

    designHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    designHeaderText: {
        flex: 1,
        paddingRight: spacing.md,
    },

    designTitle: {
        marginTop: spacing.sm,
    },

    designMeta: {
        marginTop: spacing.xs,
    },

    designBody: {
        marginTop: spacing.lg,
    },

    grid: {
        flexDirection: 'row',
        gap: spacing.md,
    },

    gridCol: {
        flex: 1,
    },

    notesInput: {
        minHeight: 90,
        textAlignVertical: 'top',
    },

    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        marginBottom: spacing.md,
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

    smallButtonGap: {
        marginTop: spacing.md,
    },

    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.md,
        marginTop: spacing.md,
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

    footerHint: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});