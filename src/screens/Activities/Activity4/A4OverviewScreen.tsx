import React from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {activity04_earthquake} from '../../../features/activities/definitions/activity04_earthquake';
import {createActivity4RunDraft} from '../../../store/activity4RunDraftStore';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A4Overview'>;

export default function A4OverviewScreen({navigation}: Props) {
    const activity = activity04_earthquake;

    function onBack() {
        navigation.goBack();
    }

    function onStart() {
        const draft = createActivity4RunDraft({
            activityId: activity.id,
            designCount: 3,
            gpsEnabled: true,
        });


        navigation.navigate('A4SessionSetup', {
            activityId: activity.id,
            runId: draft.runId,
        });
    }

    const instructionLines = activity.instructions
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 4" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    {activity.title}
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    {activity.shortDescription}
                </AppText>
            </View>

            <AppCard>
                <AppText variant="sectionTitle">Ready to begin?</AppText>

                <AppText variant="caption" color="textMuted" style={styles.cardText}>
                    Build and test structures using vibration and accelerometer movement data.
                </AppText>

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
                subtitle="Review the objective, testing process, equipment, and scoring rules."
            />

            <AppExpandableCard title="Objective" defaultExpanded>
                <AppText variant="body" color="textMuted">
                    Design a structure that reduces phone movement during a 10-second vibration test,
                    simulating an earthquake.
                </AppText>
            </AppExpandableCard>

            <AppExpandableCard title="How It Works">
                <StepItem index={1} text="The app activates vibration for 10 seconds."/>
                <StepItem index={2} text="The accelerometer records movement in X, Y, and Z."/>
                <StepItem index={3} text="A movement magnitude score is computed."/>
                <StepItem index={4} text="Lower movement score means a more stable structure."/>
            </AppExpandableCard>

            <AppExpandableCard title="Equipment">
                {Array.isArray(activity.equipment) && activity.equipment.length > 0 ? (
                    activity.equipment.map((item) => <Bullet key={item} text={item}/>)
                ) : (
                    <AppText variant="body" color="textMuted">
                        No equipment specified.
                    </AppText>
                )}
            </AppExpandableCard>

            <AppExpandableCard title="Instructions">
                {instructionLines.map((line, index) => (
                    <StepItem
                        key={`${line}-${index}`}
                        index={index + 1}
                        text={removeLeadingNumber(line)}
                    />
                ))}
            </AppExpandableCard>

            <AppExpandableCard title="Scoring and Submission">
                <AppText variant="body" color="textMuted" style={styles.cardText}>
                    Leaderboard score is based on the lowest movement magnitude.
                </AppText>

                <View style={styles.requirementBox}>
                    <Bullet text="Sensor data captured"/>
                    <Bullet text="1 session video evidence"/>
                    <Bullet text="GPS enabled and granted"/>
                    <Bullet text="Reflection and rating completed"/>
                </View>
            </AppExpandableCard>

            <View style={styles.bottomSpace}/>
        </AppGradientScreen>
    );
}

function removeLeadingNumber(text: string) {
    return text.replace(/^\d+\)\s*/, '');
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
        marginTop: spacing.sm,
    },

    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: spacing.md,
        gap: spacing.md,
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
        marginTop: spacing.md,
        gap: spacing.md,
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

    requirementBox: {
        marginTop: spacing.sm,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});