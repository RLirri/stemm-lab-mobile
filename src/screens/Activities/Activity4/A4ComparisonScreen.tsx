// src/screens/Activities/Activity4/A4ComparisonScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {type Activity4RunDraft, getActivity4RunDraft,} from '../../../store/activity4RunDraftStore';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppSectionHeader,
    AppStatusToast,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A4Comparison'>;

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

function fmtScore(x: unknown) {
    if (!isFiniteNumber(x)) return '—';
    return x >= 100 ? x.toFixed(0) : x.toFixed(3);
}

function safeText(x: unknown, fallback = '—') {
    return typeof x === 'string' && x.trim() ? x.trim() : fallback;
}

export default function A4ComparisonScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);

    const [toast, setToast] = useState<ToastState>({
        visible: false,
        title: '',
        message: undefined,
        tone: 'success',
    });

    function showToast(title: string, tone: ToastTone = 'success', message?: string) {
        setToast({visible: true, title, message, tone});
    }

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
    }, [activityId, navigation, runId, user]);

    const view = useMemo(() => {
        if (!draft) return null;

        const designs = draft.session.designs ?? [];
        const measured = draft.measurements.filter((m) =>
            isFiniteNumber(m.movementScore),
        );

        const scoredDesignSet = new Set(measured.map((m) => m.designIndex));

        const bestByDesign = new Map<number, number>();

        for (const m of measured) {
            const idx = m.designIndex;
            const s = m.movementScore!;
            const prev = bestByDesign.get(idx);

            if (!isFiniteNumber(prev) || s < prev) {
                bestByDesign.set(idx, s);
            }
        }

        let bestDesignIndex: number | null = null;
        let bestScore: number | null = null;

        for (const [idx, s] of bestByDesign.entries()) {
            if (bestScore == null || s < bestScore) {
                bestScore = s;
                bestDesignIndex = idx;
            }
        }

        const rows = designs.map((d, i) => {
            const best = bestByDesign.get(i);

            return {
                index: i,
                name: safeText(d.name, `Design ${i + 1}`),
                foldCount: d.foldCount,
                pillarCount: d.pillarCount,
                layers: d.layers,
                notes: d.notes,
                bestScore: best,
                hasScore: isFiniteNumber(best),
            };
        });

        const sorted = [...rows].sort((a, b) => {
            if (a.hasScore && b.hasScore) return (a.bestScore ?? 0) - (b.bestScore ?? 0);
            if (a.hasScore && !b.hasScore) return -1;
            if (!a.hasScore && b.hasScore) return 1;
            return a.index - b.index;
        });

        return {
            rows: sorted,
            scoredCount: scoredDesignSet.size,
            bestDesignIndex,
            bestScore,
            designCount: designs.length,
        };
    }, [draft]);

    function onRetest() {
        navigation.navigate('A4Measurements', {activityId, runId});
    }

    function onContinue() {
        if (!draft || !view) return;

        if (view.scoredCount < 3) {
            Alert.alert(
                'Not enough designs measured',
                `You need scores for at least 3 designs before submitting.\nCurrently: ${view.scoredCount}/${Math.min(
                    3,
                    view.designCount,
                )}.`,
                [
                    {
                        text: 'Go measure',
                        onPress: () => navigation.navigate('A4Measurements', {activityId, runId}),
                    },
                    {text: 'OK', style: 'cancel'},
                ],
            );
            return;
        }

        showToast(
            'Comparison ready',
            'success',
            'Opening reflection and submission.',
        );

        setTimeout(() => {
            navigation.navigate('A4ReflectionSubmit', {activityId, runId});
        }, 700);
    }

    if (!user) return null;

    if (!draft || !view) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading comparison dashboard..."/>
            </AppGradientScreen>
        );
    }

    const ready = view.scoredCount >= 3;
    const bestDesignName =
        view.bestDesignIndex == null
            ? '—'
            : safeText(
                draft.session.designs?.[view.bestDesignIndex]?.name,
                `Design ${view.bestDesignIndex + 1}`,
            );

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 4" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    Comparison
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Compare structure designs by movement score. Lower score means better
                    vibration resistance.
                </AppText>
            </View>

            <View style={styles.heroCard}>
                <View style={styles.heroTop}>
                    <AppText variant="bodyStrong" color="inverseText">
                        Best Vibration Resistance
                    </AppText>

                    <AppBadge label={ready ? 'Ready' : 'Needs data'} tone={ready ? 'success' : 'warning'}/>
                </View>

                <AppText variant="title" color="inverseText" style={styles.heroScore}>
                    {bestDesignName}
                </AppText>

                <AppText variant="subtitle" color="inverseText" style={styles.heroMeta}>
                    {view.bestScore == null ? 'No score yet' : `${fmtScore(view.bestScore)} movement score`}
                </AppText>

                <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                    The best design is the measured design with the lowest movement score.
                </AppText>
            </View>

            <AppSectionHeader
                title="Summary"
                subtitle="Minimum requirement: compare at least 3 measured designs."
            />

            <AppCard>
                <MetricRow
                    label="Designs measured"
                    value={`${view.scoredCount} / ${view.designCount}`}
                />

                <MetricRow label="Best score" value={fmtScore(view.bestScore)}/>
                <MetricRow label="Best design" value={bestDesignName}/>

                {!ready ? (
                    <InfoBanner
                        title="Need at least 3 designs"
                        message="Measure at least 3 designs before final submission."
                        tone="warning"
                    />
                ) : (
                    <InfoBanner
                        title="Ready for reflection"
                        message="You have enough measured designs to continue."
                        tone="success"
                    />
                )}

                {!ready ? (
                    <AppButton
                        title="Go to Measurements"
                        variant="outline"
                        onPress={onRetest}
                        style={styles.measureButton}
                    />
                ) : null}
            </AppCard>

            <AppSectionHeader
                title="Design Breakdown"
                subtitle="Sorted by best movement score first."
            />

            <View style={styles.designList}>
                {view.rows.map((r, rankIndex) => {
                    const isBest = view.bestDesignIndex === r.index && r.hasScore;

                    return (
                        <AppCard key={r.index}>
                            <View style={styles.designHeader}>
                                <View style={styles.designMain}>
                                    <View style={styles.rankBadge}>
                                        <AppText variant="caption" color="inverseText">
                                            #{rankIndex + 1}
                                        </AppText>
                                    </View>

                                    <View style={styles.designText}>
                                        <AppText variant="sectionTitle">{r.name}</AppText>

                                        <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                            Folds: {r.foldCount ?? '—'} • Pillars: {r.pillarCount ?? '—'} • Layers:{' '}
                                            {r.layers ?? '—'}
                                        </AppText>
                                    </View>
                                </View>

                                <AppBadge
                                    label={isBest ? 'Best' : r.hasScore ? 'Measured' : 'Missing'}
                                    tone={isBest ? 'success' : r.hasScore ? 'info' : 'warning'}
                                />
                            </View>

                            <View style={styles.scoreBox}>
                                <MetricRow label="Best movement score" value={fmtScore(r.bestScore)}/>

                                <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                    {r.hasScore
                                        ? 'Lower movement score indicates better vibration resistance.'
                                        : 'No measurement yet. Go to Measurements to test this design.'}
                                </AppText>
                            </View>

                            {r.notes ? (
                                <View style={styles.noteBox}>
                                    <AppText variant="bodyStrong">Design notes</AppText>

                                    <AppText variant="body" color="textMuted" style={styles.smallGap}>
                                        {r.notes}
                                    </AppText>
                                </View>
                            ) : null}
                        </AppCard>
                    );
                })}
            </View>

            <View style={styles.actionStack}>
                <AppButton
                    title="Retest / Add Measurements"
                    variant="outline"
                    onPress={onRetest}
                />

                <AppButton
                    title="Continue to Reflection & Submit"
                    onPress={onContinue}
                />
            </View>

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

type MetricRowProps = {
    label: string;
    value: string;
};

function MetricRow({label, value}: MetricRowProps) {
    return (
        <View style={styles.metricRow}>
            <AppText variant="bodyStrong" style={styles.metricLabel}>
                {label}
            </AppText>

            <AppText variant="bodyStrong" align="right" style={styles.metricValue}>
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

    heroTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    heroScore: {
        marginTop: spacing.md,
    },

    heroMeta: {
        marginTop: spacing.xs,
        opacity: 0.9,
    },

    heroHint: {
        marginTop: spacing.md,
        opacity: 0.75,
    },

    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingVertical: spacing.sm,
    },

    metricLabel: {
        flex: 1,
    },

    metricValue: {
        flex: 1,
    },

    measureButton: {
        marginTop: spacing.md,
    },

    designList: {
        gap: spacing.md,
    },

    designHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    designMain: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
    },

    rankBadge: {
        width: 42,
        height: 34,
        borderRadius: radius.md,
        backgroundColor: colors.primaryDark,
        alignItems: 'center',
        justifyContent: 'center',
    },

    designText: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    scoreBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },

    noteBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing.md,
    },

    actionStack: {
        marginTop: spacing.lg,
        gap: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});