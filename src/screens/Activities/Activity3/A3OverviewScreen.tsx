import React from 'react';
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

type Props = NativeStackScreenProps<AppStackParamList, 'A3Overview'>;


export default function A3OverviewScreen({route, navigation}: Props) {
    const {activityId} = route.params;

    function onBack() {
        navigation.goBack();
    }

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 3" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    Hand Fan Challenge
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    Physics – Air Movement & Material Response
                </AppText>
            </View>

            <AppCard>
                <AppText variant="sectionTitle">Ready to begin?</AppText>

                <AppText variant="caption" color="textMuted" style={styles.cardText}>
                    Test different fan designs and compare how materials respond to airflow.
                </AppText>

                <AppButton
                    title="Start Activity"
                    onPress={() => navigation.navigate('A3SessionSetup', {activityId})}
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
                subtitle="Review the objective, equipment, rules, and safety notes."
            />

            <AppExpandableCard title="Objective" defaultExpanded>
                <AppText variant="body" color="textMuted">
                    Compare different fan designs and measure how much flexible materials bend under airflow.
                </AppText>
            </AppExpandableCard>

            <AppExpandableCard title="Equipment">
                <Bullet text="Paper or cardboard"/>
                <Bullet text="Ruler or protractor"/>
                <Bullet text="Mobile phone with STEMM Lab app"/>
                <Bullet text="Sticky tape"/>
            </AppExpandableCard>

            <AppExpandableCard title="Distance Rule">
                <AppText variant="body" color="textMuted">
                    Maintain stable test distances during the experiment.
                </AppText>

                <View style={styles.distanceRow}>
                    <DistanceChip label="15 cm"/>
                    <DistanceChip label="30 cm"/>
                    <DistanceChip label="45 cm"/>
                </View>
            </AppExpandableCard>

            <AppExpandableCard title="What To Record">
                <StepItem index={1} text="Bend angle in degrees"/>
                <StepItem index={2} text="Material type"/>
                <StepItem index={3} text="Distance used"/>
            </AppExpandableCard>

            <AppExpandableCard title="Safety Note">
                <AppText variant="body" color="textMuted">
                    Keep the setup stable. Do not hit others and make sure the surrounding area is safe before testing.
                </AppText>
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

function DistanceChip({label}: { label: string }) {
    return (
        <View style={styles.distanceChip}>
            <AppText variant="bodyStrong" color="primary">
                {label}
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

    distanceRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginTop: spacing.md,
    },

    distanceChip: {
        borderRadius: radius.pill,
        backgroundColor: colors.primarySoft,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
    },

    bottomSpace: {
        height: spacing.xxl,
    },

    backButton: {
        marginTop: spacing.sm,
    },

});