// src/screens/Activities/Activity3/A3MeasurementsScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';

import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';

import {auth} from '../../../services/firebase';

import {
    type Activity3RunDraft,
    type FanDistanceCm,
    type FanFoldType,
    type FanMaterial,
    getActivity3RunDraft,
    removeActivity3Measurement,
    updateActivity3FanDesign,
    upsertActivity3Measurement,
} from '../../../store/activity3RunDraftStore';

import {
    A3_DISTANCES,
    A3_MATERIALS,
    getSubmissionGate,
    validateAndDeriveMeasurement,
} from '../../../services/activity3PhysicsService';

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
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A3Measurements'>;

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

async function getCurrentLocationSafe():
    Promise<{ lat: number; lng: number; accuracyM?: number } | undefined> {
    try {
        const Location = await import('expo-location');

        const res = await Location.getCurrentPositionAsync({});

        return {
            lat: res.coords.latitude,
            lng: res.coords.longitude,
            accuracyM: res.coords.accuracy ?? undefined,
        };
    } catch {
        return undefined;
    }
}

export default function A3MeasurementsScreen({
                                                 route,
                                                 navigation,
                                             }: Props) {
    const user = auth.currentUser;

    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);

    const [designIndex, setDesignIndex] = useState<number>(0);

    const [distance, setDistance] = useState<FanDistanceCm>(15);

    const [material, setMaterial] =
        useState<FanMaterial>('paper');

    const [bendAngleRaw, setBendAngleRaw] =
        useState<string>('');

    const [notes, setNotes] =
        useState<string>('');

    const [saving, setSaving] = useState(false);

    const [savingVideo, setSavingVideo] = useState(false);

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

    useEffect(() => {
        if (!user) return;

        const d = getActivity3RunDraft(runId);

        if (!d) {
            Alert.alert(
                'Session expired',
                'Please restart Activity 3.',
                [
                    {
                        text: 'OK',
                        onPress: () =>
                            navigation.replace('A3SessionSetup', {
                                activityId,
                            }),
                    },
                ],
            );

            return;
        }

        const hasPrediction =
            typeof d.prediction?.predictedBestDesignIndex === 'number' &&
            typeof d.prediction?.predictedBestDistanceCm === 'number';

        if (!hasPrediction) {
            Alert.alert(
                'Prediction required',
                'Please complete Prediction before recording measurements.',
                [
                    {
                        text: 'Go to Prediction',
                        onPress: () =>
                            navigation.replace('A3Prediction', {
                                activityId,
                                runId,
                            }),
                    },
                ],
            );

            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const designOptions = useMemo(() => {
        if (!draft) return [];

        return Array.from(
            {length: draft.session.fanDesignCount},
            (_, i) => i,
        );
    }, [draft]);

    const currentDesign = useMemo(() => {
        if (!draft) return undefined;

        return draft.session.fanDesigns?.[designIndex];
    }, [draft, designIndex]);

    const measurementVM = useMemo(() => {
        if (!draft) return [];

        return draft.measurements
            .map((m) => {
                const v = validateAndDeriveMeasurement({
                    draft,
                    m,
                });

                return {m, v};
            })
            .sort(
                (a, b) =>
                    (b.m.createdAt ?? 0) -
                    (a.m.createdAt ?? 0),
            );
    }, [draft]);

    const perDesignValidCount = useMemo(() => {
        if (!draft) return new Map<number, number>();

        const map = new Map<number, number>();

        for (const row of measurementVM) {
            if (!row.v.isValid) continue;

            map.set(
                row.m.designIndex,
                (map.get(row.m.designIndex) ?? 0) + 1,
            );
        }

        return map;
    }, [draft, measurementVM]);

    const canViewResults = useMemo(() => {
        if (!draft) return false;

        for (
            let i = 0;
            i < draft.session.fanDesignCount;
            i++
        ) {
            if ((perDesignValidCount.get(i) ?? 0) < 1) {
                return false;
            }
        }

        return true;
    }, [draft, perDesignValidCount]);

    const submissionGate = useMemo(() => {
        if (!draft) return null;

        return getSubmissionGate(draft);
    }, [draft]);

    async function onAddMeasurement() {
        if (!draft) return;

        const angle =
            toNumberOrUndefined(bendAngleRaw);

        if (angle == null) {
            showToast(
                'Bend angle required',
                'warning',
                'Please enter a valid bend angle.',
            );

            return;
        }

        const synthetic = {
            id: '__tmp__',
            designIndex,
            distanceCm: distance,
            material,
            bendAngleDeg: angle,
            notes: notes.trim() ? notes.trim() : undefined,
            createdAt: Date.now(),
        };

        const validation =
            validateAndDeriveMeasurement({
                draft,
                m: synthetic as any,
            });

        if (!validation.isValid) {
            showToast(
                'Invalid measurement',
                'warning',
                validation.warnings[0] ??
                'Measurement validation failed.',
            );

            return;
        }

        const proceed = async () => {
            setSaving(true);

            let geo;

            if (
                draft.session.gpsEnabled &&
                draft.session.gpsPermission === 'granted'
            ) {
                geo = await getCurrentLocationSafe();
            }

            const next = upsertActivity3Measurement(
                runId,
                {
                    designIndex,
                    distanceCm: distance,
                    material,
                    bendAngleDeg: angle,
                    geo,
                    notes: notes.trim()
                        ? notes.trim()
                        : undefined,
                },
            );

            setDraft(next);

            setBendAngleRaw('');
            setNotes('');

            setSaving(false);

            showToast(
                'Measurement saved',
                'success',
                'Fan measurement recorded successfully.',
            );
        };

        if (validation.warnings.length) {
            Alert.alert(
                'Measurement warning',
                validation.warnings.join('\n'),
                [
                    {
                        text: 'Cancel',
                        style: 'cancel',
                    },
                    {
                        text: 'Save anyway',
                        onPress: () => void proceed(),
                    },
                ],
            );

            return;
        }

        await proceed();
    }

    function onDelete(measurementId: string) {
        if (!draft) return;

        const next =
            removeActivity3Measurement(
                runId,
                measurementId,
            );

        setDraft(next);

        showToast(
            'Measurement removed',
            'info',
        );
    }

    function onContinueToResults() {
        if (!draft) return;

        if (!canViewResults) {
            showToast(
                'Not enough measurements',
                'warning',
                'Please record at least one valid measurement for each design.',
            );

            return;
        }

        showToast(
            'Measurements complete',
            'success',
            'Opening results dashboard.',
        );

        setTimeout(() => {
            navigation.navigate('A3Results', {
                activityId,
                runId,
            });
        }, 700);
    }

    async function attachVideoToMeasurement(
        measurementId: string,
        kind: 'record' | 'pick',
    ) {
        if (!draft) return;

        try {
            setSavingVideo(true);

            const picked =
                kind === 'record'
                    ? await recordVideoWithCamera()
                    : await pickVideoFromLibrary();

            if (!picked?.uri) return;

            const m = draft.measurements.find(
                (x) => x.id === measurementId,
            );

            if (!m) return;

            const next =
                upsertActivity3Measurement(runId, {
                    id: m.id,
                    designIndex: m.designIndex,
                    distanceCm: m.distanceCm,
                    material: m.material,
                    bendAngleDeg: m.bendAngleDeg,
                    geo: m.geo,
                    notes: m.notes,
                    video: {
                        uri: picked.uri,
                        createdAt: Date.now(),
                    },
                });

            setDraft(next);

            showToast(
                'Video attached',
                'success',
                'Measurement evidence updated.',
            );
        } catch (e: any) {
            Alert.alert(
                'Video error',
                e?.message ??
                'Failed to attach video.',
            );
        } finally {
            setSavingVideo(false);
        }
    }

    function removeVideoFromMeasurement(
        measurementId: string,
    ) {
        if (!draft) return;

        const m = draft.measurements.find(
            (x) => x.id === measurementId,
        );

        if (!m) return;

        const next =
            upsertActivity3Measurement(runId, {
                id: m.id,
                designIndex: m.designIndex,
                distanceCm: m.distanceCm,
                material: m.material,
                bendAngleDeg: m.bendAngleDeg,
                geo: m.geo,
                notes: m.notes,
                video: undefined,
            });

        setDraft(next);

        showToast(
            'Video removed',
            'info',
        );
    }

    function updateDesignPatch(
        patch: any,
    ) {
        if (!draft) return;

        const next =
            updateActivity3FanDesign(
                runId,
                designIndex,
                patch,
            );

        setDraft(next);
    }

    if (!user) return null;

    if (!draft) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
            </View>
        );
    }

    return (
        <>
            <KeyboardAvoidingView
                style={{flex: 1}}
                behavior={
                    Platform.OS === 'ios'
                        ? 'padding'
                        : undefined
                }
            >
                <AppGradientScreen>
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.container}
                    >
                        <View style={styles.header}>
                            <AppBadge
                                label="Activity 3"
                                tone="primary"
                            />

                            <AppText
                                variant="title"
                                style={styles.title}
                            >
                                Fan Measurements
                            </AppText>

                            <AppText
                                variant="body"
                                color="textMuted"
                                style={styles.subtitle}
                            >
                                Record bend angle measurements
                                and compare airflow performance
                                across fan designs.
                            </AppText>
                        </View>

                        <InfoBanner
                            title="Scientific comparison"
                            message="Use consistent positioning and recording conditions to improve measurement reliability."
                            tone="info"
                        />

                        {submissionGate ? (
                            <AppCard>
                                <AppText variant="sectionTitle">
                                    Submission Progress
                                </AppText>

                                <View style={styles.progressRow}>
                                    <ProgressBadge
                                        ok={
                                            submissionGate.hasPrediction
                                        }
                                        label="Prediction"
                                    />

                                    <ProgressBadge
                                        ok={submissionGate.hasVideo}
                                        label="Video"
                                    />

                                    <ProgressBadge
                                        ok={
                                            submissionGate.validCount >
                                            0
                                        }
                                        label="Valid Data"
                                    />
                                </View>
                            </AppCard>
                        ) : null}

                        <AppSectionHeader
                            title="Design Details"
                            subtitle={`Editing ${currentLabelForDesign(
                                draft,
                                designIndex,
                            )}`}
                        />

                        <AppCard>
                            <AppInput
                                label="Design Name"
                                value={
                                    currentDesign?.name ??
                                    `Design ${designIndex + 1}`
                                }
                                onChangeText={(t) =>
                                    updateDesignPatch({
                                        name: t,
                                    })
                                }
                                placeholder={`Design ${
                                    designIndex + 1
                                }`}
                            />

                            <AppText
                                variant="bodyStrong"
                                style={styles.label}
                            >
                                Has folds?
                            </AppText>

                            <View style={styles.segmentWrap}>
                                {(['yes', 'no'] as const).map(
                                    (v) => {
                                        const active =
                                            (
                                                currentDesign?.hasFolds
                                                    ? 'yes'
                                                    : 'no'
                                            ) === v;

                                        return (
                                            <ChoiceChip
                                                key={v}
                                                label={v}
                                                active={active}
                                                onPress={() =>
                                                    updateDesignPatch({
                                                        hasFolds:
                                                            v === 'yes',
                                                    })
                                                }
                                            />
                                        );
                                    },
                                )}
                            </View>

                            <AppText
                                variant="bodyStrong"
                                style={styles.label}
                            >
                                Fold Type
                            </AppText>

                            <View style={styles.segmentWrap}>
                                {(
                                    [
                                        'flat',
                                        'folded',
                                        'pleated',
                                    ] as FanFoldType[]
                                ).map((v) => {
                                    const active =
                                        (
                                            currentDesign?.foldType ??
                                            'flat'
                                        ) === v;

                                    return (
                                        <ChoiceChip
                                            key={v}
                                            label={v}
                                            active={active}
                                            onPress={() =>
                                                updateDesignPatch({
                                                    foldType: v,
                                                })
                                            }
                                        />
                                    );
                                })}
                            </View>
                        </AppCard>

                        <AppSectionHeader
                            title="Add Measurement"
                            subtitle="Record airflow bend angle data."
                        />

                        <AppCard>
                            <AppText
                                variant="bodyStrong"
                                style={styles.label}
                            >
                                Design
                            </AppText>

                            <View style={styles.segmentWrap}>
                                {designOptions.map((i) => {
                                    const active =
                                        designIndex === i;

                                    return (
                                        <ChoiceChip
                                            key={i}
                                            label={currentLabelForDesign(
                                                draft,
                                                i,
                                            )}
                                            active={active}
                                            onPress={() =>
                                                setDesignIndex(i)
                                            }
                                        />
                                    );
                                })}
                            </View>

                            <AppText
                                variant="bodyStrong"
                                style={styles.label}
                            >
                                Distance
                            </AppText>

                            <View style={styles.segmentWrap}>
                                {A3_DISTANCES.map((v) => {
                                    const active =
                                        distance === v;

                                    return (
                                        <ChoiceChip
                                            key={v}
                                            label={`${v} cm`}
                                            active={active}
                                            onPress={() =>
                                                setDistance(
                                                    v as FanDistanceCm,
                                                )
                                            }
                                        />
                                    );
                                })}
                            </View>

                            <AppText
                                variant="bodyStrong"
                                style={styles.label}
                            >
                                Material
                            </AppText>

                            <View style={styles.segmentWrap}>
                                {A3_MATERIALS.map((v) => {
                                    const active =
                                        material === v;

                                    return (
                                        <ChoiceChip
                                            key={v}
                                            label={v}
                                            active={active}
                                            onPress={() =>
                                                setMaterial(v)
                                            }
                                        />
                                    );
                                })}
                            </View>

                            <AppInput
                                label="Bend Angle (°)"
                                value={bendAngleRaw}
                                onChangeText={
                                    setBendAngleRaw
                                }
                                placeholder="e.g. 42"
                                keyboardType="decimal-pad"
                            />

                            <AppInput
                                label="Measurement Notes"
                                value={notes}
                                onChangeText={setNotes}
                                placeholder="Optional notes..."
                                multiline
                                style={styles.notesInput}
                            />

                            <AppButton
                                title={
                                    saving
                                        ? 'Saving...'
                                        : 'Add Measurement'
                                }
                                onPress={() =>
                                    void onAddMeasurement()
                                }
                                disabled={saving}
                            />
                        </AppCard>

                        <AppSectionHeader
                            title="Recorded Measurements"
                            subtitle="All recorded airflow measurements."
                        />

                        <View style={styles.measurementList}>
                            {measurementVM.length === 0 ? (
                                <AppCard>
                                    <AppText
                                        variant="body"
                                        color="textMuted"
                                    >
                                        No measurements recorded
                                        yet.
                                    </AppText>
                                </AppCard>
                            ) : (
                                measurementVM.map(
                                    ({m, v}) => (
                                        <AppCard key={m.id}>
                                            <View
                                                style={
                                                    styles.measurementHeader
                                                }
                                            >
                                                <View
                                                    style={{
                                                        flex: 1,
                                                    }}
                                                >
                                                    <AppText variant="bodyStrong">
                                                        {currentLabelForDesign(
                                                            draft,
                                                            m.designIndex,
                                                        )}
                                                    </AppText>

                                                    <AppText
                                                        variant="caption"
                                                        color="textMuted"
                                                        style={
                                                            styles.metaTop
                                                        }
                                                    >
                                                        {m.distanceCm}
                                                        cm •{' '}
                                                        {m.material}
                                                    </AppText>
                                                </View>

                                                <AppBadge
                                                    label={`${m.bendAngleDeg}°`}
                                                    tone="primary"
                                                />
                                            </View>

                                            {v.derived ? (
                                                <View
                                                    style={
                                                        styles.metricBox
                                                    }
                                                >
                                                    <AppText
                                                        variant="caption"
                                                        color="textMuted"
                                                    >
                                                        θ ={' '}
                                                        {
                                                            v.derived
                                                                .thetaRad
                                                        }{' '}
                                                        rad
                                                    </AppText>

                                                    {v.derived
                                                        .forceIndex !=
                                                    null ? (
                                                        <AppText
                                                            variant="caption"
                                                            color="textMuted"
                                                            style={
                                                                styles.metricGap
                                                            }
                                                        >
                                                            k·θ ={' '}
                                                            {
                                                                v
                                                                    .derived
                                                                    .forceIndex
                                                            }
                                                        </AppText>
                                                    ) : null}
                                                </View>
                                            ) : null}

                                            {v.warnings.length ? (
                                                <InfoBanner
                                                    title="Measurement warning"
                                                    message={v.warnings.join(
                                                        ' • ',
                                                    )}
                                                    tone="warning"
                                                />
                                            ) : null}

                                            <View
                                                style={
                                                    styles.videoRow
                                                }
                                            >
                                                <AppButton
                                                    title="Record"
                                                    variant="outline"
                                                    onPress={() =>
                                                        void attachVideoToMeasurement(
                                                            m.id,
                                                            'record',
                                                        )
                                                    }
                                                    disabled={
                                                        savingVideo
                                                    }
                                                />

                                                <AppButton
                                                    title="Pick"
                                                    variant="outline"
                                                    onPress={() =>
                                                        void attachVideoToMeasurement(
                                                            m.id,
                                                            'pick',
                                                        )
                                                    }
                                                    disabled={
                                                        savingVideo
                                                    }
                                                />

                                                {m.video?.uri ? (
                                                    <AppButton
                                                        title="Remove"
                                                        variant="danger"
                                                        onPress={() =>
                                                            removeVideoFromMeasurement(
                                                                m.id,
                                                            )
                                                        }
                                                    />
                                                ) : null}
                                            </View>

                                            <View
                                                style={
                                                    styles.footerRow
                                                }
                                            >
                                                <AppText
                                                    variant="caption"
                                                    color="textMuted"
                                                >
                                                    Video:{' '}
                                                    {m.video?.uri
                                                        ? 'Attached'
                                                        : 'None'}
                                                </AppText>

                                                <Pressable
                                                    onPress={() =>
                                                        onDelete(m.id)
                                                    }
                                                >
                                                    <AppText
                                                        variant="caption"
                                                        color="danger"
                                                    >
                                                        Delete
                                                    </AppText>
                                                </Pressable>
                                            </View>
                                        </AppCard>
                                    ),
                                )
                            )}
                        </View>

                        <AppButton
                            title="View Results"
                            variant="secondary"
                            onPress={
                                onContinueToResults
                            }
                            disabled={!canViewResults}
                        />

                        <View
                            style={{
                                height: spacing.xxl,
                            }}
                        />
                    </ScrollView>
                </AppGradientScreen>
            </KeyboardAvoidingView>

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
        </>
    );
}

type ChoiceChipProps = {
    label: string;
    active: boolean;
    onPress: () => void;
};

function ChoiceChip({
                        label,
                        active,
                        onPress,
                    }: ChoiceChipProps) {
    return (
        <Pressable
            onPress={onPress}
            style={[
                styles.choiceChip,
                active &&
                styles.choiceChipActive,
            ]}
        >
            <AppText
                variant="bodyStrong"
                color={
                    active
                        ? 'inverseText'
                        : 'text'
                }
            >
                {label}
            </AppText>
        </Pressable>
    );
}

type ProgressBadgeProps = {
    ok: boolean;
    label: string;
};

function ProgressBadge({
                           ok,
                           label,
                       }: ProgressBadgeProps) {
    return (
        <View
            style={[
                styles.progressBadge,
                ok
                    ? styles.progressOk
                    : styles.progressPending,
            ]}
        >
            <AppText
                variant="caption"
                color={
                    ok
                        ? 'inverseText'
                        : 'text'
                }
            >
                {label}
            </AppText>
        </View>
    );
}

function currentLabelForDesign(
    draft: Activity3RunDraft,
    idx: number,
): string {
    const name =
        draft.session.fanDesigns?.[
            idx
            ]?.name?.trim();

    return name
        ? name
        : `Design ${idx + 1}`;
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
    },

    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
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

    progressRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginTop: spacing.md,
    },

    progressBadge: {
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },

    progressOk: {
        backgroundColor:
        colors.success,
    },

    progressPending: {
        backgroundColor:
        colors.surfaceMuted,
    },

    label: {
        marginTop: spacing.md,
        marginBottom: spacing.sm,
    },

    segmentWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    choiceChip: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.pill,
        backgroundColor:
        colors.surface,
        paddingHorizontal:
        spacing.md,
        paddingVertical:
        spacing.sm,
    },

    choiceChipActive: {
        backgroundColor:
        colors.primary,
        borderColor:
        colors.primary,
    },

    notesInput: {
        minHeight: 90,
        textAlignVertical: 'top',
    },

    measurementList: {
        gap: spacing.md,
    },

    measurementHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },

    metaTop: {
        marginTop: spacing.xs,
    },

    metricBox: {
        marginTop: spacing.md,
    },

    metricGap: {
        marginTop: spacing.xs,
    },

    videoRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginTop: spacing.md,
    },

    footerRow: {
        marginTop: spacing.md,
        flexDirection: 'row',
        justifyContent:
            'space-between',
        alignItems: 'center',
    },
});