import React from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {activity05_humanPerformance} from '../../../features/activities/definitions/activity05_humanPerformance';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A5Overview'>;

export default function A5OverviewScreen({navigation}: Props) {
    const activity = activity05_humanPerformance;

    function onStart() {
        navigation.navigate('A5SessionSetup', {
            activityId: activity.id,
        });
    }

    function onBack() {
        navigation.goBack();
    }

    const equipment = Array.isArray(activity.equipment)
        ? activity.equipment
        : [];

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 5" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    {activity.title}
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    {activity.shortDescription}
                </AppText>
            </View>

            <AppCard>
                <AppText variant="sectionTitle">
                    Human Motion Investigation
                </AppText>

                <AppText variant="caption" color="textMuted" style={styles.cardText}>
                    Measure movement smoothness, control, displacement, and guided
                    motion performance using accelerometer sensor analysis.
                </AppText>

                <AppButton
                    title="Start Activity"
                    onPress={onStart}
                    style={styles.startButton}
                />

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
                subtitle="Review the movement tasks, data collection process, safety requirements, and scoring."
            />

            <AppExpandableCard title="Objective" defaultExpanded>
                <AppText variant="body" color="textMuted">
                    Investigate how the human body moves by measuring speed,
                    smoothness, and range of motion during controlled stretching
                    movements.
                </AppText>
            </AppExpandableCard>

            <AppExpandableCard title="What You Will Do">
                <StepItem index={1} text="Hold the phone firmly in one hand."/>
                <StepItem
                    index={2}
                    text="Follow at least 3 guided movement instructions."
                />
                <StepItem
                    index={3}
                    text="Record motion in Baseline mode without guidance."
                />
                <StepItem
                    index={4}
                    text="Repeat trials in Feedback mode with smoothness guidance."
                />
                <StepItem
                    index={5}
                    text="Compare movement quality across participants and trials."
                />
            </AppExpandableCard>

            <AppExpandableCard title="Guided Movements">
                <Bullet text="Movement 1 — Slow arm extension"/>
                <Bullet text="Movement 2 — Controlled forward stretch"/>
                <Bullet text="Movement 3 — Coordinated lateral motion"/>

                <View style={styles.highlightCard}>
                    <AppText variant="bodyStrong">
                        Each movement includes:
                    </AppText>

                    <Bullet text="Visual instruction or animation"/>
                    <Bullet text="Duration guidance"/>
                    <Bullet text="Posture guidance"/>
                </View>
            </AppExpandableCard>

            <AppExpandableCard title="How It Works">
                <StepItem
                    index={1}
                    text="The accelerometer continuously records X, Y, and Z motion."
                />

                <StepItem
                    index={2}
                    text="The app measures movement duration in seconds."
                />

                <StepItem
                    index={3}
                    text="The app estimates displacement magnitude."
                />

                <StepItem
                    index={4}
                    text="A smoothness index is calculated."
                />

                <StepItem
                    index={5}
                    text="Higher improvement values indicate better guided performance."
                />
            </AppExpandableCard>

            <AppExpandableCard title="Equipment">
                {equipment.length > 0 ? (
                    equipment.map((item) => (
                        <Bullet key={item} text={item}/>
                    ))
                ) : (
                    <AppText variant="body" color="textMuted">
                        No equipment specified.
                    </AppText>
                )}
            </AppExpandableCard>

            <AppExpandableCard title="Safety">
                <Bullet text="Use an open and safe movement space."/>
                <Bullet text="Keep a stable grip on the phone."/>
                <Bullet text="Move slowly and carefully."/>
                <Bullet text="Stop immediately if pain or dizziness occurs."/>
            </AppExpandableCard>

            <AppExpandableCard title="Submission Requirements">
                <Bullet text="Sensor dataset recorded"/>
                <Bullet text="Video evidence of movement trials"/>
                <Bullet text="Reflection text completed"/>
                <Bullet text="Rating submitted (1–5)"/>
                <Bullet text="GPS coordinates captured"/>
            </AppExpandableCard>

            <View style={styles.bottomSpace}/>
        </AppGradientScreen>
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

function StepItem({
                      index,
                      text,
                  }: {
    index: number;
    text: string;
}) {
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

    highlightCard: {
        marginTop: spacing.lg,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        padding: spacing.md,
        backgroundColor: colors.surfaceMuted,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});