import React, {useMemo} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppExpandableCard,
    AppGradientScreen,
    AppSectionHeader,
    AppText,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A6Overview'>;

export default function A6OverviewScreen({route, navigation}: Props) {
    const {activityId} = route.params;

    const tableRows = useMemo(
        () => [
            {attempt: 'Attempt 1', prediction: 'e.g. 320 ms', outcome: 'e.g. 290 ms', right: 'Yes / No'},
            {attempt: 'Attempt 2', prediction: 'e.g. 350 ms', outcome: 'e.g. 330 ms', right: 'Yes / No'},
            {attempt: 'Attempt 3', prediction: '—', outcome: 'Tracing accuracy', right: 'Any surprises?'},
        ],
        [],
    );

    function onStart() {
        navigation.navigate('A6SessionSetup', {activityId});
    }

    function onBack() {
        navigation.goBack();
    }

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 6" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    Reaction Board Challenge
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Neuroscience + Mathematics
                </AppText>
            </View>

            <AppCard>
                <AppText variant="sectionTitle">Ready to begin?</AppText>

                <AppText variant="caption" color="textMuted" style={styles.cardText}>
                    Measure reaction time, tracing accuracy, mean performance, and consistency.
                </AppText>

                <View style={styles.tagRow}>
                    <Tag label="Reaction time"/>
                    <Tag label="Tracing accuracy"/>
                    <Tag label="Mean + Std Dev"/>
                </View>

                <AppButton title="Start Activity" onPress={onStart} style={styles.startButton}/>

                <AppButton
                    title="Back"
                    onPress={() =>
                        Alert.alert('Back', 'Return to the previous screen?', [
                            {text: 'Cancel', style: 'cancel'},
                            {text: 'OK', onPress: onBack},
                        ])
                    }
                    variant="ghost"
                    style={styles.backButton}
                />
            </AppCard>

            <AppSectionHeader
                title="Activity Guide"
                subtitle="Review each phase, recording rules, write-up guidance, leaderboard criteria, and safety."
            />

            <AppExpandableCard title="Objective" defaultExpanded>
                <AppText variant="body" color="textMuted">
                    Measure how quickly your brain responds to a stimulus and how accurately you can trace a path.
                    Compare dominant and non-dominant hand performance using mean and standard deviation.
                </AppText>
            </AppExpandableCard>

            <AppExpandableCard title="Equipment">
                <Bullet text="Mobile phone with STEMM Lab app"/>
                <Bullet text="Clear working space"/>
                <Bullet text="Stable grip and focused environment"/>
            </AppExpandableCard>

            <AppExpandableCard title="Phase 1 — Tap Reaction">
                <AppText variant="caption" color="textMuted" style={styles.cardText}>
                    Dominant hand test with random target appearance.
                </AppText>

                <StepItem index={1} text="Select participant 1 and choose Dominant hand."/>
                <StepItem index={2} text="Enter prediction before measurement starts."/>
                <StepItem index={3} text="Wait for the target to appear, then tap as fast as possible."/>
                <StepItem index={4} text="Repeat trials, then rotate to the next participant."/>

                <Highlight text="Tip: Start from a neutral hand position for fairness."/>
            </AppExpandableCard>

            <AppExpandableCard title="Phase 2 — Swap Hands">
                <AppText variant="caption" color="textMuted" style={styles.cardText}>
                    Repeat the same procedure using the non-dominant hand.
                </AppText>

                <StepItem index={1} text="For the same participant, switch to Non-dominant hand."/>
                <StepItem index={2} text="Run the same number of trials."/>
                <StepItem index={3} text="Compare mean reaction time and consistency."/>

                <Highlight text="Observation: non-dominant hand may be slower or more variable."/>
            </AppExpandableCard>

            <AppExpandableCard title="Phase 3 — Tracing Challenge">
                <StepItem index={1} text="Start the tracing challenge for the selected participant."/>
                <StepItem index={2} text="Follow the displayed path with continuous touch."/>
                <StepItem index={3} text="Finish the trace and review deviation plus accuracy score."/>
                <StepItem index={4} text="Rotate so everyone completes at least one tracing run."/>

                <Highlight text="Accuracy is based on path deviation and normalized to a percentage."/>
            </AppExpandableCard>

            <AppExpandableCard title="What the App Records">
                <InfoRow title="Reaction trial data"
                         description="Participant, hand, trial number, timestamps, and reactionTimeMs."/>
                <InfoRow title="Tracing data"
                         description="Touch coordinates, reference path, duration, deviation, and accuracy percentage."/>
                <InfoRow title="Statistics" description="Mean reaction time and standard deviation for consistency."/>
                <InfoRow title="Submission items"
                         description="Reaction dataset, tracing results, reflection, rating, and GPS."/>
            </AppExpandableCard>

            <AppExpandableCard title="Write-up Table">
                <AppText variant="body" color="textMuted" style={styles.cardText}>
                    Use plain language to explain reaction time, practice, coordination, and hand dominance.
                </AppText>

                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <AppText variant="caption" color="inverseText" style={styles.cellAttempt}>Attempt</AppText>
                        <AppText variant="caption" color="inverseText" style={styles.cell}>Prediction</AppText>
                        <AppText variant="caption" color="inverseText" style={styles.cell}>Outcome</AppText>
                        <AppText variant="caption" color="inverseText" style={styles.cell}>Right?</AppText>
                    </View>

                    {tableRows.map((row, index) => (
                        <View key={`row_${index}`} style={styles.tableRow}>
                            <AppText variant="caption" style={styles.cellAttempt}>{row.attempt}</AppText>
                            <AppText variant="caption" style={styles.cell}>{row.prediction}</AppText>
                            <AppText variant="caption" style={styles.cell}>{row.outcome}</AppText>
                            <AppText variant="caption" style={styles.cell}>{row.right}</AppText>
                        </View>
                    ))}
                </View>
            </AppExpandableCard>

            <AppExpandableCard title="Leaderboard Rule">
                <AppText variant="body" color="textMuted">
                    Ranking prioritizes the lowest mean reaction time, but teams must meet the minimum tracing accuracy
                    threshold.
                </AppText>

                <Bullet text="Primary: lowest mean reaction time"/>
                <Bullet text="Eligibility: tracing accuracy meets the threshold"/>
                <Bullet text="Final score conversion is applied consistently with other activities"/>
            </AppExpandableCard>

            <AppExpandableCard title="Safety and Fairness">
                <Bullet text="Hold the phone securely and keep clear space around you."/>
                <Bullet text="Avoid tapping too hard."/>
                <Bullet text="Use the same posture and screen distance for all trials."/>
                <Bullet text="Minimize distractions and keep testing conditions consistent."/>
            </AppExpandableCard>

            <View style={styles.bottomSpace}/>
        </AppGradientScreen>
    );
}

function Tag({label}: { label: string }) {
    return (
        <View style={styles.tag}>
            <AppText variant="caption" color="primary">
                {label}
            </AppText>
        </View>
    );
}

function Bullet({text}: { text: string }) {
    return (
        <View style={styles.bulletRow}>
            <View style={styles.bulletDot}/>
            <AppText variant="bodyStrong" style={styles.bulletText}>{text}</AppText>
        </View>
    );
}

function StepItem({index, text}: { index: number; text: string }) {
    return (
        <View style={styles.stepRow}>
            <View style={styles.stepNumber}>
                <AppText variant="caption" color="inverseText">{index}</AppText>
            </View>
            <AppText variant="bodyStrong" style={styles.stepText}>{text}</AppText>
        </View>
    );
}

function Highlight({text}: { text: string }) {
    return (
        <View style={styles.highlight}>
            <AppText variant="caption" color="textMuted">{text}</AppText>
        </View>
    );
}

function InfoRow({title, description}: { title: string; description: string }) {
    return (
        <View style={styles.infoRow}>
            <AppText variant="bodyStrong">{title}</AppText>
            <AppText variant="caption" color="textMuted" style={styles.infoText}>
                {description}
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
    cardText: {
        marginTop: spacing.sm,
    },
    startButton: {
        marginTop: spacing.lg,
    },
    backButton: {
        marginTop: spacing.md,
    },
    tagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginTop: spacing.md,
    },
    tag: {
        borderRadius: radius.pill,
        backgroundColor: colors.primarySoft,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        marginTop: spacing.md,
    },
    bulletDot: {
        width: 8,
        height: 8,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
        marginTop: 7,
    },
    bulletText: {
        flex: 1,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        marginTop: spacing.md,
    },
    stepNumber: {
        width: 26,
        height: 26,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepText: {
        flex: 1,
        paddingTop: 2,
    },
    highlight: {
        marginTop: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
    },
    infoRow: {
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        marginTop: spacing.md,
    },
    infoText: {
        marginTop: spacing.xs,
    },
    table: {
        marginTop: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        overflow: 'hidden',
        backgroundColor: colors.surface,
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.divider,
    },
    tableHeader: {
        borderTopWidth: 0,
        backgroundColor: colors.primaryDark,
    },
    cellAttempt: {
        flex: 1,
    },
    cell: {
        flex: 1.15,
    },
    bottomSpace: {
        height: spacing.xxl,
    },
});