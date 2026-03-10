// src/screens/Activities/Activity6/A6ReactionTrialScreen.tsx

import React, {useEffect, useMemo, useRef, useState} from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";

import {
    getActivity6RunDraft,
    upsertActivity6ReactionTrial,
    validateA6Prediction,
    type Activity6RunDraft,
    type A6HandType,
} from "../../../store/activity6RunDraftStore";

import {
    planNextTarget,
    waitAndActivateTarget,
    buildReactionRecord,
    type A6TargetPresentation,
} from "../../../services/activity6ReactionBoardService";

type Props = NativeStackScreenProps<AppStackParamList, "A6ReactionTrial">;

/* =========================================================
   Helpers
========================================================= */

function now() {
    return Date.now();
}

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function safeParticipantName(run: Activity6RunDraft, pid: string) {
    return run.session.participants.find((p) => p.id === pid)?.name ?? "—";
}

function formatMs(ms: number | undefined) {
    if (ms == null || !Number.isFinite(ms)) return "—";
    return `${Math.round(ms)} ms`;
}

/**
 * Convert normalized 0..1 to pixel anchor (centered), respecting margins.
 * We keep a margin to avoid going out-of-bounds even if layout changes.
 */
function normToPx(args: {
    n: number;
    sizePx: number;
    totalPx: number;
    extraMarginPx?: number;
}) {
    const margin = Math.min(args.totalPx / 2, args.sizePx / 2 + (args.extraMarginPx ?? 8));
    const span = Math.max(1, args.totalPx - 2 * margin);
    const px = margin + args.n * span; // n already safe 0..1
    // top-left for absolute positioning
    return px - args.sizePx / 2;
}

/* =========================================================
   Screen
========================================================= */

type Phase =
    | "idle"
    | "countdown"
    | "waiting_random"
    | "active_target"
    | "saved";

export default function A6ReactionTrialScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity6RunDraft | null>(null);

    const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
    const [hand, setHand] = useState<A6HandType>("dominant");

    const [phase, setPhase] = useState<Phase>("idle");
    const [countdown, setCountdown] = useState<number | null>(null);

    const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);

    const [activeTarget, setActiveTarget] = useState<A6TargetPresentation | null>(null);

    const [lastSaved, setLastSaved] = useState<{
        participantName: string;
        hand: A6HandType;
        trialNumber: number;
        reactionTimeMs: number;
    } | null>(null);

    const runningRef = useRef(false);

    useEffect(() => {
        if (!user) return;

        const d = getActivity6RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Please restart Activity 6.", [
                {text: "OK", onPress: () => navigation.replace("A6SessionSetup", {activityId})},
            ]);
            return;
        }

        // Prediction gating (FR-A6-06)
        const predErr = validateA6Prediction(d);
        if (predErr) {
            Alert.alert("Prediction required", predErr, [
                {text: "Go to Prediction", onPress: () => navigation.replace("A6Prediction", {activityId, runId})},
            ]);
            return;
        }

        setDraft(d);

        const first = d.session.participants?.[0]?.id;
        setSelectedParticipantId(first ?? null);
    }, [activityId, navigation, runId, user]);

    useEffect(() => {
        return () => {
            runningRef.current = false;
        };
    }, []);

    const participants = draft?.session.participants ?? [];
    const trialsPerHand = clampInt(draft?.session.trialsPerHand ?? 1, 1, 10);
    const targetCfg = draft?.session.target;
    const targetSizePx = clampInt(targetCfg?.targetSizePx ?? 56, 24, 120);

    const selectedName =
        participants.find((p) => p.id === selectedParticipantId)?.name ?? "Select participant";

    const trialNumberFor = useMemo(() => {
        if (!draft || !selectedParticipantId) return 1;

        const nDone = (draft.reactionTrials ?? []).filter(
            (t) =>
                t.participantId === selectedParticipantId &&
                t.hand === hand &&
                Number.isFinite(t.reactionTimeMs)
        ).length;

        // next trial number = done + 1, capped a bit
        return clampInt(nDone + 1, 1, 999);
    }, [draft, hand, selectedParticipantId]);

    const progress = useMemo(() => {
        if (!draft || !selectedParticipantId) return null;

        const countFor = (pid: string, h: A6HandType) =>
            (draft.reactionTrials ?? []).filter(
                (t) => t.participantId === pid && t.hand === h && Number.isFinite(t.reactionTimeMs)
            ).length;

        const dom = countFor(selectedParticipantId, "dominant");
        const nond = countFor(selectedParticipantId, "non_dominant");

        return {
            dominantDone: dom,
            nonDominantDone: nond,
            trialsPerHand,
        };
    }, [draft, selectedParticipantId, trialsPerHand]);

    function isBusy() {
        return phase !== "idle" && phase !== "saved";
    }

    function resetToIdle() {
        setPhase("idle");
        setCountdown(null);
        setActiveTarget(null);
        setLastSaved(null);
        runningRef.current = false;
    }

    async function startOneTrial() {
        if (!draft) return;
        if (isBusy()) return;

        // robust gating
        const predErr = validateA6Prediction(draft);
        if (predErr) {
            Alert.alert("Prediction required", predErr, [
                {text: "Go to Prediction", onPress: () => navigation.replace("A6Prediction", {activityId, runId})},
            ]);
            return;
        }

        const pid = selectedParticipantId ?? participants[0]?.id;
        if (!pid) {
            Alert.alert("Select participant", "Please select a participant before starting a trial.");
            return;
        }

        if (!layout || layout.width <= 0 || layout.height <= 0) {
            Alert.alert("Layout not ready", "Please wait a moment for the screen to load.");
            return;
        }

        // (Optional) UX: don’t enforce max, but warn if over recommended count
        const doneCount = (draft.reactionTrials ?? []).filter(
            (t) => t.participantId === pid && t.hand === hand && Number.isFinite(t.reactionTimeMs)
        ).length;
        if (doneCount >= trialsPerHand) {
            Alert.alert(
                "Trials completed",
                `You already recorded ${doneCount}/${trialsPerHand} for this hand.\nYou can retake more if you want, or switch hand.`
            );
            // allow continuing anyway
        }

        setLastSaved(null);
        setActiveTarget(null);

        setPhase("countdown");
        runningRef.current = true;

        try {
            // short “get ready” countdown
            for (let c = 3; c >= 1; c--) {
                setCountdown(c);
                await sleep(650);
            }
            setCountdown(null);

            if (!runningRef.current) return;

            // FR-A6-01: randomized delay + location
            setPhase("waiting_random");

            const plan = planNextTarget({
                cfg: {
                    delayMinSec: targetCfg?.delayMinSec ?? 1.0,
                    delayMaxSec: targetCfg?.delayMaxSec ?? 3.0,
                    extraMarginPx: 8,
                },
                screen: {width: layout.width, height: layout.height},
                targetSizePx,
            });

            const presentation = await waitAndActivateTarget(plan);

            if (!runningRef.current) return;

            // Stimulus active
            setActiveTarget(presentation);
            setPhase("active_target");
        } catch (e: any) {
            resetToIdle();
            Alert.alert("Error", e?.message ?? "Failed to start trial.");
        }
    }

    function handleTapTarget() {
        if (!draft || !activeTarget) return;
        if (phase !== "active_target") return;

        const pid = selectedParticipantId ?? participants[0]?.id;
        if (!pid) return;

        const tapAt = now();

        const record = buildReactionRecord({
            participantId: pid,
            hand,
            trialNumber: trialNumberFor,
            appearedAt: activeTarget.appearedAt,
            tapAt,
        });

        try {
            const updated = upsertActivity6ReactionTrial(runId, {
                participantId: record.participantId,
                hand: record.hand,
                trialNumber: record.trialNumber,
                target: {
                    delayMs: activeTarget.delayMs,
                    appearedAt: activeTarget.appearedAt,
                    location: activeTarget.location,
                },
                tapAt: record.tapAt,
            });

            setDraft(updated);

            setLastSaved({
                participantName: safeParticipantName(updated, pid),
                hand,
                trialNumber: record.trialNumber,
                reactionTimeMs: record.reactionTimeMs,
            });

            setPhase("saved");
            setActiveTarget(null);
            runningRef.current = false;
        } catch (e: any) {
            resetToIdle();
            Alert.alert("Error", e?.message ?? "Failed to save reaction trial.");
        }
    }

    function goToTracing() {
        navigation.navigate("A6TracingChallenge", {activityId, runId});
    }

    function goToResults() {
        navigation.navigate("A6Results", {activityId, runId});
    }

    if (!user) return null;

    if (!draft) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10, opacity: 0.7}}>Loading…</Text>
            </View>
        );
    }

    // Compute pixel placement when target is active
    const targetStyle =
        activeTarget && layout
            ? {
                left: normToPx({n: activeTarget.location.x, sizePx: targetSizePx, totalPx: layout.width}),
                top: normToPx({n: activeTarget.location.y, sizePx: targetSizePx, totalPx: layout.height}),
                width: targetSizePx,
                height: targetSizePx,
                borderRadius: targetSizePx / 2,
            }
            : null;

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Tap Reaction</Text>
                <Text style={styles.sub}>
                    Tap the target as soon as it appears. The delay and position are randomized to measure true reaction
                    time.
                </Text>

                {/* Participant */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Participant</Text>
                    <Text style={styles.help}>Rotate through team members and record trials separately.</Text>

                    <View style={styles.chipWrap}>
                        {participants.map((p) => {
                            const selected = p.id === selectedParticipantId;
                            return (
                                <Pressable
                                    key={p.id}
                                    style={[styles.chip, selected && styles.chipSelected]}
                                    onPress={() => setSelectedParticipantId(p.id)}
                                    disabled={isBusy()}
                                >
                                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{p.name}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.note}>Selected: {selectedName}</Text>
                </View>

                {/* Hand */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Hand</Text>
                    <Text style={styles.help}>Complete trials with both dominant and non-dominant hands.</Text>

                    <View style={styles.chipWrap}>
                        <Pressable
                            style={[styles.chip, hand === "dominant" && styles.chipSelected]}
                            onPress={() => setHand("dominant")}
                            disabled={isBusy()}
                        >
                            <Text
                                style={[styles.chipText, hand === "dominant" && styles.chipTextSelected]}>Dominant</Text>
                        </Pressable>

                        <Pressable
                            style={[styles.chip, hand === "non_dominant" && styles.chipSelected]}
                            onPress={() => setHand("non_dominant")}
                            disabled={isBusy()}
                        >
                            <Text
                                style={[styles.chipText, hand === "non_dominant" && styles.chipTextSelected]}>Non-dominant</Text>
                        </Pressable>
                    </View>

                    {progress ? (
                        <Text style={styles.note}>
                            Progress (selected participant):{" "}
                            <Text style={{fontWeight: "900"}}>
                                Dominant {progress.dominantDone}/{progress.trialsPerHand} •
                                Non-dominant {progress.nonDominantDone}/
                                {progress.trialsPerHand}
                            </Text>
                        </Text>
                    ) : null}
                </View>

                {/* Instructions */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Fair testing tips</Text>
                    <Text style={styles.body}>• Keep your finger close, but don’t hover on the exact spot</Text>
                    <Text style={styles.body}>• Don’t “predict” the delay — wait for the stimulus</Text>
                    <Text style={styles.body}>• Keep the phone stable and use the same posture each time</Text>
                    <Text style={styles.body}>
                        • Reaction time is measured as TapTimestamp − TargetAppearanceTimestamp (ms)
                    </Text>
                </View>

                {/* Trial control + arena */}
                <View style={styles.arenaCard}>
                    <Text style={styles.cardTitle}>Trial Arena</Text>

                    {phase === "countdown" && countdown != null ? (
                        <View style={styles.bannerDark}>
                            <Text style={styles.bannerTitle}>Get ready…</Text>
                            <Text style={styles.bannerText}>{countdown}</Text>
                        </View>
                    ) : null}

                    {phase === "waiting_random" ? (
                        <View style={styles.bannerDark}>
                            <Text style={styles.bannerTitle}>Wait…</Text>
                            <Text style={styles.bannerText}>Target will appear soon (random delay)</Text>
                        </View>
                    ) : null}

                    {phase === "saved" && lastSaved ? (
                        <View style={styles.bannerLight}>
                            <Text style={styles.bannerTitleDark}>Saved ✅</Text>
                            <Text style={styles.bannerTextDark}>
                                {lastSaved.participantName} • {lastSaved.hand === "dominant" ? "Dominant" : "Non-dominant"} •
                                Trial{" "}
                                {lastSaved.trialNumber}
                            </Text>
                            <Text style={[styles.bannerTextDark, {marginTop: 6, fontWeight: "900"}]}>
                                Reaction: {formatMs(lastSaved.reactionTimeMs)}
                            </Text>
                        </View>
                    ) : null}

                    {/* Arena */}
                    <View
                        style={styles.arena}
                        onLayout={(e) => {
                            const {width, height} = e.nativeEvent.layout;
                            setLayout({width, height});
                        }}
                    >
                        {/* Target appears only in active phase (FR-A6-01 hidden until activation) */}
                        {phase === "active_target" && activeTarget && targetStyle ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Tap target"
                                onPress={handleTapTarget}
                                style={[styles.target, targetStyle]}
                            >
                                <Text style={styles.targetText}>TAP</Text>
                            </Pressable>
                        ) : (
                            <View style={styles.placeholder}>
                                <Text style={styles.placeholderText}>
                                    {layout ? "Target hidden…" : "Loading arena…"}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={{marginTop: 12, flexDirection: "row", gap: 10}}>
                        <Pressable
                            style={[styles.primaryBtn, isBusy() && styles.btnDisabled]}
                            disabled={isBusy()}
                            onPress={startOneTrial}
                        >
                            <Text style={styles.primaryBtnText}>
                                Start Trial {trialNumberFor}
                            </Text>
                        </Pressable>

                        <Pressable
                            style={[styles.secondaryBtn, isBusy() && styles.btnDisabled]}
                            disabled={isBusy()}
                            onPress={resetToIdle}
                        >
                            <Text style={styles.secondaryBtnText}>Reset</Text>
                        </Pressable>
                    </View>

                    <Text style={[styles.note, {marginTop: 10}]}>
                        Current hand: <Text
                        style={{fontWeight: "900"}}>{hand === "dominant" ? "Dominant" : "Non-dominant"}</Text> •
                        Target size: <Text style={{fontWeight: "900"}}>{targetSizePx}px</Text>
                    </Text>
                </View>

                <Pressable style={styles.secondaryBtnWide} onPress={goToTracing} disabled={isBusy()}>
                    <Text style={styles.secondaryBtnText}>Continue to Tracing Challenge</Text>
                </Pressable>

                <Pressable style={[styles.primaryBtnWide, isBusy() && styles.btnDisabled]} onPress={goToResults}
                           disabled={isBusy()}>
                    <Text style={styles.primaryBtnText}>View Results</Text>
                </Pressable>

                <View style={{height: 40}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

/* =========================================================
   Styles
========================================================= */

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20, backgroundColor: "#fff"},
    center: {flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff"},

    title: {fontSize: 24, fontWeight: "900"},
    sub: {marginTop: 8, opacity: 0.7, lineHeight: 20},

    card: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    arenaCard: {
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "white",
        borderRadius: 14,
        padding: 14,
    },

    cardTitle: {fontSize: 16, fontWeight: "900", marginBottom: 8},
    help: {opacity: 0.75, lineHeight: 18},
    body: {marginTop: 4, opacity: 0.85, lineHeight: 18},
    note: {marginTop: 10, opacity: 0.7},

    chipWrap: {marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10},
    chip: {
        borderWidth: 1,
        borderColor: "#ddd",
        backgroundColor: "white",
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 999,
    },
    chipSelected: {borderColor: "#111", backgroundColor: "#111"},
    chipText: {fontWeight: "900", opacity: 0.85},
    chipTextSelected: {color: "white", opacity: 1},

    arena: {
        marginTop: 10,
        height: 360,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        overflow: "hidden",
        position: "relative",
    },
    placeholder: {flex: 1, alignItems: "center", justifyContent: "center"},
    placeholderText: {opacity: 0.6, fontWeight: "800"},

    target: {
        position: "absolute",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#111",
    },
    targetText: {color: "white", fontWeight: "900"},

    bannerDark: {marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: "#111"},
    bannerTitle: {color: "white", fontWeight: "900", fontSize: 16},
    bannerText: {color: "white", marginTop: 6, opacity: 0.9},

    bannerLight: {marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: "#f3f4f6"},
    bannerTitleDark: {color: "#111", fontWeight: "900", fontSize: 16},
    bannerTextDark: {color: "#111", marginTop: 6, opacity: 0.85},

    btnDisabled: {opacity: 0.5},

    primaryBtn: {
        flex: 1,
        backgroundColor: "#111",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    primaryBtnWide: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900"},

    secondaryBtn: {
        width: 110,
        borderWidth: 1,
        borderColor: "#111",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor: "white",
    },
    secondaryBtnWide: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
        backgroundColor: "white",
    },
    secondaryBtnText: {fontWeight: "900"},
});