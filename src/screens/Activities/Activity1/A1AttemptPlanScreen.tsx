// src/screens/Activities/Activity1/A1AttemptPlanScreen.tsx

import React, {useEffect, useMemo, useState} from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';
import {
    getRunDraft,
    updateAttempt,
    type ActivityRunDraft,
    type AttemptDraft,
    type AttemptPlanDraft,
    type SessionDraft,
} from '../../../store/activityRunDraftStore';

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

type Props = NativeStackScreenProps<AppStackParamList, 'A1AttemptPlan'>;

function toNumberOrUndefined(raw: string): number | undefined {
    const v = raw.trim();
    if (!v) return undefined;
    const n = Number(v);
    if (Number.isNaN(n)) return undefined;
    return n;
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function pctDiff(a: number, b: number) {
    if (b === 0) return Infinity;
    return Math.abs((a - b) / b);
}

type ConfirmGate = {
    key: 'height' | 'mass';
    message: string;
};

function attemptLabel(index: number) {
    if (index === 0) return 'Baseline';
    return `Prototype ${index}`;
}

export default function A1AttemptPlanScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId, attemptIndex} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);
    const [attempt, setAttempt] = useState<AttemptDraft | null>(null);

    const [predictionRaw, setPredictionRaw] = useState<string>('');

    const [canopyMaterial, setCanopyMaterial] = useState<any>(undefined);
    const [canopyShape, setCanopyShape] = useState<any>(undefined);
    const [stringsCountRaw, setStringsCountRaw] = useState<string>('');
    const [canopySizeRaw, setCanopySizeRaw] = useState<string>('');
    const [stringLengthRaw, setStringLengthRaw] = useState<string>('');
    const [designNotes, setDesignNotes] = useState<string>('');

    const [dropHeightRaw, setDropHeightRaw] = useState<string>('');
    const [massUnknown, setMassUnknown] = useState<boolean>(false);
    const [payloadMassRaw, setPayloadMassRaw] = useState<string>('');

    const [pendingConfirm, setPendingConfirm] = useState<ConfirmGate | null>(null);
    const [confirmed, setConfirmed] = useState<{ height: boolean; mass: boolean }>({
        height: false,
        mass: false,
    });

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

        const a = d.attempts?.[attemptIndex];

        if (!a) {
            Alert.alert('Attempt missing', 'This attempt slot does not exist.', [
                {text: 'OK', onPress: () => navigation.goBack()},
            ]);
            return;
        }

        setDraft(d);
        setAttempt(a);
    }, [activityId, attemptIndex, navigation, runId, user]);

    useEffect(() => {
        if (!draft || !attempt) return;

        const s = draft.session;
        const plan = attempt.plan;

        setPredictionRaw(plan.predictionSec != null ? String(plan.predictionSec) : '');

        const tags = plan.designTags ?? {};
        setCanopyMaterial(tags.canopyMaterial);
        setCanopyShape(tags.canopyShape);
        setStringsCountRaw(tags.stringsCount != null ? String(tags.stringsCount) : '');
        setCanopySizeRaw(tags.canopySizeCm != null ? String(tags.canopySizeCm) : '');
        setStringLengthRaw(tags.stringLengthCm != null ? String(tags.stringLengthCm) : '');
        setDesignNotes(tags.notes ?? '');

        const dropH = plan.dropHeightM ?? s.dropHeightM;
        setDropHeightRaw(dropH != null ? String(dropH) : '');

        const massU = plan.payloadMassUnknown ?? s.payloadMassUnknown ?? false;
        setMassUnknown(Boolean(massU));

        const m = plan.payloadMassG ?? s.payloadMassG;
        setPayloadMassRaw(m != null ? String(m) : '');
    }, [attempt, draft]);

    const baselineRefs = useMemo(() => {
        if (!draft) return null;

        const base = draft.attempts?.[0];
        const session = draft.session;

        const baseHeight = base?.plan?.dropHeightM ?? session.dropHeightM;
        const baseMassUnknown =
            base?.plan?.payloadMassUnknown ?? session.payloadMassUnknown ?? false;
        const baseMassG = base?.plan?.payloadMassG ?? session.payloadMassG;

        return {
            baseHeight,
            baseMassUnknown,
            baseMassG,
        };
    }, [draft]);

    const isBaseline = attemptIndex === 0;

    function persistAttemptPlan(nextPlan: AttemptPlanDraft) {
        const next = updateAttempt(runId, attemptIndex, {
            plan: nextPlan,
        });

        setDraft(next);
        setAttempt(next.attempts[attemptIndex]);
    }

    function buildPlanFromForm(
        session: SessionDraft,
        existingPlan: AttemptPlanDraft,
    ): AttemptPlanDraft {
        const predictionSec = toNumberOrUndefined(predictionRaw);
        const dropHeightM = toNumberOrUndefined(dropHeightRaw);
        const payloadMassG = massUnknown ? undefined : toNumberOrUndefined(payloadMassRaw);

        const designTags = isBaseline
            ? undefined
            : {
                canopyMaterial,
                canopyShape,
                stringsCount:
                    toNumberOrUndefined(stringsCountRaw) != null
                        ? clampInt(toNumberOrUndefined(stringsCountRaw)!, 1, 16)
                        : undefined,
                canopySizeCm: toNumberOrUndefined(canopySizeRaw),
                stringLengthCm: toNumberOrUndefined(stringLengthRaw),
                notes: designNotes.trim() ? designNotes.trim() : undefined,
            };

        return {
            ...existingPlan,
            attemptType: isBaseline ? 'baseline' : 'prototype',
            predictionSec: predictionSec != null ? predictionSec : undefined,
            dropHeightM: dropHeightM != null ? dropHeightM : undefined,
            payloadMassUnknown: massUnknown,
            payloadMassG: payloadMassG != null ? payloadMassG : undefined,
            designTags,
        };
    }

    function validateRequired(session: SessionDraft) {
        const dropHeightM = toNumberOrUndefined(dropHeightRaw);

        if (dropHeightM == null || dropHeightM <= 0) {
            return 'Drop Height (m) is required and must be > 0.';
        }

        if (!massUnknown) {
            const massG = toNumberOrUndefined(payloadMassRaw);

            if (massG == null || massG <= 0) {
                return 'Payload Mass (g) is required unless you set it as Unknown.';
            }
        }

        if (!isBaseline) {
            const anyTag =
                Boolean(canopyMaterial) ||
                Boolean(canopyShape) ||
                Boolean(designNotes.trim()) ||
                Boolean(stringsCountRaw.trim()) ||
                Boolean(canopySizeRaw.trim()) ||
                Boolean(stringLengthRaw.trim());

            if (!anyTag) {
                return 'Please add at least one prototype design detail.';
            }
        }

        return null;
    }

    function computeConfirmGates(): ConfirmGate[] {
        if (!baselineRefs) return [];

        const gates: ConfirmGate[] = [];
        const curHeight = toNumberOrUndefined(dropHeightRaw);
        const baseHeight = baselineRefs.baseHeight;

        if (!isBaseline && curHeight != null && baseHeight != null && baseHeight > 0) {
            const diff = pctDiff(curHeight, baseHeight);

            if (diff > 0.05 && !confirmed.height) {
                gates.push({
                    key: 'height',
                    message:
                        'Height changed; comparisons may be unfair. Please confirm you still want to continue.',
                });
            }
        }

        const curMassG = massUnknown ? undefined : toNumberOrUndefined(payloadMassRaw);
        const baseMassUnknown = baselineRefs.baseMassUnknown;
        const baseMassG = baselineRefs.baseMassG;

        if (!isBaseline) {
            if (
                !massUnknown &&
                !baseMassUnknown &&
                curMassG != null &&
                baseMassG != null &&
                baseMassG > 0
            ) {
                const diff = pctDiff(curMassG, baseMassG);

                if (diff > 0.1 && !confirmed.mass) {
                    gates.push({
                        key: 'mass',
                        message:
                            'Payload changed; speed/force comparison changes. Please confirm you still want to continue.',
                    });
                }
            }
        }

        return gates;
    }

    function openNextConfirmIfNeeded(gates: ConfirmGate[]): boolean {
        const next = gates[0] ?? null;
        if (!next) return false;
        setPendingConfirm(next);
        return true;
    }

    function onConfirmGateYes() {
        if (!pendingConfirm) return;

        const key = pendingConfirm.key;
        setConfirmed((prev) => ({...prev, [key]: true}));
        setPendingConfirm(null);

        queueMicrotask(() => onRecordVideo());
    }

    function onRecordVideo() {
        if (!user) return;
        if (!draft || !attempt) return;

        const err = validateRequired(draft.session);

        if (err) {
            Alert.alert('Check fields', err);
            return;
        }

        const gates = computeConfirmGates();
        const opened = openNextConfirmIfNeeded(gates);

        if (opened) return;

        const nextPlan = buildPlanFromForm(draft.session, attempt.plan);
        persistAttemptPlan(nextPlan);

        navigation.navigate('A1Measurements', {activityId, runId, attemptIndex});
    }

    if (!user) return null;

    if (!draft || !attempt) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading attempt draft..."/>
            </AppGradientScreen>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <AppGradientScreen>
                <View style={styles.header}>
                    <AppBadge
                        label={isBaseline ? 'Baseline' : `Prototype ${attemptIndex}`}
                        tone={isBaseline ? 'info' : 'primary'}
                    />

                    <AppText variant="title" style={styles.title}>
                        {attemptLabel(attemptIndex)}
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Plan this attempt before recording. Keep height and payload consistent
                        for fair comparison.
                    </AppText>
                </View>

                {pendingConfirm ? (
                    <AppCard style={styles.confirmCard}>
                        <AppText variant="sectionTitle">Confirmation needed</AppText>

                        <AppText variant="body" color="textMuted" style={styles.confirmBody}>
                            {pendingConfirm.message}
                        </AppText>

                        <View style={styles.confirmActions}>
                            <AppButton
                                title="Cancel"
                                variant="outline"
                                onPress={() => setPendingConfirm(null)}
                                style={styles.confirmButton}
                            />

                            <AppButton
                                title="I Understand"
                                onPress={onConfirmGateYes}
                                style={styles.confirmButton}
                            />
                        </View>
                    </AppCard>
                ) : null}

                <InfoBanner
                    title="Attempt planning"
                    message="Your prediction and setup details will be used later for comparison and feedback."
                    tone="info"
                />

                <AppSectionHeader
                    title="Prediction"
                    subtitle="Estimate how long the object will take to reach the ground."
                />

                <AppCard>
                    <AppInput
                        label="Prediction (seconds)"
                        value={predictionRaw}
                        onChangeText={setPredictionRaw}
                        placeholder="e.g. 1.2"
                        keyboardType="decimal-pad"
                    />
                </AppCard>

                {!isBaseline ? (
                    <>
                        <AppSectionHeader
                            title="Prototype Design"
                            subtitle="Describe what changed in this parachute prototype."
                        />

                        <AppCard>
                            <AppText variant="bodyStrong">Canopy material</AppText>

                            <View style={styles.segmentWrap}>
                                {(['paper', 'plastic', 'fabric', 'other'] as const).map((v) => (
                                    <SegmentChip
                                        key={v}
                                        label={v}
                                        active={canopyMaterial === v}
                                        onPress={() => setCanopyMaterial(v)}
                                    />
                                ))}
                            </View>

                            <AppText variant="bodyStrong" style={styles.blockGap}>
                                Canopy shape
                            </AppText>

                            <View style={styles.segmentWrap}>
                                {(['circle', 'square', 'other'] as const).map((v) => (
                                    <SegmentChip
                                        key={v}
                                        label={v}
                                        active={canopyShape === v}
                                        onPress={() => setCanopyShape(v)}
                                    />
                                ))}
                            </View>

                            <View style={styles.twoColumn}>
                                <View style={styles.column}>
                                    <AppInput
                                        label="Strings count"
                                        value={stringsCountRaw}
                                        onChangeText={setStringsCountRaw}
                                        placeholder="e.g. 4"
                                        keyboardType="number-pad"
                                    />
                                </View>

                                <View style={styles.column}>
                                    <AppInput
                                        label="String length (cm)"
                                        value={stringLengthRaw}
                                        onChangeText={setStringLengthRaw}
                                        placeholder="e.g. 20"
                                        keyboardType="decimal-pad"
                                    />
                                </View>
                            </View>

                            <AppInput
                                label="Canopy diameter / side length (cm)"
                                value={canopySizeRaw}
                                onChangeText={setCanopySizeRaw}
                                placeholder="e.g. 25"
                                keyboardType="decimal-pad"
                            />

                            <AppInput
                                label="Notes"
                                value={designNotes}
                                onChangeText={setDesignNotes}
                                placeholder="What changed and why?"
                                multiline
                                style={styles.notesInput}
                            />

                            <View style={styles.sketchBox}>
                                <AppText variant="bodyStrong">Sketch upload</AppText>
                                <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                    v1 placeholder: keep your sketch photo ready for later upload.
                                </AppText>
                            </View>
                        </AppCard>
                    </>
                ) : (
                    <>
                        <AppSectionHeader title="Attempt Type"/>

                        <AppCard>
                            <AppText variant="body" color="textMuted">
                                Baseline is always completed without a parachute. You will build
                                and compare prototypes after this attempt.
                            </AppText>

                            <View style={styles.baselinePill}>
                                <AppText variant="caption" color="inverseText">
                                    Baseline · No parachute
                                </AppText>
                            </View>
                        </AppCard>
                    </>
                )}

                <AppSectionHeader
                    title="Comparison Parameters"
                    subtitle="Keep these consistent across attempts for fair comparison."
                />

                <AppCard>
                    <AppInput
                        label="Drop Height (m)"
                        value={dropHeightRaw}
                        onChangeText={(t) => {
                            setDropHeightRaw(t);
                            if (!isBaseline) {
                                setConfirmed((prev) => ({...prev, height: false}));
                            }
                        }}
                        placeholder="e.g. 1.5"
                        keyboardType="decimal-pad"
                    />

                    {!isBaseline && baselineRefs?.baseHeight != null ? (
                        <AppText variant="caption" color="textMuted" style={styles.referenceText}>
                            Baseline reference height: {baselineRefs.baseHeight} m
                        </AppText>
                    ) : null}

                    <View style={styles.massHeader}>
                        <View style={styles.massText}>
                            <AppText variant="bodyStrong">Payload Mass (g)</AppText>
                            <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                If unknown, force/drag/g-force calculations may be limited.
                            </AppText>
                        </View>

                        <Pressable
                            onPress={() => {
                                setMassUnknown((v) => {
                                    const next = !v;
                                    if (!isBaseline) {
                                        setConfirmed((prev) => ({...prev, mass: false}));
                                    }
                                    return next;
                                });
                            }}
                            style={[styles.toggleChip, massUnknown && styles.toggleChipOn]}
                        >
                            <AppText
                                variant="caption"
                                color={massUnknown ? 'inverseText' : 'text'}
                            >
                                {massUnknown ? 'Unknown' : 'Known'}
                            </AppText>
                        </Pressable>
                    </View>

                    <AppInput
                        value={payloadMassRaw}
                        onChangeText={(t) => {
                            setPayloadMassRaw(t);
                            if (!isBaseline) {
                                setConfirmed((prev) => ({...prev, mass: false}));
                            }
                        }}
                        placeholder="e.g. 20"
                        keyboardType="number-pad"
                        editable={!massUnknown}
                        style={massUnknown ? styles.disabledInput : undefined}
                    />

                    {!isBaseline &&
                    !massUnknown &&
                    baselineRefs?.baseMassG != null &&
                    !baselineRefs.baseMassUnknown ? (
                        <AppText variant="caption" color="textMuted" style={styles.referenceText}>
                            Baseline reference mass: {baselineRefs.baseMassG} g
                        </AppText>
                    ) : null}
                </AppCard>

                <AppButton title="Record Drop Video" onPress={onRecordVideo}/>

                <AppText variant="caption" color="textMuted" style={styles.footerHint}>
                    Next: video capture placeholder → measurements → results. You can add
                    up to 3 prototypes.
                </AppText>

                <View style={styles.bottomSpace}/>
            </AppGradientScreen>
        </KeyboardAvoidingView>
    );
}

type SegmentChipProps = {
    label: string;
    active: boolean;
    onPress: () => void;
};

function SegmentChip({label, active, onPress}: SegmentChipProps) {
    return (
        <Pressable
            onPress={onPress}
            style={[styles.segmentChip, active && styles.segmentChipActive]}
        >
            <AppText
                variant="caption"
                color={active ? 'inverseText' : 'text'}
                style={styles.capitalize}
            >
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

    confirmCard: {
        borderColor: colors.warning,
        backgroundColor: colors.warningSoft,
    },

    confirmBody: {
        marginTop: spacing.sm,
    },

    confirmActions: {
        flexDirection: 'row',
        gap: spacing.md,
        marginTop: spacing.lg,
    },

    confirmButton: {
        flex: 1,
    },

    segmentWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginTop: spacing.sm,
    },

    segmentChip: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },

    segmentChipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    capitalize: {
        textTransform: 'capitalize',
    },

    blockGap: {
        marginTop: spacing.lg,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    twoColumn: {
        flexDirection: 'row',
        gap: spacing.md,
        marginTop: spacing.lg,
    },

    column: {
        flex: 1,
    },

    notesInput: {
        minHeight: 90,
        textAlignVertical: 'top',
    },

    sketchBox: {
        marginTop: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceMuted,
        borderRadius: radius.lg,
        padding: spacing.md,
    },

    baselinePill: {
        marginTop: spacing.lg,
        alignSelf: 'flex-start',
        backgroundColor: colors.primary,
        borderRadius: radius.pill,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },

    referenceText: {
        marginTop: -spacing.sm,
        marginBottom: spacing.md,
    },

    massHeader: {
        marginTop: spacing.lg,
        marginBottom: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    massText: {
        flex: 1,
    },

    toggleChip: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.pill,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        backgroundColor: colors.surface,
    },

    toggleChipOn: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },

    disabledInput: {
        opacity: 0.5,
    },

    footerHint: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});