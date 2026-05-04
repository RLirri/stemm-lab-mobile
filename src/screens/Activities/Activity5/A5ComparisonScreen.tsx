// src/screens/Activities/Activity5/A5ComparisonScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {
    getActivity5RunDraft,
    type Activity5RunDraft,
    type A5MovementSpec,
    type A5MovementType,
    type A5TrialDraft,
    type A5TrialMode,
} from '../../../store/activity5RunDraftStore';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A5Comparison'>;

const SMOOTHNESS_DISPLAY_SCALE = 100;

type FilterKey = 'all' | A5MovementType;
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

function scaleSmoothness(x: number | undefined): number | undefined {
    if (!isFiniteNumber(x)) return undefined;
    return x * SMOOTHNESS_DISPLAY_SCALE;
}

function fmt(n: number | undefined, digits = 1) {
    if (!isFiniteNumber(n)) return '—';
    return n.toFixed(digits);
}

function latestTrial(
    trials: A5TrialDraft[],
    pid: string,
    mv: A5MovementType,
    mode: A5TrialMode,
) {
    return trials
        .filter((t) => t.participantId === pid && t.movementType === mv && t.mode === mode)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
}

export default function A5ComparisonScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity5RunDraft | null>(null);
    const [filter, setFilter] = useState<FilterKey>('all');

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

        const d = getActivity5RunDraft(runId);

        if (!d) {
            Alert.alert('Session not found', 'Please restart Activity 5.', [
                {
                    text: 'OK',
                    onPress: () => navigation.replace('A5SessionSetup', {activityId}),
                },
            ]);
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const participants = draft?.session.participants ?? [];
    const movements: A5MovementSpec[] = draft?.session.movements ?? [];
    const trials = draft?.trials ?? [];

    const rows = useMemo(() => {
        if (!draft) return [];

        const out: Array<{
            participantId: string;
            participantName: string;
            movementType: A5MovementType;
            movementTitle: string;
            baselineSmoothRaw?: number;
            feedbackSmoothRaw?: number;
            baselineSmooth?: number;
            feedbackSmooth?: number;
            improvement?: number;
            baselineDuration?: number;
            feedbackDuration?: number;
            baselineDisp?: number;
            feedbackDisp?: number;
        }> = [];

        for (const p of participants) {
            for (const mv of movements) {
                const baseline = latestTrial(trials, p.id, mv.type, 'baseline');
                const feedback = latestTrial(trials, p.id, mv.type, 'feedback');

                const baselineSmoothRaw = baseline?.metrics?.smoothnessIndex;
                const feedbackSmoothRaw = feedback?.metrics?.smoothnessIndex;

                const baselineSmooth = scaleSmoothness(baselineSmoothRaw);
                const feedbackSmooth = scaleSmoothness(feedbackSmoothRaw);

                const improvement =
                    isFiniteNumber(baselineSmooth) && isFiniteNumber(feedbackSmooth)
                        ? baselineSmooth - feedbackSmooth
                        : undefined;

                out.push({
                    participantId: p.id,
                    participantName: p.name,
                    movementType: mv.type,
                    movementTitle: mv.title,
                    baselineSmoothRaw,
                    feedbackSmoothRaw,
                    baselineSmooth,
                    feedbackSmooth,
                    improvement,
                    baselineDuration: baseline?.metrics?.durationSec,
                    feedbackDuration: feedback?.metrics?.durationSec,
                    baselineDisp: baseline?.metrics?.displacementMagnitudeCm,
                    feedbackDisp: feedback?.metrics?.displacementMagnitudeCm,
                });
            }
        }

        return out.sort((a, b) => (b.improvement ?? -Infinity) - (a.improvement ?? -Infinity));
    }, [draft, movements, participants, trials]);

    const filteredRows = useMemo(() => {
        if (filter === 'all') return rows;
        return rows.filter((r) => r.movementType === filter);
    }, [filter, rows]);

    const best = useMemo(() => {
        return filteredRows.find((r) => isFiniteNumber(r.improvement)) ?? null;
    }, [filteredRows]);

    const completePairs = useMemo(() => {
        return filteredRows.filter((r) => isFiniteNumber(r.improvement)).length;
    }, [filteredRows]);

    function goToResults() {
        showToast('Opening results', 'success', 'Preparing movement analysis.');

        setTimeout(() => {
            navigation.navigate('A5Results', {activityId, runId});
        }, 600);
    }

    function goToTrials() {
        navigation.navigate('A5GuidedTrials', {activityId, runId});
    }

    if (!user) return null;

    if (!draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading comparison dashboard..."/>
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
                    <AppBadge label="Activity 5" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Movement Comparison
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Compare baseline and feedback trials. Smoothness index is scaled by ×
                        {SMOOTHNESS_DISPLAY_SCALE} for readability.
                    </AppText>
                </View>

                <InfoBanner
                    title="How to read this screen"
                    message="Lower smoothness is better. Improvement = Baseline − Feedback, so a positive value means feedback improved smoothness."
                    tone="info"
                />

                <AppSectionHeader
                    title="Filter by Movement"
                    subtitle="Choose one movement or compare all movement types."
                />

                <AppCard>
                    <View style={styles.chipWrap}>
                        <FilterChip
                            label="All"
                            selected={filter === 'all'}
                            onPress={() => setFilter('all')}
                        />

                        {movements.map((m) => (
                            <FilterChip
                                key={m.type}
                                label={m.title.replace('Movement ', 'M')}
                                selected={filter === m.type}
                                onPress={() => setFilter(m.type)}
                            />
                        ))}
                    </View>
                </AppCard>

                <View style={styles.heroCard}>
                    <View style={styles.heroTop}>
                        <AppText variant="bodyStrong" color="inverseText">
                            Top Improvement
                        </AppText>

                        <AppBadge
                            label={`${completePairs} complete`}
                            tone={completePairs > 0 ? 'success' : 'warning'}
                        />
                    </View>

                    <AppText variant="title" color="inverseText" style={styles.heroScore}>
                        {best ? fmt(best.improvement, 1) : '—'}
                    </AppText>

                    <AppText variant="body" color="inverseText" style={styles.heroMeta}>
                        {best
                            ? `${best.participantName} • ${best.movementTitle}`
                            : 'No complete baseline and feedback pair yet.'}
                    </AppText>

                    <AppText variant="caption" color="inverseText" style={styles.heroHint}>
                        Positive improvement indicates the feedback trial was smoother than
                        baseline.
                    </AppText>
                </View>

                <AppSectionHeader
                    title="Ranked Comparisons"
                    subtitle="Rows are ranked by improvement, highest first."
                />

                {filteredRows.length === 0 ? (
                    <AppCard>
                        <AppText variant="body" color="textMuted">
                            No comparison rows available.
                        </AppText>
                    </AppCard>
                ) : (
                    <View style={styles.rowList}>
                        {filteredRows.map((r, idx) => {
                            const imp = r.improvement;
                            const impOk = isFiniteNumber(imp);
                            const impPositive = impOk && imp >= 0;

                            return (
                                <AppCard key={`${r.participantId}_${r.movementType}`}>
                                    <View style={styles.rowHeader}>
                                        <View style={styles.rankBadge}>
                                            <AppText variant="caption" color="inverseText">
                                                #{idx + 1}
                                            </AppText>
                                        </View>

                                        <View style={styles.rowTitleArea}>
                                            <AppText variant="sectionTitle">
                                                {r.participantName}
                                            </AppText>

                                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                                {r.movementTitle}
                                            </AppText>
                                        </View>

                                        <AppBadge
                                            label={impOk ? (impPositive ? 'Improved' : 'Worse') : 'Missing'}
                                            tone={impOk ? (impPositive ? 'success' : 'warning') : 'info'}
                                        />
                                    </View>

                                    <View style={styles.metricGrid}>
                                        <MetricTile
                                            label={`Baseline smoothness ×${SMOOTHNESS_DISPLAY_SCALE}`}
                                            value={fmt(r.baselineSmooth, 1)}
                                        />

                                        <MetricTile
                                            label={`Feedback smoothness ×${SMOOTHNESS_DISPLAY_SCALE}`}
                                            value={fmt(r.feedbackSmooth, 1)}
                                        />

                                        <MetricTile
                                            label="Baseline duration"
                                            value={
                                                r.baselineDuration != null ? `${fmt(r.baselineDuration, 1)} s` : '—'
                                            }
                                        />

                                        <MetricTile
                                            label="Feedback duration"
                                            value={
                                                r.feedbackDuration != null ? `${fmt(r.feedbackDuration, 1)} s` : '—'
                                            }
                                        />

                                        <MetricTile
                                            label="Baseline displacement"
                                            value={
                                                r.baselineDisp != null ? `${fmt(r.baselineDisp, 1)} cm` : '—'
                                            }
                                        />

                                        <MetricTile
                                            label="Feedback displacement"
                                            value={
                                                r.feedbackDisp != null ? `${fmt(r.feedbackDisp, 1)} cm` : '—'
                                            }
                                        />
                                    </View>

                                    <View style={styles.improvementBox}>
                                        <View style={styles.improvementText}>
                                            <AppText variant="bodyStrong">Improvement</AppText>

                                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                                Baseline − Feedback
                                            </AppText>
                                        </View>

                                        <AppText
                                            variant="subtitle"
                                            color={impOk ? (impPositive ? 'success' : 'danger') : 'textMuted'}
                                        >
                                            {impOk ? fmt(imp, 1) : '—'}
                                        </AppText>
                                    </View>
                                </AppCard>
                            );
                        })}
                    </View>
                )}

                <View style={styles.actions}>
                    <AppButton
                        title="Back to Trials"
                        variant="outline"
                        onPress={goToTrials}
                    />

                    <AppButton title="Go to Results" onPress={goToResults}/>
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
        </KeyboardAvoidingView>
    );
}

type FilterChipProps = {
    label: string;
    selected: boolean;
    onPress: () => void;
};

function FilterChip({label, selected, onPress}: FilterChipProps) {
    return (
        <Pressable
            onPress={onPress}
            style={[styles.chip, selected && styles.chipSelected]}
        >
            <AppText
                variant="bodyStrong"
                color={selected ? 'inverseText' : 'text'}
                align="center"
            >
                {label}
            </AppText>
        </Pressable>
    );
}

type MetricTileProps = {
    label: string;
    value: string;
};

function MetricTile({label, value}: MetricTileProps) {
    return (
        <View style={styles.metricTile}>
            <AppText variant="caption" color="textMuted">
                {label}
            </AppText>

            <AppText variant="bodyStrong" style={styles.metricValue}>
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

    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    chip: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },

    chipSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },

    heroCard: {
        borderRadius: radius.xl,
        backgroundColor: colors.primaryDark,
        padding: spacing.xl,
        marginBottom: spacing.lg,
    },

    heroTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
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

    rowList: {
        gap: spacing.md,
    },

    rowHeader: {
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

    rowTitleArea: {
        flex: 1,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    metricGrid: {
        marginTop: spacing.md,
        gap: spacing.sm,
    },

    metricTile: {
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },

    metricValue: {
        marginTop: spacing.xs,
    },

    improvementBox: {
        marginTop: spacing.md,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    improvementText: {
        flex: 1,
    },

    actions: {
        marginTop: spacing.lg,
        gap: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});