import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    ActivityIndicator,
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
    type Activity3RunDraft,
    createActivity3RunDraft,
    discardActivity3RunDraft,
    type FanFoldType,
    getActivity3RunDraft,
    getLatestRecoverableActivity3RunDraft,
    hydrateActivity3RunDraftFromLocalDb,
    setActivity3SessionVideo,
    type SurfaceContext,
    updateActivity3FanDesign,
    updateActivity3Session,
    validateA3Session,
} from '../../../store/activity3RunDraftStore';

import {pickVideoFromLibrary, recordVideoWithCamera,} from '../../../services/evidenceService';
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

type Props = NativeStackScreenProps<AppStackParamList, 'A3SessionSetup'>;

function toNumberOrUndefined(raw: string): number | undefined {
    const v = raw.trim();
    if (!v) return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

async function requestGpsPermissionSafe(): Promise<'granted' | 'denied'> {
    try {
        const Location = await import('expo-location');
        const res = await Location.requestForegroundPermissionsAsync();
        return res.status === 'granted' ? 'granted' : 'denied';
    } catch {
        return 'denied';
    }
}

export default function A3SessionSetupScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;
    const routeRunId = route.params.runId;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);
    const [bootstrapping, setBootstrapping] = useState(true);

    const hasBootstrappedRef = useRef(false);

    const [surface, setSurface] = useState<SurfaceContext | undefined>(undefined);
    const [designCountRaw, setDesignCountRaw] = useState<string>('3');

    const [advancedMode, setAdvancedMode] = useState<boolean>(false);
    const [stiffnessKRaw, setStiffnessKRaw] = useState<string>('');

    const [gpsEnabled, setGpsEnabled] = useState<boolean>(true);
    const [gpsPermission, setGpsPermission] = useState<
        'unknown' | 'granted' | 'denied'
    >('unknown');
    const [askingGps, setAskingGps] = useState(false);

    const [attachingVideo, setAttachingVideo] = useState(false);

    useEffect(() => {
        if (!user) return;
        if (hasBootstrappedRef.current) return;

        hasBootstrappedRef.current = true;
        const userId = user.uid;

        async function bootstrap() {
            try {
                setBootstrapping(true);

                if (routeRunId) {
                    const existing = getActivity3RunDraft(routeRunId);
                    if (existing) {
                        setDraft(existing);
                        return;
                    }

                    const hydrated = await hydrateActivity3RunDraftFromLocalDb(routeRunId);
                    if (hydrated) {
                        setDraft(hydrated);
                        navigation.setParams({runId: hydrated.runId});
                        return;
                    }

                    const recreated = createActivity3RunDraft({
                        activityId,
                        createdBy: userId,
                        fanDesignCount: 3,
                        advancedMode: false,
                    });
                    setDraft(recreated);
                    navigation.setParams({runId: recreated.runId});
                    return;
                }

                const recoverable = await getLatestRecoverableActivity3RunDraft({
                    activityId,
                    createdBy: userId,
                });

                if (recoverable) {
                    Alert.alert(
                        'Resume previous draft?',
                        'We found an unfinished Activity 3 draft. Would you like to continue it or start a new session?',
                        [
                            {
                                text: 'Start New',
                                style: 'destructive',
                                onPress: async () => {
                                    try {
                                        await discardActivity3RunDraft(recoverable.runId);
                                    } catch (error) {
                                        console.error(
                                            '[A3SessionSetup] Failed to discard old draft',
                                            error,
                                        );
                                    }

                                    const created = createActivity3RunDraft({
                                        activityId,
                                        createdBy: userId,
                                        fanDesignCount: 3,
                                        advancedMode: false,
                                    });
                                    setDraft(created);
                                    navigation.setParams({runId: created.runId});
                                },
                            },
                            {
                                text: 'Resume',
                                onPress: () => {
                                    setDraft(recoverable);
                                    navigation.setParams({runId: recoverable.runId});
                                },
                            },
                        ],
                    );
                    return;
                }

                const created = createActivity3RunDraft({
                    activityId,
                    createdBy: userId,
                    fanDesignCount: 3,
                    advancedMode: false,
                });
                setDraft(created);
                navigation.setParams({runId: created.runId});
            } catch (error) {
                console.error('[A3SessionSetup] Failed to bootstrap draft', error);

                const fallback = createActivity3RunDraft({
                    activityId,
                    createdBy: userId,
                    fanDesignCount: 3,
                    advancedMode: false,
                });
                setDraft(fallback);
                navigation.setParams({runId: fallback.runId});
            } finally {
                setBootstrapping(false);
            }
        }

        void bootstrap();
    }, [activityId, navigation, routeRunId, user]);

    useEffect(() => {
        if (!draft) return;
        const s = draft.session;

        setSurface(s.surfaceContext);
        setDesignCountRaw(String(s.fanDesignCount));

        setAdvancedMode(Boolean(s.advancedMode));
        setStiffnessKRaw(s.stiffnessK != null ? String(s.stiffnessK) : '');

        setGpsEnabled(Boolean(s.gpsEnabled));
        setGpsPermission(s.gpsPermission);
    }, [draft]);

    const sessionError = useMemo(() => {
        if (!draft) return null;

        const fanDesignCount = clampInt(Number(designCountRaw || '3'), 1, 8);
        const stiffnessK = advancedMode ? toNumberOrUndefined(stiffnessKRaw) : undefined;

        const shadow: Activity3RunDraft = {
            ...draft,
            session: {
                ...draft.session,
                surfaceContext: surface,
                fanDesignCount,
                advancedMode,
                stiffnessK,
                gpsEnabled,
                gpsPermission,
            },
        };

        return validateA3Session(shadow);
    }, [
        advancedMode,
        designCountRaw,
        draft,
        gpsEnabled,
        gpsPermission,
        stiffnessKRaw,
        surface,
    ]);

    function persistSession() {
        if (!draft) return;

        const fanDesignCount = clampInt(Number(designCountRaw || '3'), 1, 8);
        const stiffnessK = advancedMode ? toNumberOrUndefined(stiffnessKRaw) : undefined;

        const next = updateActivity3Session(draft.runId, {
            surfaceContext: surface,
            fanDesignCount,
            advancedMode,
            stiffnessK,
            gpsEnabled,
            gpsPermission,
        });

        setDraft(next);
        return next;
    }

    async function onRequestGps() {
        if (!draft) return;

        try {
            setAskingGps(true);
            const status = await requestGpsPermissionSafe();
            const next = updateActivity3Session(draft.runId, {
                gpsPermission: status === 'granted' ? 'granted' : 'denied',
            });
            setDraft(next);
            setGpsPermission(next.session.gpsPermission);

            if (status !== 'granted') {
                Alert.alert(
                    'GPS not granted',
                    'You can still run the activity, but submission will be blocked unless GPS is enabled and granted.',
                );
            }
        } finally {
            setAskingGps(false);
        }
    }

    async function onAttachSessionVideo(source: 'camera' | 'library') {
        if (!draft) return;

        try {
            setAttachingVideo(true);

            const picked =
                source === 'camera'
                    ? await recordVideoWithCamera()
                    : await pickVideoFromLibrary();

            if (!picked) return;

            const next = setActivity3SessionVideo(draft.runId, {
                uri: picked.uri,
                createdAt: Date.now(),
            });

            setDraft(next);
        } catch (e: any) {
            Alert.alert('Video error', e?.message ?? 'Could not attach video.');
        } finally {
            setAttachingVideo(false);
        }
    }

    function onRemoveSessionVideo() {
        if (!draft) return;
        const next = setActivity3SessionVideo(draft.runId, undefined);
        setDraft(next);
    }

    function onUpdateDesign(index: number, patch: any) {
        if (!draft) return;
        try {
            const next = updateActivity3FanDesign(draft.runId, index, patch);
            setDraft(next);
        } catch (e: any) {
            Alert.alert('Design update error', e?.message ?? 'Could not update design.');
        }
    }

    async function onContinue() {
        if (!user) return;
        if (!draft) return;

        const err = sessionError;
        if (err) {
            Alert.alert('Check setup', err);
            return;
        }

        const canContinue = await confirmBatteryBeforeActivity({
            activityId,
            activityTitle: 'Activity 3: Hand Fan Challenge',
            intensity: gpsEnabled || !!draft.evidence?.sessionVideo?.uri ? 'HIGH' : 'MEDIUM',
        });

        if (!canContinue) return;

        const next = persistSession();
        if (!next) return;

        navigation.navigate('A3Prediction', {activityId, runId: next.runId});
    }

    if (!user) return null;

    if (bootstrapping || !draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Checking for unfinished Activity 3 session..."/>
            </AppGradientScreen>
        );
    }

    const sessionVideoAttached = !!draft.evidence?.sessionVideo?.uri;

    return (
        <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <AppGradientScreen>
                <View style={styles.header}>
                    <AppBadge label="Activity 3" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Hand Fan Setup
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Configure your fan designs, setup evidence, and GPS requirement before prediction.
                    </AppText>
                </View>

                <InfoBanner
                    title="Fair testing setup"
                    message="Record what makes each fan different, then test them consistently using the same distances and surface."
                    tone="info"
                />

                <AppSectionHeader
                    title="Testing Context"
                    subtitle="Optional context helps explain why results may differ."
                />

                <AppCard>
                    <AppText variant="bodyStrong">Test surface</AppText>
                    <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                        Airflow can behave differently on a table compared with the floor.
                    </AppText>

                    <View style={styles.segmentWrap}>
                        {(['table', 'floor'] as const).map((v) => (
                            <SegmentButton
                                key={v}
                                label={v}
                                active={surface === v}
                                onPress={() => setSurface(v)}
                            />
                        ))}

                        <SegmentButton
                            label="Not sure"
                            active={!surface}
                            onPress={() => setSurface(undefined)}
                        />
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Fan Designs"
                    subtitle="Set how many fan designs your team will compare."
                />

                <AppCard>
                    <AppInput
                        label="Number of designs (1–8)"
                        value={designCountRaw}
                        onChangeText={(t) => setDesignCountRaw(t.replace(/[^\d]/g, ''))}
                        placeholder="3"
                        keyboardType="number-pad"
                        maxLength={1}
                    />

                    <AppText variant="caption" color="textMuted">
                        Default is 3 designs. Increase only if your team built more versions.
                        Press Continue to normalize the design list.
                    </AppText>
                </AppCard>

                <AppSectionHeader
                    title="Design Details"
                    subtitle="Describe folds, layers, materials, and notes for each fan."
                />

                {draft.session.fanDesigns.map((d) => (
                    <AppCard key={d.index}>
                        <View style={styles.cardHeader}>
                            <View>
                                <AppBadge label={`Design ${d.index + 1}`} tone="info"/>
                                <AppText variant="sectionTitle" style={styles.designTitle}>
                                    Fan Design {d.index + 1}
                                </AppText>
                            </View>
                        </View>

                        <AppInput
                            label="Name"
                            value={d.name ?? ''}
                            onChangeText={(t) => onUpdateDesign(d.index, {name: t})}
                            placeholder={`Design ${d.index + 1}`}
                        />

                        <View style={styles.settingRow}>
                            <View style={styles.settingText}>
                                <AppText variant="bodyStrong">Has folds?</AppText>
                                <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                    Folded designs may affect airflow and stiffness.
                                </AppText>
                            </View>

                            <Switch
                                value={Boolean(d.hasFolds)}
                                onValueChange={(v) =>
                                    onUpdateDesign(d.index, {
                                        hasFolds: v,
                                        foldType: v ? d.foldType : undefined,
                                    })
                                }
                            />
                        </View>

                        <AppText variant="bodyStrong" style={styles.blockGap}>
                            Fold type
                        </AppText>

                        <View style={styles.segmentWrap}>
                            {(['flat', 'folded', 'pleated'] as FanFoldType[]).map((v) => (
                                <SegmentButton
                                    key={v}
                                    label={v}
                                    active={(d.foldType ?? 'flat') === v}
                                    onPress={() =>
                                        onUpdateDesign(d.index, {
                                            foldType: v,
                                            hasFolds: v !== 'flat',
                                        })
                                    }
                                />
                            ))}
                        </View>

                        <View style={styles.twoColumn}>
                            <View style={styles.flexItem}>
                                <AppInput
                                    label="Fold count"
                                    value={d.foldCount == null ? '' : String(d.foldCount)}
                                    onChangeText={(t) =>
                                        onUpdateDesign(d.index, {
                                            foldCount: t
                                                ? clampInt(Number(t.replace(/[^\d]/g, '')), 0, 60)
                                                : undefined,
                                        })
                                    }
                                    placeholder="e.g. 12"
                                    keyboardType="number-pad"
                                />
                            </View>

                            <View style={styles.flexItem}>
                                <AppInput
                                    label="Layers"
                                    value={d.layers == null ? '' : String(d.layers)}
                                    onChangeText={(t) =>
                                        onUpdateDesign(d.index, {
                                            layers: t
                                                ? clampInt(Number(t.replace(/[^\d]/g, '')), 1, 5)
                                                : undefined,
                                        })
                                    }
                                    placeholder="e.g. 1"
                                    keyboardType="number-pad"
                                />
                            </View>
                        </View>

                        <AppInput
                            label="Notes"
                            value={d.notes ?? ''}
                            onChangeText={(t) => onUpdateDesign(d.index, {notes: t})}
                            placeholder="e.g. no tape, wider fan, stronger handle..."
                            multiline
                            style={styles.notesInput}
                        />
                    </AppCard>
                ))}

                <AppSectionHeader
                    title="Advanced Mode"
                    subtitle="Optional high-school setting for stiffness coefficient."
                />

                <AppCard>
                    <View style={styles.settingRow}>
                        <View style={styles.settingText}>
                            <AppText variant="bodyStrong">Advanced mode</AppText>
                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                Enables stiffness coefficient k.
                            </AppText>
                        </View>

                        <Switch value={advancedMode} onValueChange={setAdvancedMode}/>
                    </View>

                    {advancedMode ? (
                        <>
                            <AppInput
                                label="Stiffness coefficient k"
                                value={stiffnessKRaw}
                                onChangeText={setStiffnessKRaw}
                                placeholder="e.g. 0.8"
                                keyboardType="decimal-pad"
                            />

                            <AppText variant="caption" color="textMuted">
                                If unknown, leave blank. You can still compare designs using bend angles.
                            </AppText>
                        </>
                    ) : (
                        <InfoBanner
                            title="Primary-school view"
                            message="Focus on distance, materials, folds, and bend angle observations."
                            tone="success"
                        />
                    )}
                </AppCard>

                <AppSectionHeader
                    title="Session Video"
                    subtitle="Required for final submission."
                />

                <AppCard>
                    <StatusRow
                        label="Video status"
                        value={sessionVideoAttached ? 'Attached' : 'Missing'}
                        good={sessionVideoAttached}
                    />

                    <AppText variant="caption" color="textMuted" style={styles.blockGap}>
                        Record one short video showing your setup and how you test the designs fairly.
                    </AppText>

                    <View style={styles.buttonRow}>
                        <AppButton
                            title={attachingVideo ? 'Recording...' : 'Record'}
                            onPress={() => onAttachSessionVideo('camera')}
                            disabled={attachingVideo}
                            variant="outline"
                            style={styles.rowButton}
                        />

                        <AppButton
                            title={attachingVideo ? 'Picking...' : 'Pick'}
                            onPress={() => onAttachSessionVideo('library')}
                            disabled={attachingVideo}
                            variant="outline"
                            style={styles.rowButton}
                        />
                    </View>

                    {sessionVideoAttached ? (
                        <AppButton
                            title="Remove video"
                            onPress={onRemoveSessionVideo}
                            variant="danger"
                            style={styles.blockGap}
                        />
                    ) : null}

                    <AppText variant="caption" color="textMuted" style={styles.blockGap}>
                        Tip: Keep it short, around 10–30 seconds. Show distance marking and bending material clearly.
                    </AppText>
                </AppCard>

                <AppSectionHeader
                    title="GPS Permission"
                    subtitle="Required before final submission."
                />

                <AppCard>
                    <View style={styles.settingRow}>
                        <View style={styles.settingText}>
                            <AppText variant="bodyStrong">Enable GPS for this run</AppText>
                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                Submission will be blocked until GPS is granted.
                            </AppText>
                        </View>

                        <Switch value={gpsEnabled} onValueChange={setGpsEnabled}/>
                    </View>

                    <StatusRow
                        label="Permission"
                        value={
                            gpsPermission === 'unknown'
                                ? 'Not requested'
                                : gpsPermission === 'granted'
                                    ? 'Granted'
                                    : 'Denied'
                        }
                        good={gpsPermission === 'granted'}
                    />

                    <AppButton
                        title={askingGps ? 'Requesting...' : 'Request GPS Permission'}
                        onPress={onRequestGps}
                        disabled={askingGps}
                        variant="outline"
                        style={styles.blockGap}
                    />

                    {askingGps ? (
                        <View style={styles.loadingInline}>
                            <ActivityIndicator color={colors.primary}/>
                            <AppText variant="caption" color="textMuted">
                                Waiting for permission response...
                            </AppText>
                        </View>
                    ) : null}

                    {gpsPermission === 'denied' ? (
                        <InfoBanner
                            title="GPS denied"
                            message="To submit later, enable location permissions in device settings and try again."
                            tone="warning"
                        />
                    ) : null}
                </AppCard>

                {sessionError ? (
                    <InfoBanner
                        title="Fix before continuing"
                        message={sessionError}
                        tone="danger"
                    />
                ) : null}

                <AppButton title="Continue to Prediction" onPress={onContinue}/>

                <AppText variant="caption" color="textMuted" style={styles.footerHint}>
                    Next: Prediction → Measurements → Results → Reflection & Submit.
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
                style={styles.segmentText}
            >
                {label}
            </AppText>
        </Pressable>
    );
}

type StatusRowProps = {
    label: string;
    value: string;
    good?: boolean;
};

function StatusRow({label, value, good = false}: StatusRowProps) {
    return (
        <View style={styles.statusRow}>
            <AppText variant="bodyStrong">{label}</AppText>

            <View
                style={[
                    styles.statusPill,
                    good ? styles.statusPillGood : styles.statusPillBad,
                ]}
            >
                <AppText
                    variant="caption"
                    color={good ? 'success' : 'danger'}
                >
                    {value} {good ? '✓' : '!'}
                </AppText>
            </View>
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

    cardHeader: {
        marginBottom: spacing.md,
    },

    designTitle: {
        marginTop: spacing.sm,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    blockGap: {
        marginTop: spacing.lg,
    },

    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        marginBottom: spacing.md,
    },

    settingText: {
        flex: 1,
    },

    segmentWrap: {
        marginTop: spacing.md,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    segmentButton: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },

    segmentButtonActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    segmentText: {
        textTransform: 'capitalize',
    },

    twoColumn: {
        flexDirection: 'row',
        gap: spacing.md,
        marginTop: spacing.lg,
    },

    flexItem: {
        flex: 1,
    },

    notesInput: {
        minHeight: 90,
        textAlignVertical: 'top',
    },

    buttonRow: {
        flexDirection: 'row',
        gap: spacing.md,
        marginTop: spacing.lg,
    },

    rowButton: {
        flex: 1,
    },

    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.md,
    },

    statusPill: {
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
    },

    statusPillGood: {
        backgroundColor: colors.successSoft,
    },

    statusPillBad: {
        backgroundColor: colors.dangerSoft,
    },

    loadingInline: {
        marginTop: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },

    footerHint: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});