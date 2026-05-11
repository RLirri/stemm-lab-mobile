import React, {useEffect, useMemo, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {getActivityById} from '../../../services/activityService';
import {SOUND_RISK_BANDS} from '../../../services/scoringService';
import type {Activity} from '../../../types/activity';
import {auth} from '../../../services/firebase';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppExpandableCard,
    AppGradientScreen,
    AppSectionHeader,
    AppText,
    EmptyState,
    LoadingState,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A2Overview'>;

function normalizeText(x: unknown): string | undefined {
    const s = typeof x === 'string' ? x.trim() : '';
    return s.length ? s : undefined;
}

function splitLines(x: string): string[] {
    return x
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean);
}

function safeStringArray(x: unknown): string[] {
    if (!Array.isArray(x)) return [];
    return x
        .filter((v) => typeof v === 'string' && v.trim().length)
        .map((v) => (v as string).trim());
}

function formatDbRange(minDb: number, maxDb: number | null): string {
    if (maxDb == null) return `${minDb}+ dB`;
    return `${minDb}–${maxDb} dB`;
}

function removeLeadingNumber(text: string) {
    return text.replace(/^\d+\)\s*/, '');
}

export default function A2OverviewScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;

    const [activity, setActivity] = useState<Activity | null>(null);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        let mounted = true;

        async function load() {
            try {
                setLoading(true);
                const a = await getActivityById(activityId);
                if (!mounted) return;
                setActivity(a);
            } catch (e: any) {
                if (!mounted) return;
                setActivity(null);
                Alert.alert('Load error', e?.message ?? 'Failed to load activity.');
            } finally {
                if (!mounted) return;
                setLoading(false);
            }
        }

        void load();
        return () => {
            mounted = false;
        };
    }, [activityId]);

    const title = useMemo(
        () => normalizeText(activity?.title) ?? 'Sound Pollution Hunter',
        [activity?.title],
    );

    const shortDesc = useMemo(() => {
        const a = activity as any;
        return (
            normalizeText(a?.shortDescription) ??
            'Measure and compare classroom sound levels (dB), record locations, and map loud vs quiet zones.'
        );
    }, [activity]);

    const overview = useMemo(() => {
        const a = activity as any;
        return (
            normalizeText(a?.description) ??
            'Students measure noise from different actions, record sound levels with GPS, then map loud and quiet zones. They predict the loudest action and reflect on whether earmuffs are needed.'
        );
    }, [activity]);

    const equipment = useMemo(() => {
        const a = activity as any;
        const list = safeStringArray(a?.equipment);
        if (list.length) return list;
        return ['Mobile phone with STEMM Lab app', 'Everyday objects such as pens or books'];
    }, [activity]);

    const instructionLines = useMemo(() => {
        const a = activity as any;
        const inst = normalizeText(a?.instructions);
        if (inst) return splitLines(inst);

        return [
            'Measure noise from different actions.',
            'Record sound levels and locations.',
            'Map loud and quiet zones.',
            'Predict the loudest action, then check if you were correct.',
            'Submit at least 3 valid measurements, video evidence, and reflection.',
        ];
    }, [activity]);

    async function onStart() {
        if (!user) {
            Alert.alert('Sign in required', 'Please sign in to start this activity.');
            return;
        }

        try {
            setStarting(true);
            navigation.navigate('A2SessionSetup', {activityId});
        } catch (e: any) {
            Alert.alert('Start failed', e?.message ?? 'Unable to start Activity 2.');
        } finally {
            setStarting(false);
        }
    }

    function onBack() {
        navigation.goBack();
    }

    if (loading) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading activity overview..."/>
            </AppGradientScreen>
        );
    }

    if (!activity) {
        return (
            <AppGradientScreen scroll={false}>
                <EmptyState
                    title="Activity not found"
                    message="This activity may be missing from Firestore or the provided activityId is invalid."
                    actionLabel="Back"
                    onAction={onBack}
                />
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen>
            <View style={styles.header}>
                <AppBadge label="Activity 2" tone="primary"/>

                <AppText variant="title" style={styles.title}>
                    {title}
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    {shortDesc}
                </AppText>
            </View>

            <AppCard>
                <AppText variant="sectionTitle">Ready to begin?</AppText>

                <AppText variant="caption" color="textMuted" style={styles.cardText}>
                    Start the setup flow when your team is ready. You can review the activity details below before
                    continuing.
                </AppText>

                <AppButton
                    title={starting ? 'Starting...' : 'Start Activity'}
                    onPress={onStart}
                    disabled={starting}
                    loading={starting}
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
                subtitle="Review the purpose, equipment, steps, and submission expectations."
            />

            <AppExpandableCard title="Overview" defaultExpanded>
                <AppText variant="body" color="textMuted">
                    {overview}
                </AppText>
            </AppExpandableCard>

            <AppExpandableCard title="Equipment">
                {equipment.map((item, index) => (
                    <Bullet key={`${item}-${index}`} text={item}/>
                ))}
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

            <AppExpandableCard title="Hearing Damage Risk Table">
                <AppText variant="body" color="textMuted" style={styles.cardText}>
                    Use this table to assign a risk category for each measurement. Then answer whether earmuffs are
                    needed.
                </AppText>

                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <AppText variant="caption" style={styles.cell}>
                            Sound Level
                        </AppText>
                        <AppText variant="caption" style={styles.cell}>
                            Risk
                        </AppText>
                    </View>

                    {SOUND_RISK_BANDS.map((band) => (
                        <View key={`${band.minDb}-${String(band.maxDb)}`} style={styles.tableRow}>
                            <AppText variant="caption" style={styles.cell}>
                                {formatDbRange(band.minDb, band.maxDb)}
                            </AppText>
                            <AppText variant="caption" style={styles.cell}>
                                {band.label}
                            </AppText>
                        </View>
                    ))}
                </View>

                <AppText variant="caption" color="textMuted" style={styles.note}>
                    Submission policy: minimum 3 valid measurements + 1 session video evidence.
                </AppText>
            </AppExpandableCard>

            <AppExpandableCard title="Write-up Prompts">
                <Bullet text="Predict which action created the loudest sound."/>
                <Bullet text="Record results for at least 3 actions."/>
                <Bullet text="Were you right? Why or why not?"/>
                <Bullet text="Any surprises? Explain using surface, material, or energy."/>
                <Bullet text="Should we wear earmuffs? Use the risk table as evidence."/>
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
        lineHeight: 20,
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
        paddingHorizontal: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.divider,
    },

    tableHeader: {
        borderTopWidth: 0,
        backgroundColor: colors.surfaceMuted,
    },

    cell: {
        flex: 1,
    },

    note: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});