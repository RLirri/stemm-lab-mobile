import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Switch,
    View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {
    createRunDraft,
    discardRunDraft,
    getLatestRecoverableRunDraft,
    getRunDraft,
    hydrateRunDraftFromLocalDb,
    updateSession,
    type ActivityRunDraft,
    type SessionDraft,
} from '../../../store/activityRunDraftStore';

import {confirmBatteryBeforeActivity} from '../../../services/battery';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppInput,
    AppSectionHeader,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A1SessionSetup'>;

function toNumberOrUndefined(raw: string): number | undefined {
    const v = raw.trim();
    if (!v) return undefined;
    const n = Number(v);
    if (Number.isNaN(n)) return undefined;
    return n;
}

function formatMmSs(msLeft: number) {
    const totalSec = Math.max(0, Math.floor(msLeft / 1000));
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

export default function A1SessionSetupScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;

    const [runId, setRunId] = useState<string | null>(route.params.runId ?? null);
    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);
    const [bootstrapping, setBootstrapping] = useState(true);

    const hasBootstrappedRef = useRef(false);

    const [dropHeightRaw, setDropHeightRaw] = useState<string>('');
    const [targetEnabled, setTargetEnabled] = useState<boolean>(false);
    const [targetPreset, setTargetPreset] =
        useState<SessionDraft['targetPreset']>('none');
    const [environment, setEnvironment] =
        useState<SessionDraft['environment']>('indoor');
    const [payloadType, setPayloadType] = useState<string>('');

    const [massUnknown, setMassUnknown] = useState<boolean>(false);
    const [payloadMassRaw, setPayloadMassRaw] = useState<string>('');

    const [safetyStableSurface, setSafetyStableSurface] = useState<boolean>(false);
    const [safetyKeepAreaClear, setSafetyKeepAreaClear] = useState<boolean>(false);
    const [safetyDoNotThrow, setSafetyDoNotThrow] = useState<boolean>(false);

    const [nowMs, setNowMs] = useState<number>(Date.now());
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!user) return;
        if (hasBootstrappedRef.current) return;

        hasBootstrappedRef.current = true;
        const uid = user.uid;

        async function bootstrap() {
            try {
                setBootstrapping(true);

                const existingId = route.params.runId;

                if (existingId) {
                    const existingMemory = getRunDraft(existingId);
                    if (existingMemory) {
                        setRunId(existingId);
                        setDraft(existingMemory);
                        return;
                    }

                    const hydrated = await hydrateRunDraftFromLocalDb(existingId);
                    if (hydrated) {
                        setRunId(hydrated.runId);
                        setDraft(hydrated);
                        navigation.setParams({runId: hydrated.runId});
                        return;
                    }

                    const recreated = createRunDraft(activityId, uid);
                    setRunId(recreated.runId);
                    setDraft(recreated);
                    navigation.setParams({runId: recreated.runId});
                    return;
                }

                const recoverable = await getLatestRecoverableRunDraft({
                    activityId,
                    createdBy: uid,
                });

                if (recoverable) {
                    Alert.alert(
                        'Resume previous draft?',
                        'We found an unfinished Activity 1 draft. Would you like to continue it or start a new session?',
                        [
                            {
                                text: 'Start New',
                                style: 'destructive',
                                onPress: async () => {
                                    try {
                                        await discardRunDraft(recoverable.runId);
                                    } catch (error) {
                                        console.error(
                                            '[A1SessionSetup] Failed to discard old draft',
                                            error,
                                        );
                                    }

                                    const created = createRunDraft(activityId, uid);
                                    setRunId(created.runId);
                                    setDraft(created);
                                    navigation.setParams({runId: created.runId});
                                },
                            },
                            {
                                text: 'Resume',
                                onPress: () => {
                                    setRunId(recoverable.runId);
                                    setDraft(recoverable);
                                    navigation.setParams({runId: recoverable.runId});
                                },
                            },
                        ],
                    );
                    return;
                }

                const created = createRunDraft(activityId, uid);
                setRunId(created.runId);
                setDraft(created);
                navigation.setParams({runId: created.runId});
            } catch (error) {
                console.error('[A1SessionSetup] Failed to bootstrap draft', error);

                const fallback = createRunDraft(activityId, uid);
                setRunId(fallback.runId);
                setDraft(fallback);
                navigation.setParams({runId: fallback.runId});
            } finally {
                setBootstrapping(false);
            }
        }

        void bootstrap();
    }, [activityId, navigation, route.params.runId, user]);

    useEffect(() => {
        if (!draft?.session.startedAt || !draft.session.endsAt) return;

        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = setInterval(() => setNowMs(Date.now()), 250);

        return () => {
            if (tickRef.current) clearInterval(tickRef.current);
            tickRef.current = null;
        };
    }, [draft?.session.endsAt, draft?.session.startedAt]);

    useEffect(() => {
        if (!draft) return;

        const s = draft.session;

        setDropHeightRaw(s.dropHeightM != null ? String(s.dropHeightM) : '');
        setTargetEnabled(Boolean(s.targetZoneEnabled));
        setTargetPreset(s.targetPreset ?? 'none');
        setEnvironment((s.environment ?? 'indoor') as SessionDraft['environment']);
        setPayloadType(s.payloadType ?? '');

        setMassUnknown(Boolean(s.payloadMassUnknown));
        setPayloadMassRaw(s.payloadMassG != null ? String(s.payloadMassG) : '');

        setSafetyStableSurface(Boolean(s.safety?.stableSurface));
        setSafetyKeepAreaClear(Boolean(s.safety?.keepAreaClear));
        setSafetyDoNotThrow(Boolean(s.safety?.doNotThrow));
    }, [draft]);

    const timer = useMemo(() => {
        const s = draft?.session;
        const endsAt = s?.endsAt;
        const startedAt = s?.startedAt;

        if (!startedAt || !endsAt) {
            return {
                status: 'not_started' as const,
                label: '20:00',
                msLeft: 20 * 60 * 1000,
            };
        }

        const msLeft = endsAt - nowMs;
        if (msLeft <= 0) {
            return {status: 'ended' as const, label: '00:00', msLeft: 0};
        }

        return {status: 'running' as const, label: formatMmSs(msLeft), msLeft};
    }, [draft?.session, nowMs]);

    function persistSessionPatch(patch: Partial<SessionDraft>) {
        if (!runId) return;
        const next = updateSession(runId, patch);
        setDraft(next);
    }

    function onStartChallenge() {
        if (!runId || !draft) return;

        const alreadyStarted = Boolean(draft.session.startedAt && draft.session.endsAt);
        if (alreadyStarted) return;

        const now = Date.now();
        const durationMin = draft.session.durationMin ?? 20;
        const endsAt = now + durationMin * 60 * 1000;

        persistSessionPatch({
            startedAt: now,
            endsAt,
        });
    }

    function validateBeforeContinue(): { ok: true } | { ok: false; message: string } {
        const h = toNumberOrUndefined(dropHeightRaw);
        if (h == null || h <= 0) {
            return {ok: false, message: 'Please enter Drop Height (m). It must be > 0.'};
        }

        if (targetEnabled) {
            if (!targetPreset || targetPreset === 'none') {
                return {
                    ok: false,
                    message:
                        'Target zone is enabled. Please choose a target preset (50cm or 1m).',
                };
            }
        }

        if (!massUnknown) {
            const m = toNumberOrUndefined(payloadMassRaw);
            if (m == null || m <= 0) {
                return {
                    ok: false,
                    message: 'Please enter Payload Mass (g), or toggle Unknown.',
                };
            }
        }

        if (!safetyStableSurface || !safetyKeepAreaClear || !safetyDoNotThrow) {
            return {ok: false, message: 'Please confirm all safety checklist items.'};
        }

        return {ok: true};
    }

    async function onContinue() {
        if (!user) return;
        if (!runId) return;

        const v = validateBeforeContinue();
        if (!v.ok) {
            Alert.alert('Check required fields', v.message);
            return;
        }

        const canContinue = await confirmBatteryBeforeActivity({
            activityId,
            activityTitle: 'Activity 1: Parachute Drop',
            intensity: 'MEDIUM',
        });

        if (!canContinue) return;

        const dropHeightM = toNumberOrUndefined(dropHeightRaw);
        const payloadMassG = massUnknown ? undefined : toNumberOrUndefined(payloadMassRaw);

        persistSessionPatch({
            dropHeightM,
            targetZoneEnabled: targetEnabled,
            targetPreset: targetEnabled ? targetPreset ?? 'none' : 'none',
            environment,
            payloadType: payloadType.trim() ? payloadType.trim() : undefined,
            payloadMassUnknown: massUnknown,
            payloadMassG,
            safety: {
                stableSurface: safetyStableSurface,
                keepAreaClear: safetyKeepAreaClear,
                doNotThrow: safetyDoNotThrow,
            },
        });

        navigation.navigate('A1AttemptPlan', {activityId, runId, attemptIndex: 0});
    }

    if (!user) return null;

    if (bootstrapping || !draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Checking for unfinished Activity 1 session..."/>
            </AppGradientScreen>
        );
    }

    const timerTone =
        timer.status === 'running'
            ? 'success'
            : timer.status === 'ended'
                ? 'danger'
                : 'info';

    return (
        <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <AppGradientScreen>
                <View style={styles.header}>
                    <AppBadge label="Activity 1" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Session Setup
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Configure your parachute drop session before recording attempts.
                    </AppText>
                </View>

                <InfoBanner
                    title="Before you begin"
                    message="Start the 20-minute challenge timer when your team is ready. Required fields must be completed before continuing."
                    tone="info"
                />

                <AppCard>
                    <View style={styles.cardHeader}>
                        <View>
                            <AppText variant="sectionTitle">Timed Challenge</AppText>
                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                Activity working window
                            </AppText>
                        </View>

                        <AppBadge
                            label={
                                timer.status === 'not_started'
                                    ? 'Not started'
                                    : timer.status === 'running'
                                        ? 'Running'
                                        : 'Ended'
                            }
                            tone={timerTone}
                        />
                    </View>

                    <View style={styles.timerBox}>
                        <AppText variant="title" align="center" style={styles.timerText}>
                            {timer.label}
                        </AppText>
                    </View>

                    <AppButton
                        title="Start 20-minute Challenge"
                        onPress={onStartChallenge}
                        disabled={timer.status !== 'not_started' || !draft}
                        style={styles.sectionGap}
                    />
                </AppCard>

                <AppSectionHeader
                    title="Required Inputs"
                    subtitle="These values help calculate and compare your experiment results."
                />

                <AppCard>
                    <AppInput
                        label="Drop Height (m)"
                        value={dropHeightRaw}
                        onChangeText={setDropHeightRaw}
                        placeholder="e.g. 1.5"
                        keyboardType="decimal-pad"
                    />

                    <AppText variant="caption" color="textMuted" style={styles.helpText}>
                        You may measure later, but it must be filled before attempts are saved.
                    </AppText>

                    <View style={styles.settingRow}>
                        <View style={styles.settingText}>
                            <AppText variant="bodyStrong">Landing Target Zone</AppText>
                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                Enable if you want accuracy scoring.
                            </AppText>
                        </View>

                        <Switch value={targetEnabled} onValueChange={setTargetEnabled}/>
                    </View>

                    {targetEnabled ? (
                        <View style={styles.blockGap}>
                            <AppText variant="bodyStrong">Target preset</AppText>

                            <View style={styles.segment}>
                                <SegmentButton
                                    label="Within 50cm"
                                    active={targetPreset === '50cm_circle'}
                                    onPress={() => setTargetPreset('50cm_circle')}
                                />

                                <SegmentButton
                                    label="Within 1m"
                                    active={targetPreset === '1m_circle'}
                                    onPress={() => setTargetPreset('1m_circle')}
                                />
                            </View>
                        </View>
                    ) : null}

                    <View style={styles.blockGap}>
                        <AppText variant="bodyStrong">Environment</AppText>

                        <View style={styles.segment}>
                            <SegmentButton
                                label="Indoor"
                                active={environment === 'indoor'}
                                onPress={() => setEnvironment('indoor')}
                            />

                            <SegmentButton
                                label="Outdoor"
                                active={environment === 'outdoor'}
                                onPress={() => setEnvironment('outdoor')}
                            />
                        </View>
                    </View>

                    <AppInput
                        label="Payload / toy type"
                        value={payloadType}
                        onChangeText={setPayloadType}
                        placeholder="e.g. toy soldier"
                    />

                    <View style={styles.settingRow}>
                        <View style={styles.settingText}>
                            <AppText variant="bodyStrong">Payload Mass (g)</AppText>
                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                If unknown, calculations will be limited.
                            </AppText>
                        </View>

                        <View style={styles.switchInline}>
                            <AppText variant="caption" color="textMuted">
                                Unknown
                            </AppText>
                            <Switch value={massUnknown} onValueChange={setMassUnknown}/>
                        </View>
                    </View>

                    <AppInput
                        value={payloadMassRaw}
                        onChangeText={setPayloadMassRaw}
                        placeholder="e.g. 20"
                        keyboardType="number-pad"
                        editable={!massUnknown}
                        style={massUnknown ? styles.disabledInput : undefined}
                    />
                </AppCard>

                <AppSectionHeader
                    title="Safety Checklist"
                    subtitle="Confirm all items before continuing."
                />

                <AppCard>
                    <ChecklistRow
                        checked={safetyStableSurface}
                        label="Drop from stable surface"
                        onPress={() => setSafetyStableSurface((v) => !v)}
                    />

                    <ChecklistRow
                        checked={safetyKeepAreaClear}
                        label="Keep area clear"
                        onPress={() => setSafetyKeepAreaClear((v) => !v)}
                    />

                    <ChecklistRow
                        checked={safetyDoNotThrow}
                        label="Do not throw the toy"
                        onPress={() => setSafetyDoNotThrow((v) => !v)}
                    />
                </AppCard>

                <AppButton title="Continue" onPress={onContinue} style={styles.continueButton}/>

                <AppText variant="caption" color="textMuted" style={styles.footerHint}>
                    Next: baseline attempt plan → record video → measurements → results. You can
                    run up to 3 prototypes within the timer.
                </AppText>

                <View style={styles.bottomSpace}/>
            </AppGradientScreen>
        </KeyboardAvoidingView>
    );
}

type SegmentButtonProps = {
    label: string;
    active: boolean;
    onPress: () => void;
};

function SegmentButton({label, active, onPress}: SegmentButtonProps) {
    return (
        <Pressable
            onPress={onPress}
            style={[styles.segmentButton, active && styles.segmentButtonActive]}
        >
            <AppText
                variant="caption"
                color={active ? 'inverseText' : 'text'}
                align="center"
            >
                {label}
            </AppText>
        </Pressable>
    );
}

type ChecklistRowProps = {
    checked: boolean;
    label: string;
    onPress: () => void;
};

function ChecklistRow({checked, label, onPress}: ChecklistRowProps) {
    return (
        <Pressable onPress={onPress} style={styles.checkRow}>
            <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                {checked ? (
                    <AppText variant="caption" color="inverseText">
                        ✓
                    </AppText>
                ) : null}
            </View>

            <AppText variant="bodyStrong" style={styles.checkText}>
                {label}
            </AppText>
        </Pressable>
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

    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    sectionGap: {
        marginTop: spacing.lg,
    },

    blockGap: {
        marginTop: spacing.lg,
    },

    timerBox: {
        marginTop: spacing.lg,
        borderRadius: radius.xl,
        backgroundColor: colors.accentSoft,
        paddingVertical: spacing.xl,
        alignItems: 'center',
    },

    timerText: {
        letterSpacing: 1,
    },

    helpText: {
        marginTop: -spacing.sm,
        marginBottom: spacing.md,
    },

    settingRow: {
        marginTop: spacing.lg,
        marginBottom: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    settingText: {
        flex: 1,
    },

    switchInline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },

    segment: {
        marginTop: spacing.sm,
        flexDirection: 'row',
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.xs,
        gap: spacing.xs,
    },

    segmentButton: {
        flex: 1,
        minHeight: 42,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.sm,
    },

    segmentButtonActive: {
        backgroundColor: colors.primary,
    },

    disabledInput: {
        opacity: 0.5,
    },

    checkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.md,
    },

    checkbox: {
        width: 26,
        height: 26,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: colors.primary,
        marginRight: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
    },

    checkboxOn: {
        backgroundColor: colors.primary,
    },

    checkText: {
        flex: 1,
    },

    continueButton: {
        marginTop: spacing.lg,
    },

    footerHint: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});