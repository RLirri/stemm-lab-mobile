// src/screens/Activities/Activity6/A6TracingChallengeScreen.tsx
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
    upsertActivity6TracingResult,
    type Activity6RunDraft,
    type A6TracingPathType,
    type A6TracePoint,
} from "../../../store/activity6RunDraftStore";

import {
    computeTracingDeviation,
    computeTracingAccuracyScore,
    A6_RECOMMENDED_MAX_DEV_PX,
} from "../../../services/activity6ReactionBoardService";

type Props = NativeStackScreenProps<AppStackParamList, "A6TracingChallenge">;

/* =========================================================
   Helpers
========================================================= */

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
    return run.session.participants.find((p) => p.id === pid)?.name ?? "—";
}

function formatPct(v?: number) {
    if (v == null || !Number.isFinite(v)) return "—";
    return `${Math.round(v)}%`;
}

function formatPx(v?: number) {
    if (v == null || !Number.isFinite(v)) return "—";
    return `${Math.round(v)} px`;
}

/**
 * Build a reference path in normalized coordinates (0..1).
 * Slightly denser than before to make the guide clearer and improve nearest-point scoring stability.
 */
function buildReferencePath(args: {
    type: A6TracingPathType;
    pointCount: number;
    durationMs: number;
}): A6TracePoint[] {
    const n = clampInt(args.pointCount, 100, 900);
    const T = clampInt(args.durationMs, 2_000, 60_000);

    const pts: A6TracePoint[] = [];
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const tMs = Math.round(t * T);

        let x = 0.5;
        let y = 0.5;

        switch (args.type) {
            case "circle": {
                const r = 0.32;
                const ang = 2 * Math.PI * t;
                x = 0.5 + r * Math.cos(ang);
                y = 0.5 + r * Math.sin(ang);
                break;
            }
            case "wave": {
                const amp = 0.22;
                x = 0.12 + 0.76 * t;
                y = 0.5 + amp * Math.sin(2 * Math.PI * 2 * t);
                break;
            }
            case "zigzag": {
                x = 0.12 + 0.76 * t;
                const bands = 6;
                const phase = (t * bands) % 1;
                const up = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
                y = 0.20 + 0.60 * up;
                break;
            }
            case "figure8": {
                const a = 0.30;
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
    for (let i = 0; i < path.length; i += stride) out.push(path[i]);
    if (out[out.length - 1] !== path[path.length - 1]) out.push(path[path.length - 1]);
    return out;
}

/* =========================================================
   Screen
========================================================= */

type Mode = "idle" | "recording" | "saved";

export default function A6TracingChallengeScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity6RunDraft | null>(null);
    const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
    const [arena, setArena] = useState<{ width: number; height: number } | null>(null);
    const [mode, setMode] = useState<Mode>("idle");

    const [pathType, setPathType] = useState<A6TracingPathType>("circle");
    const [maxAllowedDeviationPx, setMaxAllowedDeviationPx] = useState<number>(A6_RECOMMENDED_MAX_DEV_PX);

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

    useEffect(() => {
        if (!user) return;

        const d = getActivity6RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Please restart Activity 6.", [
                {text: "OK", onPress: () => navigation.goBack()},
            ]);
            return;
        }

        setDraft(d);

        const first = d.session.participants?.[0]?.id ?? null;
        setSelectedParticipantId(first);

        const sessionType = (d.session.tracingPathType ?? "circle") as A6TracingPathType;
        setPathType(sessionType);

        const maxDev = clampInt(
            d.session.maxAllowedDeviationPx ?? A6_RECOMMENDED_MAX_DEV_PX,
            10,
            200
        );
        setMaxAllowedDeviationPx(maxDev);

        setReferencePath(buildReferencePath({type: sessionType, pointCount: 320, durationMs: 10_000}));
    }, [navigation, runId, user]);

    const participants = draft?.session.participants ?? [];
    const selectedName =
        participants.find((p) => p.id === selectedParticipantId)?.name ?? "Select participant";

    const canStart = useMemo(() => {
        if (!draft) return false;
        if (!selectedParticipantId) return false;
        if (!arena || arena.width <= 0 || arena.height <= 0) return false;
        return true;
    }, [arena, draft, selectedParticipantId]);

    function reset() {
        setMode("idle");
        setSavedSummary(null);
        setUserPath([]);
        startEpochRef.current = 0;
        startedAtRef.current = 0;
        setReferencePath(buildReferencePath({type: pathType, pointCount: 320, durationMs: 10_000}));
    }

    function rebuildReference() {
        setReferencePath(buildReferencePath({type: pathType, pointCount: 320, durationMs: 10_000}));
    }

    function startTracing() {
        if (!draft) return;
        if (!canStart) {
            Alert.alert("Not ready", "Please wait until the tracing area is loaded and a participant is selected.");
            return;
        }

        setSavedSummary(null);
        setUserPath([]);
        setMode("recording");

        const ts = now();
        startEpochRef.current = ts;
        startedAtRef.current = ts;

        rebuildReference();
    }

    function finishTracing() {
        if (!draft) return;
        const pid = selectedParticipantId ?? participants[0]?.id;
        if (!pid) return;

        if (mode !== "recording") return;

        const endedAt = now();
        const startedAt = startedAtRef.current || endedAt;
        const durationMs = clampInt(Math.max(0, endedAt - startedAt), 0, 10 * 60 * 1000);

        if (userPath.length < 20) {
            Alert.alert("Not enough tracing", "Please follow the path for a bit longer before finishing.");
            return;
        }

        if (!arena) {
            Alert.alert("Layout missing", "Tracing area not ready.");
            return;
        }

        const ref = downsample(referencePath, 320);
        const usr = downsample(userPath, 320);

        const dev = computeTracingDeviation({
            userPath: usr,
            referencePath: ref,
            screen: {width: arena.width, height: arena.height},
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

            setMode("saved");
        } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Failed to save tracing result.");
            setMode("idle");
        }
    }

    function handleTouch(e: any) {
        if (mode !== "recording") return;
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

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Tracing Challenge</Text>
                <Text style={styles.sub}>
                    Follow the dotted guide path continuously with your finger. We record your touch path and compute
                    deviation from the reference path to produce an accuracy score.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Participant</Text>
                    <Text style={styles.help}>
                        Rotate through team members. Each participant should complete at least one trace.
                    </Text>

                    <View style={styles.chipWrap}>
                        {participants.map((p) => {
                            const selected = p.id === selectedParticipantId;
                            return (
                                <Pressable
                                    key={p.id}
                                    style={[styles.chip, selected && styles.chipSelected]}
                                    onPress={() => setSelectedParticipantId(p.id)}
                                    disabled={mode === "recording"}
                                >
                                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                                        {p.name}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.note}>Selected: {selectedName}</Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Path</Text>
                    <Text style={styles.help}>
                        Path type is configured in Session Setup. Current:{" "}
                        <Text style={{fontWeight: "900"}}>{pathType}</Text>
                    </Text>

                    <Text style={[styles.note, {marginTop: 10}]}>
                        Max allowed deviation:{" "}
                        <Text style={{fontWeight: "900"}}>{maxAllowedDeviationPx}px</Text>
                    </Text>
                </View>

                <View style={styles.arenaCard}>
                    <Text style={styles.cardTitle}>Tracing Arena</Text>

                    {mode === "saved" && savedSummary ? (
                        <View style={styles.bannerLight}>
                            <Text style={styles.bannerTitleDark}>Saved ✅</Text>
                            <Text style={styles.bannerTextDark}>
                                {savedSummary.participantName} • Duration {Math.round(savedSummary.durationMs / 1000)}s
                            </Text>
                            <Text style={[styles.bannerTextDark, {marginTop: 6, fontWeight: "900"}]}>
                                Accuracy {formatPct(savedSummary.accuracyScorePct)} • Avg deviation{" "}
                                {formatPx(savedSummary.avgDeviationPx)}
                            </Text>
                        </View>
                    ) : null}

                    {mode === "recording" ? (
                        <View style={styles.bannerDark}>
                            <Text style={styles.bannerTitle}>Recording…</Text>
                            <Text style={styles.bannerText}>
                                Touch and drag continuously along the dotted reference path, then tap Finish.
                            </Text>
                        </View>
                    ) : null}

                    <View
                        style={styles.arena}
                        onLayout={(e) => {
                            const {width, height} = e.nativeEvent.layout;
                            setArena({width, height});
                            setReferencePath(buildReferencePath({type: pathType, pointCount: 320, durationMs: 10_000}));
                        }}
                        onStartShouldSetResponder={() => mode === "recording"}
                        onMoveShouldSetResponder={() => mode === "recording"}
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

                        {mode !== "recording" ? (
                            <View style={styles.overlayCenter}>
                                <Text style={styles.overlayText}>
                                    {arena
                                        ? "Press Start, then follow the dotted guide path continuously"
                                        : "Loading arena…"}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    <View style={{marginTop: 12, flexDirection: "row", gap: 10}}>
                        <Pressable
                            style={[styles.primaryBtn, (!canStart || mode === "recording") && styles.btnDisabled]}
                            disabled={!canStart || mode === "recording"}
                            onPress={startTracing}
                        >
                            <Text style={styles.primaryBtnText}>Start</Text>
                        </Pressable>

                        <Pressable
                            style={[styles.secondaryBtn, mode !== "recording" && styles.btnDisabled]}
                            disabled={mode !== "recording"}
                            onPress={finishTracing}
                        >
                            <Text style={styles.secondaryBtnText}>Finish</Text>
                        </Pressable>

                        <Pressable
                            style={[styles.ghostBtn, mode === "recording" && styles.btnDisabled]}
                            disabled={mode === "recording"}
                            onPress={reset}
                        >
                            <Text style={styles.ghostBtnText}>Reset</Text>
                        </Pressable>
                    </View>

                    <Text style={[styles.note, {marginTop: 10}]}>
                        Tip: keep your finger moving smoothly along the guide path for better accuracy.
                    </Text>
                </View>

                <Pressable
                    style={[styles.primaryBtnWide, mode === "recording" && styles.btnDisabled]}
                    disabled={mode === "recording"}
                    onPress={goToResults}
                >
                    <Text style={styles.primaryBtnText}>Continue to Results</Text>
                </Pressable>

                <View style={{height: 40}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

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
        height: 380,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        overflow: "hidden",
        position: "relative",
    },

    overlayCenter: {
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 18,
    },
    overlayText: {opacity: 0.7, fontWeight: "800", textAlign: "center"},

    refDot: {
        position: "absolute",
        width: 10,
        height: 10,
        borderRadius: 999,
        backgroundColor: "#111",
        opacity: 0.22,
    },
    userDot: {
        position: "absolute",
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: "#111",
        opacity: 0.82,
    },

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
    secondaryBtnText: {fontWeight: "900"},

    ghostBtn: {
        width: 90,
        borderWidth: 1,
        borderColor: "#ddd",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor: "white",
    },
    ghostBtnText: {fontWeight: "900", opacity: 0.8},
});