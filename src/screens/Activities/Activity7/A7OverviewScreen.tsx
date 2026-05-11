import React, {useMemo} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import activity07_breathingPaceTrainer from '../../../features/activities/definitions/activity07_breathingPaceTrainer';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A7Overview'>;

export default function A7OverviewScreen({route, navigation}: Props) {
    const activity = activity07_breathingPaceTrainer;
    const activityId = route.params?.activityId ?? activity.id;

    const equipment = Array.isArray(activity.equipment) ? activity.equipment : [];

    const tableRows = useMemo(
        () => [
            {
                stage: 'Breathing at Rest',
                prediction: 'e.g. 12 breaths/min',
                outcome: 'Measured BPM',
                right: 'Yes / No',
            },
            {
                stage: 'After 1-min Jog',
                prediction: 'e.g. 20 breaths/min',
                outcome: 'Measured BPM',
                right: 'Yes / No',
            },
            {
                stage: 'After Star Jumps',
                prediction: 'e.g. 24 breaths/min',
                outcome: 'Measured BPM',
                right: 'Surprises?',
            },
        ],
        [],
    );

    function onStart() {
        navigation.navigate('A7SessionSetup', {activityId});
    }

    function onBack() {
        navigation.goBack();
    }

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 7" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    {activity.title}
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Medical Science
                </AppText>
            </View>

            <AppCard>
                <AppText variant="sectionTitle">Ready to begin?</AppText>

                <AppText variant="caption" color="textMuted" style={styles.cardText}>
                    Analyse breathing at rest and after exercise using accelerometer-based chest motion data.
                </AppText>

                <View style={styles.tagRow}>
                    <Tag label="Chest motion"/>
                    <Tag label="Breaths/min"/>
                    <Tag label="Recovery"/>
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
                subtitle="Review phases, measurement rules, write-up guidance, leaderboard criteria, and safety."
            />

            <AppExpandableCard title="Objective" defaultExpanded>
                <AppText variant="body" color="textMuted">
                    Investigate how breathing changes from rest to exercise, then compare how consistently breathing
                    begins to recover across the required post-exercise phases.
                </AppText>
            </AppExpandableCard>

            <AppExpandableCard title="Equipment">
                {equipment.length > 0 ? (
                    equipment.map((item) => <Bullet key={item} text={item}/>)
                ) : (
                    <>
                        <Bullet text="Mobile phone with STEMM Lab app"/>
                        <Bullet text="Flat surface or mat"/>
                    </>
                )}
            </AppExpandableCard>

            <AppExpandableCard title="Phase 0 — Prediction">
                <StepItem index={1} text="Enter predicted breathing rate at rest."/>
                <StepItem index={2} text="Enter predicted breathing rate after exercise."/>
                <StepItem index={3} text="Predict which phase may show the highest breathing rate."/>
                <Highlight text="Prediction is required before recording starts."/>
            </AppExpandableCard>

            <AppExpandableCard title="Phase 1 — Rest Measurement">
                <StepItem index={1} text="Select the participant."/>
                <StepItem index={2} text="Place the phone gently on the chest."/>
                <StepItem index={3} text="Keep the participant as still as possible."/>
                <StepItem index={4} text="Save the measured breathing rate for the rest phase."/>
                <Highlight text="Use consistent phone placement for all phases to improve fairness."/>
            </AppExpandableCard>

            <AppExpandableCard title="Phase 2 — Post-Exercise 1">
                <StepItem index={1} text="Ask the participant to jog on the spot for one minute."/>
                <StepItem index={2} text="Place the phone gently on the chest again."/>
                <StepItem index={3} text="Record breathing using the same duration."/>
                <StepItem index={4} text="Save the post-jog breathing result."/>
            </AppExpandableCard>

            <AppExpandableCard title="Phase 3 — Post-Exercise 2">
                <StepItem index={1} text="Ask the participant to complete 100 star jumps."/>
                <StepItem index={2} text="Place the phone gently on the chest again."/>
                <StepItem index={3} text="Record breathing with the same setup."/>
                <StepItem index={4} text="Save the result and rotate to the next participant."/>
            </AppExpandableCard>

            <AppExpandableCard title="What the App Records">
                <InfoRow title="Sensor dataset"
                         description="Accelerometer x/y/z values, timestamps, and sampling metadata."/>
                <InfoRow title="Breathing outputs"
                         description="Estimated breaths per minute, detected cycles, and duration."/>
                <InfoRow title="Comparison metrics"
                         description="Rest → jog, rest → star jumps, jog → star jumps, and recovery consistency."/>
                <InfoRow title="Submission items"
                         description="All phase datasets, reflection, rating, GPS, and optional session video."/>
            </AppExpandableCard>

            <AppExpandableCard title="Write-up Table">
                <AppText variant="body" color="textMuted" style={styles.cardText}>
                    Breathing rate usually increases during exercise because the body needs more oxygen.
                </AppText>

                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <AppText variant="caption" color="inverseText" style={styles.cellStage}>Stage</AppText>
                        <AppText variant="caption" color="inverseText" style={styles.cell}>Prediction</AppText>
                        <AppText variant="caption" color="inverseText" style={styles.cell}>Outcome</AppText>
                        <AppText variant="caption" color="inverseText" style={styles.cellSmall}>Right?</AppText>
                    </View>

                    {tableRows.map((row, index) => (
                        <View key={`row_${index}`} style={styles.tableRow}>
                            <AppText variant="caption" style={styles.cellStage}>{row.stage}</AppText>
                            <AppText variant="caption" style={styles.cell}>{row.prediction}</AppText>
                            <AppText variant="caption" style={styles.cell}>{row.outcome}</AppText>
                            <AppText variant="caption" style={styles.cellSmall}>{row.right}</AppText>
                        </View>
                    ))}
                </View>
            </AppExpandableCard>

            <AppExpandableCard title="Leaderboard Rule">
                <AppText variant="body" color="textMuted">
                    Ranking prioritises the best recovery consistency result. Lower recovery variability indicates a
                    more stable breathing recovery pattern.
                </AppText>

                <Bullet text="Primary: lowest recovery consistency score"/>
                <Bullet text="All required breathing phases must be completed"/>
                <Bullet text="Best participant result is stored with the team submission"/>
            </AppExpandableCard>

            <AppExpandableCard title="Safety and Fairness">
                <Bullet text="Place the phone gently on the chest and avoid pressing too hard."/>
                <Bullet text="Use the same phone placement style for all phases."/>
                <Bullet text="Keep the participant still during each recording window."/>
                <Bullet text="Allow enough space for jogging and star jumps."/>
                <Bullet text="Stop immediately if discomfort, dizziness, or pain occurs."/>
            </AppExpandableCard>

            <AppExpandableCard title="Submission Requirements">
                <Bullet text="Sensor readings for all required phases"/>
                <Bullet text="Reflection text completed"/>
                <Bullet text="Rating submitted (1–5)"/>
                <Bullet text="GPS coordinates captured"/>
                <Bullet text="Optional session video evidence"/>
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
            <AppText variant="bodyStrong" style={styles.bulletText}>
                {text}
            </AppText>
        </View>
    );
}

function StepItem({index, text}: { index: number; text: string }) {
    return (
        <View style={styles.stepRow}>
            <View style={styles.stepNumber}>
                <AppText variant="caption" color="inverseText">
                    {index}
                </AppText>
            </View>

            <AppText variant="bodyStrong" style={styles.stepText}>
                {text}
            </AppText>
        </View>
    );
}

function Highlight({text}: { text: string }) {
    return (
        <View style={styles.highlight}>
            <AppText variant="caption" color="textMuted">
                {text}
            </AppText>
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
    cellStage: {
        flex: 1.2,
    },
    cell: {
        flex: 1.1,
    },
    cellSmall: {
        flex: 0.9,
    },
    bottomSpace: {
        height: spacing.xxl,
    },
});