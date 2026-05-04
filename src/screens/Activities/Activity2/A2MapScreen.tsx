// src/screens/Activities/Activity2/A2MapScreen.tsx

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {
    Alert,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';

import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {useFocusEffect} from '@react-navigation/native';

import MapView, {
    Marker,
    PROVIDER_DEFAULT,
    type Region,
} from 'react-native-maps';

import * as Location from 'expo-location';

import type {AppStackParamList} from '../../../navigation/AppStack';

import {auth} from '../../../services/firebase';

import {
    getActivity2RunDraft,
    type A2GpsPoint,
    type Activity2RunDraft,
} from '../../../store/activity2RunDraftStore';

import {
    SOUND_RISK_BANDS,
    type SoundRiskCategory,
} from '../../../services/scoringService';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppSectionHeader,
    AppStatusToast,
    AppText,
    InfoBanner,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A2Map'>;

type RiskFilter = SoundRiskCategory | 'ALL';
type ActionFilter = string | 'ALL';

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function isFiniteNumber(x: unknown): x is number {
    return typeof x === 'number' && Number.isFinite(x);
}

function hasGps(gps: unknown): gps is A2GpsPoint {
    if (!gps || typeof gps !== 'object') return false;

    const g = gps as any;

    return isFiniteNumber(g.lat) && isFiniteNumber(g.lng);
}

function safeRegionFromPoints(
    points: Array<{ lat: number; lng: number }>,
): Region {
    const avgLat =
        points.reduce((s, p) => s + p.lat, 0) / points.length;

    const avgLng =
        points.reduce((s, p) => s + p.lng, 0) / points.length;

    return {
        latitude: avgLat,
        longitude: avgLng,
        latitudeDelta: 0.0025,
        longitudeDelta: 0.0025,
    };
}

function riskToPinColor(
    risk?: SoundRiskCategory,
): string | undefined {
    switch (risk) {
        case 'NO_RISK':
        case 'SAFE':
            return 'green';

        case 'FATIGUE':
        case 'POSSIBLE_DAMAGE':
            return 'orange';

        case 'LIKELY_DAMAGE':
        case 'SERIOUS_MINUTES':
            return 'red';

        case 'PAINFUL_IMMEDIATE':
        case 'SEVERE_IMMEDIATE':
        case 'INSTANT_PERMANENT':
            return 'purple';

        default:
            return undefined;
    }
}

export default function A2MapScreen({
                                        route,
                                        navigation,
                                    }: Props) {
    const user = auth.currentUser;

    const {activityId, runId} = route.params;

    const [draft, setDraft] =
        useState<Activity2RunDraft | null>(null);

    const [validOnly, setValidOnly] =
        useState<boolean>(true);

    const [riskFilter, setRiskFilter] =
        useState<RiskFilter>('ALL');

    const [actionFilter, setActionFilter] =
        useState<ActionFilter>('ALL');

    const [gpsPermission, setGpsPermission] = useState<
        'unknown' | 'granted' | 'denied'
    >('unknown');

    const [locationServicesEnabled, setLocationServicesEnabled] =
        useState<boolean | null>(null);

    const mapRef = useRef<MapView | null>(null);

    const [toast, setToast] = useState<ToastState>({
        visible: false,
        title: '',
        message: undefined,
        tone: 'success',
    });

    function showToast(
        title: string,
        tone: ToastTone = 'success',
        message?: string,
    ) {
        setToast({
            visible: true,
            title,
            message,
            tone,
        });
    }

    const refreshDraft = useCallback(() => {
        const d = getActivity2RunDraft(runId);
        setDraft(d ?? null);
    }, [runId]);

    useEffect(() => {
        if (!user) return;

        const d = getActivity2RunDraft(runId);

        if (!d) {
            Alert.alert(
                'Session expired',
                'Please restart the activity.',
            );

            navigation.replace('A2SessionSetup', {
                activityId,
            });

            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    useFocusEffect(
        useCallback(() => {
            if (!user) return;

            refreshDraft();
        }, [refreshDraft, user]),
    );

    const gpsEnabled = Boolean(
        draft?.session?.gpsEnabled,
    );

    const refreshGpsDiagnostics = useCallback(async () => {
        if (!gpsEnabled) {
            setGpsPermission('unknown');
            setLocationServicesEnabled(null);
            return;
        }

        try {
            const servicesOn =
                await Location.hasServicesEnabledAsync();

            setLocationServicesEnabled(servicesOn);

            const perm =
                await Location.getForegroundPermissionsAsync();

            setGpsPermission(
                perm.status === 'granted'
                    ? 'granted'
                    : 'denied',
            );
        } catch {
            setLocationServicesEnabled(null);
            setGpsPermission('unknown');
        }
    }, [gpsEnabled]);

    useEffect(() => {
        void refreshGpsDiagnostics();
    }, [refreshGpsDiagnostics]);

    const actionOptions = useMemo(() => {
        if (!draft) return [];

        const labels = draft.actions
            .map((a) =>
                typeof a.actionLabel === 'string'
                    ? a.actionLabel.trim()
                    : '',
            )
            .filter((x) => x.length > 0);

        return Array.from(new Set(labels));
    }, [draft]);

    const riskOptions = useMemo(() => {
        const seen = new Set<string>();

        const result: Array<{
            key: SoundRiskCategory;
            label: string;
        }> = [];

        for (const b of SOUND_RISK_BANDS) {
            if (seen.has(b.category)) continue;

            seen.add(b.category);

            result.push({
                key: b.category,
                label: b.label,
            });
        }

        return result;
    }, []);

    const filtered = useMemo(() => {
        if (!draft) return [];

        return draft.actions.filter((a) => {
            if (validOnly && a.isValid !== true) return false;

            if (
                riskFilter !== 'ALL' &&
                a.riskCategory !== riskFilter
            ) {
                return false;
            }

            if (
                actionFilter !== 'ALL' &&
                (a.actionLabel ?? '').trim() !== actionFilter
            ) {
                return false;
            }

            return true;
        });
    }, [
        actionFilter,
        draft,
        riskFilter,
        validOnly,
    ]);

    const points = useMemo(() => {
        return filtered
            .map((a) => a.gps)
            .filter(hasGps)
            .map((gps) => ({
                lat: gps.lat,
                lng: gps.lng,
            }));
    }, [filtered]);

    const initialRegion = useMemo(() => {
        if (!points.length) return null;

        return safeRegionFromPoints(points);
    }, [points]);

    const stats = useMemo(() => {
        const total = draft?.actions.length ?? 0;

        const valid =
            draft?.actions.filter((a) => a.isValid).length ??
            0;

        const gpsCount =
            draft?.actions.filter((a) => hasGps(a.gps))
                .length ?? 0;

        const filteredGps = points.length;

        return {
            total,
            valid,
            gpsCount,
            filteredGps,
        };
    }, [draft, points.length]);

    const hasAnyGps = useMemo(() => {
        return draft
            ? draft.actions.some((a) => hasGps(a.gps))
            : false;
    }, [draft]);

    useEffect(() => {
        if (!mapRef.current) return;

        if (!points.length) return;

        if (points.length >= 2) {
            mapRef.current.fitToCoordinates(
                points.map((p) => ({
                    latitude: p.lat,
                    longitude: p.lng,
                })),
                {
                    edgePadding: {
                        top: 60,
                        right: 60,
                        bottom: 60,
                        left: 60,
                    },
                    animated: true,
                },
            );
        }
    }, [points]);

    function onContinue() {
        showToast(
            'Opening results',
            'success',
            'Preparing Activity 2 analysis.',
        );

        setTimeout(() => {
            navigation.navigate('A2Results', {
                activityId,
                runId,
            });
        }, 600);
    }

    function onBackToMeasurements() {
        navigation.navigate('A2Measurement', {
            activityId,
            runId,
        });
    }

    if (!user) return null;

    if (!draft) return null;

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge
                    label="Activity 2"
                    tone="primary"
                />

                <AppText
                    variant="title"
                    style={styles.title}
                >
                    Sound Map
                </AppText>

                <AppText
                    variant="body"
                    color="textMuted"
                    style={styles.subtitle}
                >
                    Compare sound intensity across
                    different recorded locations.
                </AppText>
            </View>

            {!gpsEnabled ? (
                <InfoBanner
                    title="GPS disabled"
                    message="Location tracking was disabled during session setup, so map pins cannot be generated."
                    tone="warning"
                />
            ) : null}

            {gpsEnabled && !hasAnyGps ? (
                <InfoBanner
                    title="No GPS coordinates available"
                    message="Location permission may be denied, services may be disabled, or no successful GPS capture occurred yet."
                    tone="warning"
                />
            ) : null}

            <AppCard>
                <AppSectionHeader
                    title="Filters"
                    subtitle="Refine which sound measurements are displayed on the map."
                />

                <View style={styles.toggleRow}>
                    <AppText variant="bodyStrong">
                        Valid-only measurements
                    </AppText>

                    <Pressable
                        style={[
                            styles.toggleChip,
                            validOnly && styles.toggleChipActive,
                        ]}
                        onPress={() =>
                            setValidOnly((v) => !v)
                        }
                    >
                        <AppText
                            variant="caption"
                            color={
                                validOnly
                                    ? 'inverseText'
                                    : 'text'
                            }
                        >
                            {validOnly ? 'ON' : 'OFF'}
                        </AppText>
                    </Pressable>
                </View>

                <AppText
                    variant="bodyStrong"
                    style={styles.filterTitle}
                >
                    Risk category
                </AppText>

                <View style={styles.filterWrap}>
                    <FilterChip
                        label="All"
                        active={riskFilter === 'ALL'}
                        onPress={() =>
                            setRiskFilter('ALL')
                        }
                    />

                    {riskOptions.map((r) => (
                        <FilterChip
                            key={r.key}
                            label={r.label}
                            active={riskFilter === r.key}
                            onPress={() =>
                                setRiskFilter(r.key)
                            }
                        />
                    ))}
                </View>

                <AppText
                    variant="bodyStrong"
                    style={styles.filterTitle}
                >
                    Action type
                </AppText>

                <View style={styles.filterWrap}>
                    <FilterChip
                        label="All"
                        active={actionFilter === 'ALL'}
                        onPress={() =>
                            setActionFilter('ALL')
                        }
                    />

                    {actionOptions.map((name) => (
                        <FilterChip
                            key={name}
                            label={name}
                            active={actionFilter === name}
                            onPress={() =>
                                setActionFilter(name)
                            }
                        />
                    ))}
                </View>

                <View style={styles.statsBox}>
                    <StatPill
                        label="Total"
                        value={stats.total}
                    />

                    <StatPill
                        label="Valid"
                        value={stats.valid}
                    />

                    <StatPill
                        label="GPS"
                        value={stats.gpsCount}
                    />

                    <StatPill
                        label="Showing"
                        value={stats.filteredGps}
                    />
                </View>
            </AppCard>

            <AppCard>
                <AppSectionHeader
                    title="Map Pins"
                    subtitle="Each pin represents a recorded sound measurement."
                />

                {initialRegion ? (
                    <View style={styles.mapWrap}>
                        <MapView
                            ref={(r) => {
                                mapRef.current = r;
                            }}
                            style={StyleSheet.absoluteFill}
                            provider={PROVIDER_DEFAULT}
                            initialRegion={initialRegion}
                        >
                            {filtered.map((m) => {
                                if (!hasGps(m.gps)) return null;

                                const gps = m.gps;

                                const title = `${
                                    m.actionLabel ?? 'Action'
                                } • ${
                                    typeof m.dbAvg === 'number'
                                        ? m.dbAvg.toFixed(1)
                                        : '—'
                                } dB`;

                                const descParts: string[] = [];

                                if (m.riskLabel) {
                                    descParts.push(m.riskLabel);
                                }

                                if (
                                    typeof m.dbMax === 'number'
                                ) {
                                    descParts.push(
                                        `max ${m.dbMax.toFixed(1)} dB`,
                                    );
                                }

                                if (
                                    typeof gps.accuracyM ===
                                    'number'
                                ) {
                                    descParts.push(
                                        `±${Math.round(
                                            gps.accuracyM,
                                        )}m`,
                                    );
                                }

                                return (
                                    <Marker
                                        key={m.id}
                                        coordinate={{
                                            latitude: gps.lat,
                                            longitude: gps.lng,
                                        }}
                                        title={title}
                                        description={descParts.join(
                                            ' • ',
                                        )}
                                        pinColor={riskToPinColor(
                                            m.riskCategory,
                                        )}
                                    />
                                );
                            })}
                        </MapView>
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <AppText variant="sectionTitle">
                            No pins available
                        </AppText>

                        <AppText
                            variant="body"
                            color="textMuted"
                            style={styles.emptyText}
                        >
                            Record measurements with GPS
                            enabled to display sound locations.
                        </AppText>

                        <AppButton
                            title="Back to Measurements"
                            variant="outline"
                            onPress={onBackToMeasurements}
                            style={styles.backButton}
                        />
                    </View>
                )}

                <View style={styles.legend}>
                    <AppText variant="sectionTitle">
                        Legend
                    </AppText>

                    <LegendRow
                        color="green"
                        label="Safe / no risk"
                    />

                    <LegendRow
                        color="orange"
                        label="Caution / fatigue"
                    />

                    <LegendRow
                        color="red"
                        label="Dangerous"
                    />

                    <LegendRow
                        color="purple"
                        label="Severe / instant damage"
                    />
                </View>
            </AppCard>

            <AppButton
                title="Continue to Results"
                onPress={onContinue}
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
    );
}

type FilterChipProps = {
    label: string;
    active: boolean;
    onPress: () => void;
};

function FilterChip({
                        label,
                        active,
                        onPress,
                    }: FilterChipProps) {
    return (
        <Pressable
            style={[
                styles.filterChip,
                active && styles.filterChipActive,
            ]}
            onPress={onPress}
        >
            <AppText
                variant="caption"
                color={
                    active ? 'inverseText' : 'text'
                }
            >
                {label}
            </AppText>
        </Pressable>
    );
}

type StatPillProps = {
    label: string;
    value: number;
};

function StatPill({
                      label,
                      value,
                  }: StatPillProps) {
    return (
        <View style={styles.statPill}>
            <AppText
                variant="caption"
                color="textMuted"
            >
                {label}
            </AppText>

            <AppText variant="bodyStrong">
                {value}
            </AppText>
        </View>
    );
}

type LegendRowProps = {
    color: string;
    label: string;
};

function LegendRow({
                       color,
                       label,
                   }: LegendRowProps) {
    return (
        <View style={styles.legendRow}>
            <View
                style={[
                    styles.legendDot,
                    {backgroundColor: color},
                ]}
            />

            <AppText
                variant="caption"
                color="textMuted"
            >
                {label}
            </AppText>
        </View>
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

    toggleRow: {
        marginTop: spacing.sm,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.md,
    },

    toggleChip: {
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },

    toggleChipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    filterTitle: {
        marginTop: spacing.lg,
    },

    filterWrap: {
        marginTop: spacing.sm,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    filterChip: {
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },

    filterChipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    statsBox: {
        marginTop: spacing.lg,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    statPill: {
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        minWidth: 78,
    },

    mapWrap: {
        marginTop: spacing.md,
        height: 340,
        borderRadius: radius.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
    },

    emptyState: {
        marginTop: spacing.md,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing.lg,
    },

    emptyText: {
        marginTop: spacing.sm,
    },

    backButton: {
        marginTop: spacing.md,
    },

    legend: {
        marginTop: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },

    legendRow: {
        marginTop: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },

    legendDot: {
        width: 12,
        height: 12,
        borderRadius: 999,
    },

    continueButton: {
        marginTop: spacing.lg,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});