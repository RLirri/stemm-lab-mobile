import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../navigation/AppStack';
import {activityCatalog} from '../../features/activities/activityCatalog';
import {
    getActivityHistoryDetail,
    type ActivityHistoryDetail,
} from '../../services/activityHistoryService';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppExpandableCard,
    AppGradientScreen,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../components/ui';

import {colors, spacing} from '../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'ActivityHistoryDetail'>;

function getActivityTitle(activityId: string): string {
    const activity = activityCatalog.find((item) => item.id === activityId);
    return activity?.title ?? 'Unknown activity';
}

function getActivityCategory(activityId: string): string {
    const activity = activityCatalog.find((item) => item.id === activityId);
    return activity?.category ?? 'General';
}

function getActivityDifficulty(activityId: string): string {
    const activity = activityCatalog.find((item) => item.id === activityId);
    return activity?.difficulty ?? 'Standard';
}

function formatStatus(status?: string): string {
    if (!status) return 'Submitted';
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function safeText(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function getReadableScore(score: unknown): string {
    return typeof score === 'number' && Number.isFinite(score) ? score.toFixed(1) : '-';
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function extractPayload(item: Record<string, unknown>): unknown {
    return (
        item.payload ??
        item.data ??
        item.submissionData ??
        item.result ??
        item.results ??
        item.args ??
        item
    );
}

function getNestedRecord(root: Record<string, unknown>, path: string[]): Record<string, unknown> {
    return path.reduce<Record<string, unknown>>((current, key) => {
        return asRecord(current[key]);
    }, root);
}

function extractReflection(item: Record<string, unknown>, payload: unknown): unknown {
    const payloadRecord = asRecord(payload);
    const args = asRecord(payloadRecord.args);
    const run = asRecord(payloadRecord.run);
    const argsRun = asRecord(args.run);

    return (
        item.reflection ??
        item.reflectionText ??
        item.studentReflection ??
        payloadRecord.reflection ??
        payloadRecord.reflectionText ??
        args.reflection ??
        args.reflectionText ??
        run.reflection ??
        argsRun.reflection
    );
}

function extractRating(item: Record<string, unknown>, payload: unknown): unknown {
    const payloadRecord = asRecord(payload);
    const args = asRecord(payloadRecord.args);
    const run = asRecord(payloadRecord.run);
    const argsRun = asRecord(args.run);

    return (
        item.rating ??
        item.reflectionRating ??
        item.experienceRating ??
        payloadRecord.rating ??
        payloadRecord.reflectionRating ??
        args.rating ??
        args.reflectionRating ??
        run.rating ??
        argsRun.rating
    );
}

function findBestArrayDeep(value: unknown, depth = 0): unknown[] {
    if (!value || depth > 5) return [];

    if (Array.isArray(value)) {
        const objectCount = value.filter((item) => item && typeof item === 'object').length;
        return value.length > 0 && objectCount > 0 ? value : [];
    }

    if (typeof value !== 'object') return [];

    const record = value as Record<string, unknown>;

    const preferredKeys = [
        'attempts',
        'trials',
        'measurements',
        'measurementData',
        'readings',
        'samples',
        'results',
        'designs',
        'actions',
        'records',
        'observations',
    ];

    for (const key of preferredKeys) {
        const candidate = record[key];
        if (Array.isArray(candidate) && candidate.length > 0) {
            return candidate;
        }
    }

    for (const key of Object.keys(record)) {
        const nested = findBestArrayDeep(record[key], depth + 1);
        if (nested.length > 0) return nested;
    }

    return [];
}

function extractAttemptData(payload: unknown): unknown[] {
    const payloadRecord = asRecord(payload);

    const candidates = [
        payloadRecord,
        getNestedRecord(payloadRecord, ['args']),
        getNestedRecord(payloadRecord, ['run']),
        getNestedRecord(payloadRecord, ['args', 'run']),
        getNestedRecord(payloadRecord, ['args', 'run', 'data']),
        getNestedRecord(payloadRecord, ['args', 'run', 'result']),
        getNestedRecord(payloadRecord, ['args', 'run', 'results']),
    ];

    for (const candidate of candidates) {
        const found = findBestArrayDeep(candidate);
        if (found.length > 0) return found;
    }

    return [];
}

function getAttemptTitle(attempt: unknown, index: number): string {
    const record = asRecord(attempt);

    return (
        safeText(record.actionLabel) !== '-'
            ? safeText(record.actionLabel)
            : safeText(record.label) !== '-'
                ? safeText(record.label)
                : safeText(record.name) !== '-'
                    ? safeText(record.name)
                    : `Attempt ${index + 1}`
    );
}

function renderAttemptSummary(attempt: unknown): string {
    const record = asRecord(attempt);

    const fields = [
        ['Duration', record.durationSec ? `${record.durationSec}s` : undefined],
        ['Average dB', record.dbAvg],
        ['Max dB', record.dbMax],
        ['Risk', record.riskLabel ?? record.riskCategory],
        ['Valid', record.isValid],
        ['Recorded At', record.recordedAt],
    ];

    const lines = fields
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([label, value]) => `${label}: ${safeText(value)}`);

    if (lines.length > 0) {
        return lines.join('\n');
    }

    return safeText(attempt);

}

function buildSmartFeedback(score: unknown, reflection: unknown, attempts: unknown[]): string {
    const scoreNumber = typeof score === 'number' ? score : null;
    const hasAttempts = attempts.length > 0;
    const attemptText = hasAttempts
        ? ` The submission includes ${attempts.length} detailed recorded attempt${attempts.length > 1 ? 's' : ''}, which makes the history record more useful for reviewing the experiment process.`
        : '';

    if (scoreNumber !== null && scoreNumber >= 8) {
        return `This submission shows strong learning performance. The recorded score suggests that the experiment outcome was successful and the student demonstrated good understanding of the activity.${attemptText}`;
    }

    if (scoreNumber !== null && scoreNumber >= 5) {
        return `This submission shows completed learning progress with room for improvement. Review the reflection and compare the recorded attempts to identify how the experiment outcome can be improved.${attemptText}`;
    }

    if (scoreNumber !== null) {
        return `This submission was completed, but the score suggests that the result may need further review. The student can improve by checking the experiment setup, repeating the measurement, and explaining the result more clearly.${attemptText}`;
    }

    if (reflection || hasAttempts) {
        return `This submission contains useful learning evidence. Review the available reflection and attempt data to understand the experiment process and identify possible improvements.${attemptText}`;
    }

    return 'Only limited summary information is available for this submission. Future submissions with detailed measurements will allow stronger feedback and analysis.';
}

function buildLearningSummary(score: unknown, reflection: unknown, rating: unknown, attempts: unknown[]): string {
    const scoreText = getReadableScore(score);
    const hasReflection = typeof reflection === 'string' && reflection.trim().length > 0;
    const ratingText = safeText(rating);

    if (scoreText !== '-' && hasReflection && rating) {
        return `This submission received a score of ${scoreText}. The reflection, rating (${ratingText}), and ${attempts.length} recorded attempt${attempts.length === 1 ? '' : 's'} have been saved for later review.`;
    }

    if (scoreText !== '-' && hasReflection) {
        return `This submission received a score of ${scoreText}. The saved reflection and recorded activity data provide useful evidence of the student’s learning process.`;
    }

    if (scoreText !== '-') {
        return `This submission received a score of ${scoreText}. The record can be reviewed later to compare learning progress across activities.`;
    }

    return 'This submission has been saved as part of the activity history.';
}

function isSensorSampleCollection(attempts: unknown[]): boolean {
    if (attempts.length < 20) return false;

    const sampleLikeCount = attempts.filter((item) => {
        const record = asRecord(item);

        return (
            'x' in record ||
            'y' in record ||
            'tMs' in record ||
            'timestamp' in record ||
            'recordedAt' in record
        );
    }).length;

    return sampleLikeCount / attempts.length >= 0.6;
}

function getNumericValues(attempts: unknown[], key: string): number[] {
    return attempts
        .map((item) => asRecord(item)[key])
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function renderSensorDataSummary(samples: unknown[]): string {
    const tMsValues = getNumericValues(samples, 'tMs');

    if (tMsValues.length === 0) {
        return `Total samples recorded: ${samples.length}`;
    }

    const fastest = Math.min(...tMsValues);
    const slowest = Math.max(...tMsValues);
    const average = tMsValues.reduce((sum, value) => sum + value, 0) / tMsValues.length;

    return [
        `Total samples recorded: ${samples.length}`,
        `Fastest sample time: ${fastest.toFixed(0)} ms`,
        `Slowest sample time: ${slowest.toFixed(0)} ms`,
        `Average sample time: ${average.toFixed(0)} ms`,
    ].join('\n');
}

export default function ActivityHistoryDetailScreen({route, navigation}: Props) {
    const {historyItem} = route.params;

    const [detail, setDetail] = useState<ActivityHistoryDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(true);
    const [detailError, setDetailError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        async function loadDetail() {
            try {
                setLoadingDetail(true);
                setDetailError(null);

                const result = await getActivityHistoryDetail(historyItem.id);

                if (mounted) {
                    setDetail(result);
                }
            } catch (error) {
                if (mounted) {
                    setDetailError(
                        error instanceof Error
                            ? error.message
                            : 'Unable to load full submission detail.',
                    );
                }
            } finally {
                if (mounted) {
                    setLoadingDetail(false);
                }
            }
        }

        void loadDetail();

        return () => {
            mounted = false;
        };
    }, [historyItem.id]);

    const displayItem = detail ?? historyItem;

    const itemAsRecord = useMemo(
        () => displayItem as unknown as Record<string, unknown>,
        [displayItem],
    );

    const payload = useMemo(() => extractPayload(itemAsRecord), [itemAsRecord]);
    const reflection = useMemo(() => extractReflection(itemAsRecord, payload), [itemAsRecord, payload]);
    const rating = useMemo(() => extractRating(itemAsRecord, payload), [itemAsRecord, payload]);
    const attempts = useMemo(() => extractAttemptData(payload), [payload]);

    const learningSummary = buildLearningSummary(displayItem.score, reflection, rating, attempts);
    const smartFeedback = buildSmartFeedback(displayItem.score, reflection, attempts);
    const isSensorData = useMemo(() => isSensorSampleCollection(attempts), [attempts]);
    const samplePreview = useMemo(() => attempts.slice(0, 8), [attempts]);

    if (loadingDetail) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading submission details..."/>
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <AppText variant="caption" color="textMuted">
                Submitted activity
            </AppText>

            <AppText variant="title" style={styles.title}>
                {getActivityTitle(displayItem.activityId)}
            </AppText>

            <View style={styles.badgeRow}>
                <AppBadge label={getActivityCategory(displayItem.activityId)} tone="info"/>
                <AppBadge label={getActivityDifficulty(displayItem.activityId)} tone="warning"/>
                <AppBadge label={formatStatus(displayItem.status)} tone="success"/>
            </View>

            {detailError ? (
                <InfoBanner
                    title="Using summary record"
                    message={detailError}
                    tone="warning"
                />
            ) : null}

            <AppCard style={styles.card}>
                <AppText variant="subtitle">Submission Summary</AppText>

                <View style={styles.metaGrid}>
                    <View style={styles.metaItem}>
                        <AppText variant="caption" color="textMuted">Score</AppText>
                        <AppText variant="bodyStrong" style={styles.metaValue}>
                            {getReadableScore(displayItem.score)}
                        </AppText>
                    </View>

                    <View style={styles.metaItem}>
                        <AppText variant="caption" color="textMuted">Team</AppText>
                        <AppText variant="bodyStrong" style={styles.metaValue}>
                            {displayItem.teamId ?? 'Individual'}
                        </AppText>
                    </View>

                    <View style={styles.metaItem}>
                        <AppText variant="caption" color="textMuted">Activity ID</AppText>
                        <AppText variant="bodyStrong" style={styles.metaValue}>
                            {displayItem.activityId}
                        </AppText>
                    </View>

                    <View style={styles.metaItem}>
                        <AppText variant="caption" color="textMuted">Submission ID</AppText>
                        <AppText variant="bodyStrong" style={styles.metaValue}>
                            {displayItem.id}
                        </AppText>
                    </View>
                </View>
            </AppCard>

            <AppCard style={styles.card}>
                <AppText variant="subtitle">Learning Summary</AppText>
                <AppText variant="body" color="textMuted" style={styles.sectionBody}>
                    {learningSummary}
                </AppText>
            </AppCard>

            {reflection ? (
                <AppExpandableCard title="Reflection" defaultExpanded>
                    <AppText variant="body" color="textMuted" style={styles.sectionBody}>
                        {safeText(reflection)}
                    </AppText>
                </AppExpandableCard>
            ) : (
                <InfoBanner
                    title="No reflection stored"
                    message="This submission does not include a readable reflection field."
                    tone="info"
                />
            )}

            {rating ? (
                <AppCard style={styles.card}>
                    <AppText variant="caption" color="textMuted">Rating</AppText>
                    <AppText variant="bodyStrong" style={styles.metaValue}>
                        {safeText(rating)}
                    </AppText>
                </AppCard>
            ) : null}

            <AppExpandableCard title="Detailed Attempt Data Breakdown" defaultExpanded>
                {attempts.length > 0 ? (
                    isSensorData ? (
                        <View style={styles.attemptList}>
                            <View style={styles.attemptItem}>
                                <AppText variant="bodyStrong">
                                    Attempt 1
                                </AppText>

                                <AppText variant="caption" color="textMuted" style={styles.attemptSummary}>
                                    {renderSensorDataSummary(attempts)}
                                </AppText>
                            </View>

                            <View style={styles.samplePreviewBox}>
                                <AppText variant="bodyStrong">
                                    Sensor Sample Preview
                                </AppText>

                                <AppText variant="caption" color="textMuted" style={styles.sectionBody}>
                                    Showing first {samplePreview.length} of {attempts.length} recorded samples.
                                </AppText>

                                {samplePreview.map((sample, index) => (
                                    <View key={`sample-${index}`} style={styles.sampleItem}>
                                        <AppText variant="caption" color="textMuted">
                                            Sample {index + 1}
                                        </AppText>

                                        <AppText variant="caption" color="textMuted" style={styles.attemptSummary}>
                                            {renderAttemptSummary(sample)}
                                        </AppText>
                                    </View>
                                ))}

                                {attempts.length > samplePreview.length ? (
                                    <AppText variant="caption" color="textMuted" style={styles.sectionBody}>
                                        +{attempts.length - samplePreview.length} more samples stored in the raw
                                        payload.
                                    </AppText>
                                ) : null}
                            </View>
                        </View>
                    ) : (
                        <View style={styles.attemptList}>
                            {attempts.map((attempt, index) => (
                                <View key={`attempt-${index}`} style={styles.attemptItem}>
                                    <AppText variant="bodyStrong">
                                        {getAttemptTitle(attempt, index)}
                                    </AppText>

                                    <AppText variant="caption" color="textMuted" style={styles.attemptSummary}>
                                        {renderAttemptSummary(attempt)}
                                    </AppText>
                                </View>
                            ))}
                        </View>
                    )
                ) : (
                    <AppText variant="body" color="textMuted" style={styles.sectionBody}>
                        No detailed attempt or trial data was found for this submission.
                    </AppText>
                )}
            </AppExpandableCard>

            <AppExpandableCard title="Smart Feedback" defaultExpanded>
                <AppText variant="body" color="textMuted" style={styles.sectionBody}>
                    {smartFeedback}
                </AppText>
            </AppExpandableCard>

            {payload ? (
                <AppExpandableCard title="Submitted Data / Raw Payload">
                    <AppText variant="caption" color="textMuted" style={styles.payloadText}>
                        {safeText(payload)}
                    </AppText>
                </AppExpandableCard>
            ) : (
                <InfoBanner
                    title="Limited submission data"
                    message="The full submission was loaded, but no detailed payload field was found."
                    tone="warning"
                />
            )}

            <View style={styles.footer}>
                <AppButton
                    title="Back to Activity History"
                    variant="secondary"
                    onPress={() => navigation.goBack()}
                />
            </View>
        </AppGradientScreen>
    );
}

const styles = StyleSheet.create({
    title: {
        marginTop: spacing.xs,
    },

    badgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginTop: spacing.lg,
    },

    card: {
        marginTop: spacing.lg,
    },

    metaGrid: {
        marginTop: spacing.md,
        gap: spacing.md,
    },

    metaItem: {
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
        paddingLeft: spacing.md,
    },

    metaValue: {
        marginTop: spacing.xs,
    },

    sectionBody: {
        marginTop: spacing.sm,
        lineHeight: 22,
    },

    attemptList: {
        marginTop: spacing.sm,
        gap: spacing.md,
    },

    attemptItem: {
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
        paddingLeft: spacing.md,
    },

    attemptSummary: {
        marginTop: spacing.sm,
        lineHeight: 20,
    },

    payloadText: {
        marginTop: spacing.sm,
        fontFamily: 'monospace',
        lineHeight: 20,
    },

    footer: {
        marginTop: spacing.xl,
        marginBottom: spacing.lg,
    },
    
    samplePreviewBox: {
        marginTop: spacing.md,
        gap: spacing.sm,
    },

    sampleItem: {
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
});