// src/screens/Activities/Activity1/A1ComparisonScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {type ActivityRunDraft, getRunDraft,} from '../../../store/activityRunDraftStore';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppSectionHeader,
    AppText,
    EmptyState,
    InfoBanner,
    LoadingState,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A1Comparison'>;

function label(i: number) {
    if (i === 0) return 'Baseline';
    return `P${i}`;
}

function round(n: number, dp = 2) {
    const f = Math.pow(10, dp);
    return Math.round(n * f) / f;
}

type Row = {
    index: number;
    attempt: string;
    tHit?: number;
    tStop?: number;
    inZone?: boolean;
    gForce?: number;
    notes?: string;
    caution?: string[];
};

export default function A1ComparisonScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);

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

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const rows = useMemo<Row[]>(() => {
        if (!draft) return [];

        const base = draft.attempts?.[0];
        const baseHeight = base?.plan?.dropHeightM ?? draft.session.dropHeightM;
        const baseMassUnknown =
            base?.plan?.payloadMassUnknown ?? draft.session.payloadMassUnknown ?? false;
        const baseMass = base?.plan?.payloadMassG ?? draft.session.payloadMassG;

        const result: Row[] = [];

        for (let i = 0; i <= 3; i += 1) {
            const a = draft.attempts?.[i];
            if (!a) continue;

            const m = a.measurements;
            const c = a.computed;

            if (!m?.tHitSec || m.tHitSec <= 0) continue;

            const cautions: string[] = [];
            const h = a.plan.dropHeightM ?? draft.session.dropHeightM;
            const mu =
                a.plan.payloadMassUnknown ?? draft.session.payloadMassUnknown ?? false;
            const mg = a.plan.payloadMassG ?? draft.session.payloadMassG;

            if (i !== 0 && baseHeight != null && h != null && baseHeight > 0) {
                const diff = Math.abs((h - baseHeight) / baseHeight);
                if (diff > 0.05) cautions.push('Height changed (>5%)');
            }

            if (
                i !== 0 &&
                !mu &&
                !baseMassUnknown &&
                mg != null &&
                baseMass != null &&
                baseMass > 0
            ) {
                const diff = Math.abs((mg - baseMass) / baseMass);
                if (diff > 0.1) cautions.push('Mass changed (>10%)');
            }

            const tags = a.plan.designTags;

            const parts: string[] = [];
            if (tags?.canopyMaterial) parts.push(tags.canopyMaterial);
            if (tags?.canopyShape) parts.push(tags.canopyShape);
            if (tags?.stringsCount != null) parts.push(`${tags.stringsCount} strings`);

            const joined = parts.join(' • ');

            const designNotes =
                i === 0
                    ? 'No parachute'
                    : tags?.notes?.trim()
                        ? tags.notes.trim()
                        : joined
                            ? joined
                            : 'Prototype';

            result.push({
                index: i,
                attempt: label(i),
                tHit: m.tHitSec,
                tStop: m.tStopSec,
                inZone: m.inTargetZone,
                gForce: c?.gForce,
                notes: designNotes,
                caution: cautions.length ? cautions : undefined,
            });
        }

        return result;
    }, [draft]);

    const bestSlow = useMemo(() => {
        if (!rows.length) return null;

        return rows.reduce(
            (best, r) =>
                best == null || (r.tHit ?? 0) > (best.tHit ?? 0) ? r : best,
            null as Row | null,
        );
    }, [rows]);

    const bestSafe = useMemo(() => {
        const inZoneRows = rows.filter((r) => r.inZone === true);
        if (!inZoneRows.length) return null;

        return inZoneRows.reduce((best, r) => {
            const rg = r.gForce ?? Infinity;
            const bg = best?.gForce ?? Infinity;

            if (!best) return r;
            if (rg < bg) return r;
            if (rg === bg && (r.tHit ?? 0) > (best.tHit ?? 0)) return r;

            return best;
        }, null as Row | null);
    }, [rows]);

    function onProceed() {
        navigation.navigate('A1ReflectionSubmit', {activityId, runId});
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
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 1" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    Comparison Dashboard
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Review attempts and decide your best parachute design before submission.
                </AppText>
            </View>

            {rows.length === 0 ? (
                <EmptyState
                    title="No attempts yet"
                    message="Complete at least the baseline attempt with t_hit before comparing results."
                    actionLabel="Go to Baseline"
                    onAction={() =>
                        navigation.navigate('A1AttemptPlan', {
                            activityId,
                            runId,
                            attemptIndex: 0,
                        })
                    }
                />
            ) : (
                <>
                    <InfoBanner
                        title="Comparison ready"
                        message="The dashboard highlights slow landing performance, safe landing performance, and fairness cautions."
                        tone="success"
                    />

                    <AppSectionHeader
                        title="Highlights"
                        subtitle="Quick summary of the strongest attempt outcomes."
                    />

                    <View style={styles.highlightGrid}>
                        <AppCard style={styles.highlightCard}>
                            <AppBadge label="Best Slow" tone="info"/>

                            <AppText variant="subtitle" style={styles.highlightValue}>
                                {bestSlow ? `${round(bestSlow.tHit ?? 0, 2)}s` : '—'}
                            </AppText>

                            <AppText variant="caption" color="textMuted">
                                {bestSlow ? bestSlow.attempt : 'No attempt'}
                            </AppText>
                        </AppCard>

                        <AppCard style={styles.highlightCard}>
                            <AppBadge label="Best Safe" tone="success"/>

                            <AppText variant="subtitle" style={styles.highlightValue}>
                                {bestSafe
                                    ? bestSafe.gForce != null
                                        ? `${round(bestSafe.gForce, 1)}g`
                                        : 'N/A'
                                    : '—'}
                            </AppText>

                            <AppText variant="caption" color="textMuted">
                                {bestSafe ? bestSafe.attempt : 'No in-zone attempt'}
                            </AppText>
                        </AppCard>
                    </View>

                    <InfoBanner
                        title="How safe landing is selected"
                        message="Safe Landing means the attempt landed in the target zone and had the lowest computed g-force when available."
                        tone="info"
                    />

                    <AppSectionHeader
                        title="Attempt Table"
                        subtitle="Each card summarizes one completed attempt."
                    />

                    {rows.map((r) => {
                        const slowTag = bestSlow?.index === r.index ? 'Best Slow' : null;
                        const safeTag = bestSafe?.index === r.index ? 'Best Safe' : null;

                        return (
                            <AppCard key={r.index}>
                                <View style={styles.attemptHeader}>
                                    <View>
                                        <AppText variant="sectionTitle">{r.attempt}</AppText>
                                        <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                            {r.notes}
                                        </AppText>
                                    </View>

                                    <AppBadge
                                        label={r.index === 0 ? 'Baseline' : 'Prototype'}
                                        tone={r.index === 0 ? 'info' : 'primary'}
                                    />
                                </View>

                                <View style={styles.metricsGrid}>
                                    <MetricItem
                                        label="t_hit"
                                        value={r.tHit != null ? `${round(r.tHit, 2)}s` : '—'}
                                    />

                                    <MetricItem
                                        label="t_stop"
                                        value={r.tStop != null ? `${round(r.tStop, 2)}s` : '—'}
                                    />

                                    <MetricItem
                                        label="Accuracy"
                                        value={
                                            typeof r.inZone === 'boolean'
                                                ? r.inZone
                                                    ? 'Yes'
                                                    : 'No'
                                                : '—'
                                        }
                                    />

                                    <MetricItem
                                        label="g-force"
                                        value={r.gForce != null ? `${round(r.gForce, 1)}g` : '—'}
                                    />
                                </View>

                                {slowTag || safeTag || r.caution?.length ? (
                                    <View style={styles.tagRow}>
                                        {slowTag ? <AppBadge label={slowTag} tone="info"/> : null}
                                        {safeTag ? <AppBadge label={safeTag} tone="success"/> : null}

                                        {r.caution?.map((c) => (
                                            <AppBadge key={c} label={c} tone="warning"/>
                                        ))}
                                    </View>
                                ) : null}
                            </AppCard>
                        );
                    })}

                    <AppButton title="Proceed to Submission" onPress={onProceed}/>
                </>
            )}

            <View style={styles.bottomSpace}/>
        </AppGradientScreen>
    );
}

type MetricItemProps = {
    label: string;
    value: string;
};

function MetricItem({label, value}: MetricItemProps) {
    return (
        <View style={styles.metricItem}>
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
    header: {
        marginBottom: spacing.lg,
    },

    title: {
        marginTop: spacing.md,
    },

    subtitle: {
        marginTop: spacing.sm,
    },

    highlightGrid: {
        flexDirection: 'row',
        gap: spacing.md,
    },

    highlightCard: {
        flex: 1,
    },

    highlightValue: {
        marginTop: spacing.md,
    },

    attemptHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    metricsGrid: {
        marginTop: spacing.lg,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md,
    },

    metricItem: {
        width: '47%',
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },

    metricValue: {
        marginTop: spacing.xs,
    },

    tagRow: {
        marginTop: spacing.lg,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});