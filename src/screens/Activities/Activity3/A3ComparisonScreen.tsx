// src/screens/Activities/Activity3/A3ComparisonScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {
    type Activity3RunDraft,
    type FanDistanceCm,
    type FanMaterial,
    getActivity3RunDraft,
} from '../../../store/activity3RunDraftStore';
import {A3_DISTANCES, A3_MATERIALS, validateAndDeriveMeasurement,} from '../../../services/activity3PhysicsService';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppSectionHeader,
    AppStatusToast,
    AppText,
    EmptyState,
    InfoBanner,
    LoadingState,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A3Comparison'>;

type CondTag = 'Best';

type CondRow = {
    label: string;
    avgDeg: number;
    count: number;
    tag?: CondTag;
};

type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function round(n: number, dp = 1) {
    const f = Math.pow(10, dp);
    return Math.round(n * f) / f;
}

export default function A3ComparisonScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);

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
    }, [activityId, navigation, runId, user]);

    const validAngles = useMemo(() => {
        if (!draft) {
            return [] as Array<{
                material: FanMaterial;
                distanceCm: FanDistanceCm;
                angle: number;
            }>;
        }

        const rows: Array<{
            material: FanMaterial;
            distanceCm: FanDistanceCm;
            angle: number;
        }> = [];

        for (const m of draft.measurements) {
            const r = validateAndDeriveMeasurement({draft, m});

            if (!r.isValid) continue;
            if (typeof m.bendAngleDeg !== 'number') continue;

            rows.push({
                material: m.material,
                distanceCm: m.distanceCm,
                angle: m.bendAngleDeg,
            });
        }

        return rows;
    }, [draft]);

    const overall = useMemo(() => {
        if (!validAngles.length) return null;

        const avg = validAngles.reduce((a, b) => a + b.angle, 0) / validAngles.length;

        return {
            avgDeg: avg,
            count: validAngles.length,
        };
    }, [validAngles]);

    const materialRows = useMemo<CondRow[]>(() => {
        if (!draft) return [];

        const acc: Record<FanMaterial, { sum: number; count: number }> = {
            paper: {sum: 0, count: 0},
            cardboard: {sum: 0, count: 0},
        };

        for (const r of validAngles) {
            acc[r.material].sum += r.angle;
            acc[r.material].count += 1;
        }

        const baseRows: CondRow[] = [];

        for (const mat of A3_MATERIALS as FanMaterial[]) {
            const v = acc[mat];

            if (v.count > 0) {
                baseRows.push({
                    label: mat,
                    avgDeg: v.sum / v.count,
                    count: v.count,
                });
            }
        }

        const best = baseRows.reduce(
            (b, r) => (b == null || r.avgDeg > b.avgDeg ? r : b),
            null as CondRow | null,
        );

        return baseRows.map((r) => ({
            ...r,
            tag: best && r.label === best.label ? 'Best' : undefined,
        }));
    }, [draft, validAngles]);

    const distanceRows = useMemo<CondRow[]>(() => {
        if (!draft) return [];

        const acc: Record<FanDistanceCm, { sum: number; count: number }> = {
            15: {sum: 0, count: 0},
            30: {sum: 0, count: 0},
            45: {sum: 0, count: 0},
        };

        for (const r of validAngles) {
            acc[r.distanceCm].sum += r.angle;
            acc[r.distanceCm].count += 1;
        }

        const baseRows: CondRow[] = [];

        for (const dcm of A3_DISTANCES as FanDistanceCm[]) {
            const v = acc[dcm];

            if (v.count > 0) {
                baseRows.push({
                    label: `${dcm} cm`,
                    avgDeg: v.sum / v.count,
                    count: v.count,
                });
            }
        }

        const best = baseRows.reduce(
            (b, r) => (b == null || r.avgDeg > b.avgDeg ? r : b),
            null as CondRow | null,
        );

        return baseRows.map((r) => ({
            ...r,
            tag: best && r.label === best.label ? 'Best' : undefined,
        }));
    }, [draft, validAngles]);

    const insights = useMemo(() => {
        if (!materialRows.length && !distanceRows.length) return null;

        const bestMat = materialRows.find((r) => r.tag === 'Best');
        const bestDist = distanceRows.find((r) => r.tag === 'Best');

        return {
            bestMaterial: bestMat?.label,
            bestDistance: bestDist?.label,
        };
    }, [materialRows, distanceRows]);

    function onProceed() {
        showToast(
            'Comparison saved',
            'success',
            'Opening reflection and submission.',
        );

        setTimeout(() => {
            navigation.navigate('A3ReflectionSubmit', {activityId, runId});
        }, 700);
    }

    if (!user) return null;

    if (!draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading scientific comparison..."/>
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 3" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    Scientific Comparison
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Compare conditions using measured bend angles. Only valid measurements
                    contribute to the comparison.
                </AppText>
            </View>

            {overall ? (
                <>
                    <View style={styles.heroCard}>
                        <AppText variant="bodyStrong" color="inverseText">
                            Overall Average Bend Angle
                        </AppText>

                        <AppText variant="title" color="inverseText" style={styles.heroValue}>
                            {round(overall.avgDeg, 1)}°
                        </AppText>

                        <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                            Based on {overall.count} valid measurement
                            {overall.count > 1 ? 's' : ''}.
                        </AppText>
                    </View>

                    <InfoBanner
                        title="Interpretation"
                        message="A larger bend angle suggests stronger airflow impact on the tested material under the current setup."
                        tone="info"
                    />
                </>
            ) : (
                <EmptyState
                    title="No valid measurements yet"
                    message="Record measurements first, then return here to compare fan conditions."
                    actionLabel="Go to Measurements"
                    onAction={() => navigation.navigate('A3Measurements', {activityId, runId})}
                />
            )}

            <AppSectionHeader
                title="Material Comparison"
                subtitle="Average bend angle grouped by material."
            />

            <AppCard>
                {!materialRows.length ? (
                    <AppText variant="body" color="textMuted">
                        No valid material data yet.
                    </AppText>
                ) : (
                    <View style={styles.rowList}>
                        {materialRows.map((r) => (
                            <ComparisonRow key={r.label} row={r}/>
                        ))}
                    </View>
                )}
            </AppCard>

            <AppSectionHeader
                title="Distance Comparison"
                subtitle="Average bend angle grouped by fan distance."
            />

            <AppCard>
                {!distanceRows.length ? (
                    <AppText variant="body" color="textMuted">
                        No valid distance data yet.
                    </AppText>
                ) : (
                    <View style={styles.rowList}>
                        {distanceRows.map((r) => (
                            <ComparisonRow key={r.label} row={r}/>
                        ))}
                    </View>
                )}
            </AppCard>

            {insights ? (
                <>
                    <AppSectionHeader
                        title="Quick Insight"
                        subtitle="Highest average condition so far."
                    />

                    <AppCard>
                        <View style={styles.insightGrid}>
                            <InsightTile
                                label="Best material"
                                value={insights.bestMaterial ?? '—'}
                            />

                            <InsightTile
                                label="Best distance"
                                value={insights.bestDistance ?? '—'}
                            />
                        </View>

                        <InfoBanner
                            title="Reliability note"
                            message="This is based on averages. More repeated trials improve confidence."
                            tone="info"
                        />
                    </AppCard>
                </>
            ) : null}

            <AppButton
                title="Proceed to Reflection & Submit"
                onPress={onProceed}
                disabled={!overall}
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

function ComparisonRow({row}: { row: CondRow }) {
    return (
        <View style={styles.comparisonRow}>
            <View style={styles.rowMain}>
                <View style={styles.rowText}>
                    <AppText variant="bodyStrong">{row.label}</AppText>

                    <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                        n = {row.count}
                    </AppText>
                </View>

                <AppText variant="subtitle">{round(row.avgDeg, 1)}°</AppText>
            </View>

            {row.tag ? (
                <View style={styles.tagRow}>
                    <AppBadge label={row.tag} tone="success"/>
                </View>
            ) : null}
        </View>
    );
}

function InsightTile({label, value}: { label: string; value: string }) {
    return (
        <View style={styles.insightTile}>
            <AppText variant="caption" color="textMuted">
                {label}
            </AppText>

            <AppText variant="bodyStrong" style={styles.insightValue}>
                {value}
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

    heroCard: {
        borderRadius: radius.xl,
        backgroundColor: colors.primaryDark,
        padding: spacing.xl,
        marginBottom: spacing.lg,
    },

    heroValue: {
        marginTop: spacing.sm,
    },

    heroHint: {
        marginTop: spacing.md,
        opacity: 0.75,
    },

    rowList: {
        gap: spacing.md,
    },

    comparisonRow: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        padding: spacing.md,
    },

    rowMain: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.md,
    },

    rowText: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    tagRow: {
        marginTop: spacing.md,
        flexDirection: 'row',
    },

    insightGrid: {
        flexDirection: 'row',
        gap: spacing.md,
        marginBottom: spacing.md,
    },

    insightTile: {
        flex: 1,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },

    insightValue: {
        marginTop: spacing.xs,
        textTransform: 'capitalize',
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});