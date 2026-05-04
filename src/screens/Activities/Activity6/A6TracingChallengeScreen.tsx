// src/screens/Activities/Activity6/A6TracingChallengeScreen.tsx

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../../navigation/AppStack';
import {auth} from '../../../services/firebase';

import {
    getActivity6RunDraft,
    upsertActivity6TracingResult,
    type Activity6RunDraft,
    type A6TracingPathType,
    type A6TracePoint,
} from '../../../store/activity6RunDraftStore';

import {
    computeTracingDeviation,
    computeTracingAccuracyScore,
    A6_RECOMMENDED_MAX_DEV_PX,
} from '../../../services/activity6ReactionBoardService';

import {
    AppBadge,
    AppButton,
    AppCard,
    AppGradientScreen,
    AppSectionHeader,
    AppStatusToast,
    AppText,
    InfoBanner,
    LoadingState,
} from '../../../components/ui';

import {colors, radius, spacing} from '../../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'A6TracingChallenge'>;

type Mode = 'idle' | 'recording' | 'saved';
type ToastTone = 'success' | 'info' | 'warning' | 'danger';

type ToastState = {
    visible: boolean;
    title: string;
    message?: string;
    tone: ToastTone;
};

function now() {
    return Date.now();
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNum(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function safeParticipantName(run: Activity6RunDraft, pid: string) {
    return run.session.participants.find((p) => p.id === pid)?.name ?? '—';
}

function formatPct(v?: number) {
    if (v == null || !Number.isFinite(v)) return '—';
    return `${Math.round(v)}%`;
}

function formatPx(v?: number) {
    if (v == null || !Number.isFinite(v)) return '—';
    return `${Math.round(v)} px`;
}

function buildReferencePath(args: {
    type: A6TracingPathType;
    pointCount: number;
    durationMs: number;
}): A6TracePoint[] {
    const n = clampInt(args.pointCount, 100, 900);
    const duration = clampInt(args.durationMs, 2_000, 60_000);

    const pts: A6TracePoint[] = [];

    for (let i = 0; i < n; i += 1) {
        const t = i / (n - 1);
        const tMs = Math.round(t * duration);

        let x = 0.5;
        let y = 0.5;

        switch (args.type) {
            case 'circle': {
                const r = 0.32;
                const ang = 2 * Math.PI * t;
                x = 0.5 + r * Math.cos(ang);
                y = 0.5 + r * Math.sin(ang);
                break;
            }

            case 'wave': {
                const amp = 0.22;
                x = 0.12 + 0.76 * t;
                y = 0.5 + amp * Math.sin(2 * Math.PI * 2 * t);
                break;
            }

            case 'zigzag': {
                x = 0.12 + 0.76 * t;
                const bands = 6;
                const phase = (t * bands) % 1;
                const up = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
                y = 0.2 + 0.6 * up;
                break;
            }

            case 'figure8': {
                const a = 0.3;
                const ang = 2 * Math.PI * t;
                x = 0.5 + a * Math.sin(ang);
                y = 0.5 + a * Math.sin(ang) * Math.cos(ang) * 2;
                break;
            }

            default:
                break;
        }

        pts.push({
            tMs,
            x: clampNum(x, 0, 1),
            y: clampNum(y, 0, 1),
        });
    }

    return pts;
}

function downsample(path: A6TracePoint[], maxPoints: number): A6TracePoint[] {
    if (path.length <= maxPoints) return path;

    const stride = Math.ceil(path.length / maxPoints);
    const out: A6TracePoint[] = [];

    for (let i = 0; i < path.length; i += stride) {
        out.push(path[i]);
    }

    if (out[out.length - 1] !== path[path.length - 1]) {
        out.push(path[path.length - 1]);
    }

    return out;
}

export default function A6TracingChallengeScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity6RunDraft | null>(null);
    const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
    const [arena, setArena] = useState<{ width: number; height: number } | null>(null);
    const [mode, setMode] = useState<Mode>('idle');

    const [pathType, setPathType] = useState<A6TracingPathType>('circle');
    const [maxAllowedDeviationPx, setMaxAllowedDeviationPx] = useState<number>(
        A6_RECOMMENDED_MAX_DEV_PX,
    );

    const [referencePath, setReferencePath] = useState<A6TracePoint[]>([]);
    const [userPath, setUserPath] = useState<A6TracePoint[]>([]);

    const startEpochRef = useRef<number>(0);
    const startedAtRef = useRef<number>(0);

    const [savedSummary, setSavedSummary] = useState<{
        participantName: string;
        durationMs: number;
        avgDeviationPx: number;
        accuracyScorePct: number;
    } | null>(null);

    const [toast, setToast] = useState<ToastState>({
        visible: false,
        title: '',
        message: undefined,
        tone: 'success',
    });

    function showToast(title: string, tone: ToastTone = 'success', message?: string) {
        setToast({
            visible: true,
            title,
            message,
            tone,
        });
    }

    useEffect(() => {
        if (!user) return;

        const d = getActivity6RunDraft(runId);

        if (!d) {
            Alert.alert('Session expired', 'Please restart Activity 6.', [
                {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                },
            ]);
            return;
        }

        setDraft(d);

        const first = d.session.participants?.[0]?.id ?? null;
        setSelectedParticipantId(first);

        const sessionType = (d.session.tracingPathType ?? 'circle') as A6TracingPathType;
        setPathType(sessionType);

        const maxDev = clampInt(
            d.session.maxAllowedDeviationPx ?? A6_RECOMMENDED_MAX_DEV_PX,
            10,
            200,
        );

        setMaxAllowedDeviationPx(maxDev);

        setReferencePath(
            buildReferencePath({
                type: sessionType,
                pointCount: 320,
                durationMs: 10_000,
            }),
        );
    }, [navigation, runId, user]);

    const participants = draft?.session.participants ?? [];

    const selectedName = useMemo(() => {
        return participants.find((p) => p.id === selectedParticipantId)?.name ?? 'Select participant';
    }, [participants, selectedParticipantId]);

    const canStart = useMemo(() => {
        if (!draft) return false;
        if (!selectedParticipantId) return false;
        if (!arena || arena.width <= 0 || arena.height <= 0) return false;
        return true;
    }, [arena, draft, selectedParticipantId]);

    function rebuildReference() {
        setReferencePath(
            buildReferencePath({
                type: pathType,
                pointCount: 320,
                durationMs: 10_000,
            }),
        );
    }

    function reset() {
        setMode('idle');
        setSavedSummary(null);
        setUserPath([]);
        startEpochRef.current = 0;
        startedAtRef.current = 0;
        rebuildReference();

        showToast('Tracing reset', 'info', 'You can start a new tracing attempt.');
    }

    function startTracing() {
        if (!draft) return;

        if (!canStart) {
            Alert.alert(
                'Not ready',
                'Please wait until the tracing area is loaded and a participant is selected.',
            );
            return;
        }

        setSavedSummary(null);
        setUserPath([]);
        setMode('recording');

        const ts = now();
        startEpochRef.current = ts;
        startedAtRef.current = ts;

        rebuildReference();

        showToast('Tracing started', 'info', 'Follow the dotted guide path continuously.');
    }

    function finishTracing() {
        if (!draft) return;

        const pid = selectedParticipantId ?? participants[0]?.id;
        if (!pid) return;

        if (mode !== 'recording') return;

        const endedAt = now();
        const startedAt = startedAtRef.current || endedAt;
        const durationMs = clampInt(Math.max(0, endedAt - startedAt), 0, 10 * 60 * 1000);

        if (userPath.length < 20) {
            Alert.alert('Not enough tracing', 'Please follow the path for a bit longer before finishing.');
            return;
        }

        if (!arena) {
            Alert.alert('Layout missing', 'Tracing area not ready.');
            return;
        }

        const ref = downsample(referencePath, 320);
        const usr = downsample(userPath, 320);

        const dev = computeTracingDeviation({
            userPath: usr,
            referencePath: ref,
            screen: {
                width: arena.width,
                height: arena.height,
            },
            startedAt,
            endedAt,
        });

        const score = computeTracingAccuracyScore({
            avgDeviationPx: dev.avgDeviationPx,
            maxAllowedDeviationPx,
        });

        try {
            const updated = upsertActivity6TracingResult(runId, {
                participantId: pid,
                pathType,
                startedAt,
                endedAt,
                userPath: usr,
                referencePath: ref,
                avgDeviationPx: dev.avgDeviationPx,
                maxAllowedDeviationPx,
            });

            setDraft(updated);

            setSavedSummary({
                participantName: safeParticipantName(updated, pid),
                durationMs,
                avgDeviationPx: dev.avgDeviationPx,
                accuracyScorePct: score.accuracyScorePct,
            });

            setMode('saved');

            showToast(
                'Tracing result saved',
                'success',
                `Accuracy ${formatPct(score.accuracyScorePct)} • Avg deviation ${formatPx(dev.avgDeviationPx)}`,
            );
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to save tracing result.';
            Alert.alert('Error', message);
            setMode('idle');
        }
    }

    function handleTouch(e: any) {
        if (mode !== 'recording') return;
        if (!arena) return;

        const xPx = e?.nativeEvent?.locationX;
        const yPx = e?.nativeEvent?.locationY;

        if (!Number.isFinite(xPx) || !Number.isFinite(yPx)) return;

        const tMs = clampInt(now() - (startEpochRef.current || now()), 0, 10 * 60 * 1000);
        const x = clampNum(xPx / arena.width, 0, 1);
        const y = clampNum(yPx / arena.height, 0, 1);

        setUserPath((prev) => {
            const next = [...prev, {tMs, x, y}];
            return next.length > 1600 ? next.slice(next.length - 3000) : next;
        });
    }

    function goToResults() {
        showToast('Opening results', 'success', 'Preparing tracing analysis.');

        setTimeout(() => {
            navigation.navigate('A6Results', {activityId, runId});
        }, 600);
    }

    if (!user) return null;

    if (!draft) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading tracing challenge..."/>
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
                    <AppBadge label="Activity 6" tone="primary"/>

                    <AppText variant="title" style={styles.title}>
                        Tracing Challenge
                    </AppText>

                    <AppText variant="body" color="textMuted" style={styles.subtitle}>
                        Follow the dotted guide path continuously. Your accuracy is based on
                        average deviation from the reference path.
                    </AppText>
                </View>

                <InfoBanner
                    title="Tracing guidance"
                    message="Move smoothly and continuously along the guide path. Avoid lifting your finger during recording."
                    tone="info"
                />

                <AppSectionHeader
                    title="Participant"
                    subtitle="Select who is completing this tracing attempt."
                />

                <AppCard>
                    <View style={styles.chipWrap}>
                        {participants.map((p) => {
                            const selected = p.id === selectedParticipantId;

                            return (
                                <Pressable
                                    key={p.id}
                                    style={[styles.chip, selected && styles.chipSelected]}
                                    onPress={() => setSelectedParticipantId(p.id)}
                                    disabled={mode === 'recording'}
                                >
                                    <AppText
                                        variant="bodyStrong"
                                        color={selected ? 'inverseText' : 'text'}
                                        align="center"
                                    >
                                        {p.name}
                                    </AppText>
                                </Pressable>
                            );
                        })}
                    </View>

                    <View style={styles.selectionBox}>
                        <View>
                            <AppText variant="caption" color="textMuted">
                                Selected participant
                            </AppText>

                            <AppText variant="bodyStrong" style={styles.smallGap}>
                                {selectedName}
                            </AppText>
                        </View>

                        <AppBadge
                            label={mode === 'recording' ? 'Recording' : mode === 'saved' ? 'Saved' : 'Ready'}
                            tone={mode === 'recording' ? 'warning' : mode === 'saved' ? 'success' : 'info'}
                        />
                    </View>
                </AppCard>

                <AppSectionHeader
                    title="Path Configuration"
                    subtitle="Configured from Activity 6 session setup."
                />

                <AppCard>
                    <MetricRow label="Path type" value={pathType} capitalizeValue/>
                    <MetricRow label="Max allowed deviation" value={`${maxAllowedDeviationPx}px`}/>
                    <MetricRow label="Reference density" value={`${referencePath.length} points`}/>
                </AppCard>

                <AppSectionHeader
                    title="Tracing Arena"
                    subtitle="Press Start, then trace directly on the arena."
                />

                <AppCard>
                    {mode === 'saved' && savedSummary ? (
                        <View style={styles.savedBox}>
                            <View style={styles.savedText}>
                                <AppText variant="bodyStrong">Result saved</AppText>

                                <AppText variant="caption" color="textMuted" style={styles.smallGap}>
                                    {savedSummary.participantName} • Duration{' '}
                                    {Math.round(savedSummary.durationMs / 1000)}s
                                </AppText>
                            </View>

                            <AppBadge
                                label={formatPct(savedSummary.accuracyScorePct)}
                                tone="success"
                            />
                        </View>
                    ) : null}

                    {mode === 'recording' ? (
                        <View style={styles.recordingBox}>
                            <View style={styles.recordingText}>
                                <AppText variant="bodyStrong" color="inverseText">
                                    Recording
                                </AppText>

                                <AppText variant="caption" color="inverseText" style={styles.recordingHint}>
                                    Touch and drag continuously along the dotted reference path,
                                    then tap Finish.
                                </AppText>
                            </View>

                            <AppBadge label={`${userPath.length} pts`} tone="info"/>
                        </View>
                    ) : null}

                    <View
                        style={styles.arena}
                        onLayout={(e) => {
                            const {width, height} = e.nativeEvent.layout;
                            setArena({width, height});

                            setReferencePath(
                                buildReferencePath({
                                    type: pathType,
                                    pointCount: 320,
                                    durationMs: 10_000,
                                }),
                            );
                        }}
                        onStartShouldSetResponder={() => mode === 'recording'}
                        onMoveShouldSetResponder={() => mode === 'recording'}
                        onResponderGrant={handleTouch}
                        onResponderMove={handleTouch}
                        onResponderRelease={handleTouch}
                    >
                        {arena
                            ? downsample(referencePath, 220).map((p, idx) => (
                                <View
                                    key={`ref_${idx}`}
                                    style={[
                                        styles.refDot,
                                        {
                                            left: p.x * arena.width - 5,
                                            top: p.y * arena.height - 5,
                                        },
                                    ]}
                                />
                            ))
                            : null}

                        {arena
                            ? downsample(userPath.slice(-1200), 420).map((p, idx) => (
                                <View
                                    key={`usr_${idx}`}
                                    style={[
                                        styles.userDot,
                                        {
                                            left: p.x * arena.width - 4,
                                            top: p.y * arena.height - 4,
                                        },
                                    ]}
                                />
                            ))
                            : null}

                        {mode !== 'recording' ? (
                            <View style={styles.overlayCenter}>
                                <AppText variant="bodyStrong" align="center" color="textMuted">
                                    {arena
                                        ? 'Press Start, then follow the dotted guide path continuously'
                                        : 'Loading arena...'}
                                </AppText>
                            </View>
                        ) : null}
                    </View>

                    <View style={styles.actionRow}>
                        <AppButton
                            title="Start"
                            onPress={startTracing}
                            disabled={!canStart || mode === 'recording'}
                            style={styles.actionButton}
                        />

                        <AppButton
                            title="Finish"
                            variant="outline"
                            onPress={finishTracing}
                            disabled={mode !== 'recording'}
                            style={styles.actionButton}
                        />

                        <AppButton
                            title="Reset"
                            variant="ghost"
                            onPress={reset}
                            disabled={mode === 'recording'}
                            style={styles.actionButton}
                        />
                    </View>

                    <AppText variant="caption" color="textMuted" style={styles.note}>
                        Tip: keep your finger moving smoothly along the guide path for better
                        accuracy.
                    </AppText>
                </AppCard>

                <AppButton
                    title="Continue to Results"
                    onPress={goToResults}
                    disabled={mode === 'recording'}
                />

                <AppStatusToast
                    visible={toast.visible}
                    title={toast.title}
                    message={toast.message}
                    tone={toast.tone}
                    onHide={() =>
                        setToast((prev) => ({
                            ...prev,
                            visible: false,
                        }))
                    }
                />

                <View style={styles.bottomSpace}/>
            </AppGradientScreen>
        </KeyboardAvoidingView>
    );
}

type MetricRowProps = {
    label: string;
    value: string;
    capitalizeValue?: boolean;
};

function MetricRow({label, value, capitalizeValue = false}: MetricRowProps) {
    return (
        <View style={styles.metricRow}>
            <AppText variant="bodyStrong" style={styles.metricLabel}>
                {label}
            </AppText>

            <AppText
                variant="bodyStrong"
                align="right"
                style={[styles.metricValue, capitalizeValue && styles.capitalize]}
            >
                {value}
            </AppText>
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

    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },

    chip: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },

    chipSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.primary,
    },

    selectionBox: {
        marginTop: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    smallGap: {
        marginTop: spacing.xs,
    },

    metricRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingVertical: spacing.sm,
    },

    metricLabel: {
        flex: 1,
    },

    metricValue: {
        flex: 1,
    },

    capitalize: {
        textTransform: 'capitalize',
    },

    savedBox: {
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceMuted,
        padding: spacing.md,
        marginBottom: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    savedText: {
        flex: 1,
    },

    recordingBox: {
        borderRadius: radius.lg,
        backgroundColor: colors.primaryDark,
        padding: spacing.md,
        marginBottom: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
    },

    recordingText: {
        flex: 1,
    },

    recordingHint: {
        marginTop: spacing.xs,
        opacity: 0.85,
    },

    arena: {
        height: 380,
        borderRadius: radius.xl,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceMuted,
        overflow: 'hidden',
        position: 'relative',
    },

    overlayCenter: {
        position: 'absolute',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
    },

    refDot: {
        position: 'absolute',
        width: 10,
        height: 10,
        borderRadius: radius.pill,
        backgroundColor: colors.primaryDark,
        opacity: 0.22,
    },

    userDot: {
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
        opacity: 0.82,
    },

    actionRow: {
        marginTop: spacing.md,
        flexDirection: 'row',
        gap: spacing.sm,
    },

    actionButton: {
        flex: 1,
    },

    note: {
        marginTop: spacing.md,
    },

    bottomSpace: {
        height: spacing.xxl,
    },
});