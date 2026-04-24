// src/screens/Activities/Activity5/A5ReflectionSubmitScreen.tsx
import React, {useCallback, useEffect, useMemo, useState} from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";
import {useFocusEffect} from "@react-navigation/native";
import {doc, getDoc} from "firebase/firestore";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth, db} from "../../../services/firebase";

import {queueFinalSubmission} from "../../../services/offlineSubmissionQueueService";

import {
    clearActivity5RunDraft,
    getActivity5RunDraft,
    setActivity5Reflection,
    setActivity5SessionVideo,
    validateA5Submission,
    getA5BestImprovement,
    type Activity5RunDraft,
    type A5MovementType,
} from "../../../store/activity5RunDraftStore";

import {pickVideoFromLibrary, recordVideoWithCamera} from "../../../services/evidenceService";
import {submitActivity5} from "../../../services/activitySubmissionService";

type Props = NativeStackScreenProps<AppStackParamList, "A5ReflectionSubmit">;

/* =========================================================
   Constants
========================================================= */

// ✅ Single source of truth for leaderboard score unit
// If your “best improvement” raw is ~0.2, then leaderboard stores ~20.
const A5_LEADERBOARD_SCORE_SCALE = 100;

// If you want integer leaderboard scores, keep Math.round.
// If you want 1 decimal, change to: Math.round(raw * scale * 10) / 10
function scaleA5Score(raw: number) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
    return Math.max(0, Math.round(raw * A5_LEADERBOARD_SCORE_SCALE));
}

/* =========================================================
   Helpers
========================================================= */

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function isNonEmptyString(x: unknown): x is string {
    return typeof x === "string" && x.trim().length > 0;
}

// Video (A5 uses: draft.evidence?.sessionVideo?.uri)
function getSessionVideoUri(run: Activity5RunDraft): string | null {
    const uri = run.evidence?.sessionVideo?.uri;
    return isNonEmptyString(uri) ? uri : null;
}

function hasSessionVideo(run: Activity5RunDraft) {
    return isNonEmptyString(getSessionVideoUri(run));
}

// GPS
function hasGpsGranted(run: Activity5RunDraft) {
    return run.session.gpsEnabled === true && run.session.gpsPermission === "granted";
}

function hasRealGeo(run: Activity5RunDraft) {
    const g = run.session.geo;
    return !!g && isFiniteNumber(g.lat) && isFiniteNumber(g.lng);
}

function formatGeoText(geo: Activity5RunDraft["session"]["geo"] | undefined): string {
    if (!geo) return "No coordinate saved yet";
    if (!isFiniteNumber(geo.lat) || !isFiniteNumber(geo.lng)) return "No coordinate saved yet";

    const accText = isFiniteNumber(geo.accuracyM) ? ` (±${Math.round(geo.accuracyM)}m)` : "";
    const timeText = isFiniteNumber(geo.capturedAt) ? ` • ${new Date(geo.capturedAt).toLocaleString()}` : "";
    return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${accText}${timeText}`;
}

// Prediction required (FR-A5-07)
function hasPrediction(run: Activity5RunDraft) {
    return Boolean(run.prediction?.createdAt);
}

function hasAnyDataset(run: Activity5RunDraft) {
    return (run.trials ?? []).some(
        (t) => t?.dataset && Array.isArray(t.dataset.samples) && t.dataset.samples.length > 0
    );
}

// Improvement display helper (FR-A5-11/13)
function movementTitleForType(run: Activity5RunDraft, t?: A5MovementType) {
    if (!t) return "—";
    const mv = run.session.movements.find((m) => m.type === t);
    return mv?.title ?? t;
}

/**
 * UX decision: Session video is OPTIONAL for Activity 5.
 * We still allow attaching for evidence, but do not block submission.
 */
function stripVideoFromMissing(missing: string[]): string[] {
    return (missing ?? []).filter((m) => !String(m).toLowerCase().includes("video"));
}

/* =========================================================
   Screen
========================================================= */

export default function A5ReflectionSubmitScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity5RunDraft | null>(null);

    const [reflectionText, setReflectionText] = useState("");
    const [rating, setRating] = useState<number>(4);

    const [submitting, setSubmitting] = useState(false);
    const [attaching, setAttaching] = useState(false);

    const refreshDraft = useCallback(() => {
        const d = getActivity5RunDraft(runId);
        setDraft(d ?? null);
        if (d) {
            setReflectionText(d.reflection?.reflectionText ?? "");
            setRating(d.reflection?.rating ?? 4);
        }
    }, [runId]);

    // initial load
    useEffect(() => {
        if (!user) return;

        const d = getActivity5RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Your draft session was reset. Please start again.", [
                {text: "OK", onPress: () => navigation.replace("A5SessionSetup", {activityId})},
            ]);
            return;
        }

        setDraft(d);
        setReflectionText(d.reflection?.reflectionText ?? "");
        setRating(d.reflection?.rating ?? 4);
    }, [activityId, navigation, runId, user]);

    // refresh when returning to this screen
    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            refreshDraft();
        }, [refreshDraft, user])
    );

    const viewModel = useMemo(() => {
        if (!draft) return null;

        const best = getA5BestImprovement(draft);
        const missingAll = validateA5Submission(draft);
        const missingNoVideo = stripVideoFromMissing(missingAll);

        // ✅ use the SAME scaling logic as submission
        const bestImprovementScaled = scaleA5Score(best.bestScore);

        return {
            bestImprovementScaled,
            bestParticipantId: best.participantId,
            bestMovementType: best.movementType,
            bestMovementTitle: movementTitleForType(draft, best.movementType),

            predictionOk: hasPrediction(draft),
            datasetOk: hasAnyDataset(draft),

            // OPTIONAL now
            sessionVid: hasSessionVideo(draft),

            gpsGranted: hasGpsGranted(draft),
            geoCaptured: hasRealGeo(draft),
            geoText: formatGeoText(draft.session.geo),

            // For UI messaging only
            missingListAll: missingAll,
            missingListNoVideo: missingNoVideo,

            gpsEnabled: draft.session.gpsEnabled === true,
        };
    }, [draft]);

    function validateLocal(): string | null {
        if (!draft) return "Draft not found.";

        // Keep in sync with store validator, but treat VIDEO as OPTIONAL here.
        const missingNoVideo = stripVideoFromMissing(validateA5Submission(draft));
        if (missingNoVideo.length > 0) return `Missing:\n• ${missingNoVideo.join("\n• ")}`;

        const text = reflectionText.trim();
        if (text.length < 20) return "Reflection is too short. Write at least 1–2 meaningful sentences.";
        if (!isFiniteNumber(rating) || rating < 1 || rating > 5) return "Rating must be between 1 and 5.";

        return null;
    }

    async function onAttachVideoPick() {
        try {
            setAttaching(true);
            const picked = await pickVideoFromLibrary();
            if (!picked) return;

            setActivity5SessionVideo(runId, {uri: picked.uri, createdAt: Date.now()});
            refreshDraft();
        } catch (e: any) {
            Alert.alert("Attach failed", e?.message ?? "Failed to pick video.");
        } finally {
            setAttaching(false);
        }
    }

    async function onAttachVideoRecord() {
        try {
            setAttaching(true);
            const recorded = await recordVideoWithCamera();
            if (!recorded) return;

            setActivity5SessionVideo(runId, {uri: recorded.uri, createdAt: Date.now()});
            refreshDraft();
        } catch (e: any) {
            Alert.alert("Attach failed", e?.message ?? "Failed to record video.");
        } finally {
            setAttaching(false);
        }
    }

    function onRemoveVideo() {
        Alert.alert("Remove video?", "This will detach the session video evidence from this draft.", [
            {text: "Cancel", style: "cancel"},
            {
                text: "Remove",
                style: "destructive",
                onPress: () => {
                    setActivity5SessionVideo(runId, undefined);
                    refreshDraft();
                },
            },
        ]);
    }

    /**
     * UX fix:
     * - Session video is OPTIONAL
     * - If user tapped by accident, they can safely choose "Close" and do nothing
     * - We never force them to pick/record
     */
    function onAttachVideoMenu() {
        const hasVid = !!draft && hasSessionVideo(draft);

        const buttons: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [
            {text: "Close", style: "cancel"},
            {text: "Pick from library", onPress: () => void onAttachVideoPick()},
            {text: "Record with camera", onPress: () => void onAttachVideoRecord()},
        ];

        if (hasVid) {
            buttons.push({text: "Remove attached video", style: "destructive", onPress: onRemoveVideo});
        }

        Alert.alert("Session video evidence", "Optional — attach if you have it.", buttons);
    }

    async function onSubmit() {
        if (!user || !draft) return;

        // Save reflection into draft first (local)
        const updated = setActivity5Reflection(runId, {
            reflectionText: reflectionText.trim(),
            rating: clampInt(rating, 1, 5),
        });
        setDraft(updated);

        const err = validateLocal();
        if (err) {
            const low = err.toLowerCase();
            Alert.alert(
                "Cannot submit",
                err,
                [
                    low.includes("gps") || low.includes("coordinate")
                        ? {
                            text: "Capture Location",
                            onPress: () => navigation.navigate("A5SessionSetup", {activityId, runId}),
                        }
                        : low.includes("prediction")
                            ? {
                                text: "Go to Prediction",
                                onPress: () => navigation.navigate("A5Prediction", {activityId, runId}),
                            }
                            : low.includes("trial") || low.includes("dataset") || low.includes("baseline") || low.includes("feedback")
                                ? {
                                    text: "Go to Trials",
                                    onPress: () => navigation.navigate("A5GuidedTrials", {activityId, runId}),
                                }
                                : {text: "OK"},
                ]
            );
            return;
        }

        try {
            setSubmitting(true);

            // Fetch teamId safely
            const userSnap = await getDoc(doc(db, "users", user.uid));
            const teamId = userSnap.data()?.teamId;

            if (!isNonEmptyString(teamId)) {
                Alert.alert("Join a team", "You must join a team before submitting.");
                return;
            }

            // ✅ Compute canonical score that MUST be written to leaderboard
            const best = getA5BestImprovement(updated);
            const bestImprovementScore = scaleA5Score(best.bestScore);

            const res = await submitActivity5({
                run: updated,
                teamId,
                createdBy: user.uid,

                // keep explicit values (matches your style)
                reflection: updated.reflection?.reflectionText ?? reflectionText.trim(),
                rating: updated.reflection?.rating ?? rating,

                // ✅ NEW: store scaled score + metadata (so leaderboard matches UI)
                bestImprovementScore,
                bestParticipantId: best.participantId,
                bestMovementType: best.movementType,
            });

            clearActivity5RunDraft(runId);

            // Prefer returned score; fallback to our computed score.
            const shownScore =
                typeof (res as any)?.score === "number" && Number.isFinite((res as any).score)
                    ? (res as any).score
                    : bestImprovementScore;

            Alert.alert("Submitted ✅", `Your best improvement: ${shownScore}`, [
                {
                    text: "View Leaderboard",
                    onPress: () =>
                        navigation.reset({
                            index: 1,
                            routes: [{name: "Home" as never}, {name: "Leaderboard" as never}],
                        }),
                },
                {
                    text: "Back to Home",
                    style: "cancel",
                    onPress: () =>
                        navigation.reset({
                            index: 0,
                            routes: [{name: "Home" as never}],
                        }),
                },
            ]);
        } catch (e: any) {
            try {
                const userSnap = await getDoc(doc(db, "users", user.uid));
                const teamId = userSnap.data()?.teamId;

                if (!isNonEmptyString(teamId)) {
                    Alert.alert("Error", e?.message ?? "Submission failed.");
                    return;
                }

                const best = getA5BestImprovement(updated);
                const bestImprovementScore = scaleA5Score(best.bestScore);

                const submitArgs = {
                    run: updated,
                    teamId,
                    createdBy: user.uid,
                    reflection: updated.reflection?.reflectionText ?? reflectionText.trim(),
                    rating: updated.reflection?.rating ?? rating,
                    bestImprovementScore,
                    bestParticipantId: best.participantId,
                    bestMovementType: best.movementType,
                };

                await queueFinalSubmission({
                    runId: updated.runId,
                    activityId: "activity05_humanPerformance",
                    userId: user.uid,
                    teamId,
                    payload: {
                        activityNumber: 5,
                        args: submitArgs,
                    },
                });

                Alert.alert(
                    "Saved offline",
                    "Firebase submission failed, so this finalized submission was saved locally and will sync automatically when connection is available."
                );
            } catch (queueError: any) {
                Alert.alert(
                    "Error",
                    queueError?.message ?? e?.message ?? "Submission failed."
                );
            }
        } finally {
            setSubmitting(false);
        }
    }

    if (!user) return null;

    if (!draft || !viewModel) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10, opacity: 0.7}}>Loading draft…</Text>
            </View>
        );
    }

    const bestParticipantName =
        viewModel.bestParticipantId
            ? draft.session.participants.find((p) => p.id === viewModel.bestParticipantId)?.name ?? "—"
            : "—";

    const attachedName = (() => {
        const uri = getSessionVideoUri(draft);
        if (!uri) return null;
        const last = uri.split("/").slice(-1)[0];
        return last || "video";
    })();

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Reflection & Submit</Text>
                <Text style={styles.sub}>
                    Leaderboard score uses your best improvement (scaled ×{A5_LEADERBOARD_SCORE_SCALE}).
                </Text>

                {/* Best improvement card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Best Improvement (Leaderboard Score)</Text>
                    <Text style={styles.scoreText}>
                        {Number.isFinite(viewModel.bestImprovementScaled) ? String(viewModel.bestImprovementScaled) : "—"}
                    </Text>
                    <Text style={styles.help}>
                        {bestParticipantName} • {viewModel.bestMovementTitle}
                    </Text>
                </View>

                {/* Checklist */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Submission Checklist</Text>

                    <View style={{marginTop: 10, gap: 10}}>
                        <ChecklistRow label="Prediction completed (required)" ok={viewModel.predictionOk}/>
                        <ChecklistRow label="Recorded sensor dataset (required)" ok={viewModel.datasetOk}/>

                        {/* ✅ OPTIONAL VIDEO */}
                        <ChecklistRow
                            label="Session video (optional)"
                            ok={viewModel.sessionVid}
                            meta={viewModel.sessionVid ? "Attached ✅" : "Not attached (OK)"}
                        />

                        {viewModel.gpsEnabled ? (
                            <>
                                <ChecklistRow
                                    label="GPS enabled + granted (required)"
                                    ok={viewModel.gpsGranted}
                                    meta={viewModel.gpsGranted ? "Granted ✅" : "Not granted"}
                                />
                                <ChecklistRow
                                    label="GPS coordinate captured (required)"
                                    ok={viewModel.geoCaptured}
                                    meta={viewModel.geoCaptured ? "Captured ✅" : "Not captured yet"}
                                />
                            </>
                        ) : (
                            <ChecklistRow label="GPS (disabled for this session)" ok={true} meta="Not required"/>
                        )}

                        <ChecklistRow
                            label="Reflection + rating (required)"
                            ok={reflectionText.trim().length >= 20 && rating >= 1 && rating <= 5}
                            meta="Write ≥ 1–2 meaningful sentences and rate 1–5"
                        />
                    </View>

                    {/* Missing list preview (video-stripped) */}
                    {viewModel.missingListNoVideo.length > 0 ? (
                        <Text style={styles.tiny}>Missing: {viewModel.missingListNoVideo.join(", ")}</Text>
                    ) : (
                        <Text style={styles.tiny}>All required items are present.</Text>
                    )}

                    {/* GPS coordinate badge */}
                    {viewModel.gpsEnabled ? (
                        <View style={styles.badgeRow}>
                            <Text style={styles.badgeLabel}>Saved coordinate</Text>
                            <View style={[styles.badge, viewModel.geoCaptured ? styles.badgeYes : styles.badgeNo]}>
                                <Text style={styles.badgeText}>{viewModel.geoText}</Text>
                            </View>

                            {viewModel.gpsGranted && !viewModel.geoCaptured ? (
                                <Pressable
                                    style={[styles.secondaryBtn, {marginTop: 12}]}
                                    onPress={() => navigation.navigate("A5SessionSetup", {activityId, runId})}
                                >
                                    <Text style={styles.secondaryBtnText}>Capture Location</Text>
                                </Pressable>
                            ) : null}
                        </View>
                    ) : null}

                    {/* Video attach UI (safe menu with "Close") */}
                    <Pressable
                        style={[styles.secondaryBtn, {marginTop: 12}, attaching && {opacity: 0.7}]}
                        onPress={onAttachVideoMenu}
                        disabled={attaching}
                    >
                        {attaching ? (
                            <View style={{flexDirection: "row", alignItems: "center", gap: 10}}>
                                <ActivityIndicator/>
                                <Text style={styles.secondaryBtnText}>Processing…</Text>
                            </View>
                        ) : (
                            <Text style={styles.secondaryBtnText}>
                                {viewModel.sessionVid ? "Manage Session Video" : "Attach Session Video"}
                            </Text>
                        )}
                    </Pressable>

                    {attachedName ? <Text style={styles.tiny}>Attached: {attachedName}</Text> : null}
                </View>

                {/* Reflection */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Reflection</Text>

                    <View style={styles.promptBox}>
                        <Text style={styles.promptTitle}>Prompts (plain language)</Text>
                        <Text style={styles.promptText}>• Which movement was hardest to keep vibration low?</Text>
                        <Text style={styles.promptText}>• Were you right about your prediction? Any surprises?</Text>
                        <Text style={styles.promptText}>• What changed between baseline vs feedback mode?</Text>
                    </View>

                    <Text style={styles.label}>Your reflection</Text>
                    <TextInput
                        value={reflectionText}
                        onChangeText={setReflectionText}
                        placeholder="Write at least 1–2 meaningful sentences..."
                        style={[styles.input, {height: 140, textAlignVertical: "top"}]}
                        multiline
                    />
                </View>

                {/* Rating */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Rating</Text>
                    <Text style={styles.help}>How did this activity feel overall? (1–5)</Text>

                    <View style={styles.ratingRow}>
                        {[1, 2, 3, 4, 5].map((n) => {
                            const on = rating === n;
                            return (
                                <Pressable
                                    key={n}
                                    onPress={() => setRating(clampInt(n, 1, 5))}
                                    style={[styles.rateBtn, on && styles.rateBtnOn]}
                                >
                                    <Text style={[styles.rateText, on && styles.rateTextOn]}>{n}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                {/* Submit */}
                <Pressable style={[styles.primaryBtn, submitting && {opacity: 0.7}]} onPress={onSubmit}
                           disabled={submitting}>
                    {submitting ? (
                        <View style={{flexDirection: "row", alignItems: "center", gap: 10}}>
                            <ActivityIndicator color="white"/>
                            <Text style={styles.primaryBtnText}>Submitting…</Text>
                        </View>
                    ) : (
                        <Text style={styles.primaryBtnText}>Submit</Text>
                    )}
                </Pressable>

                <View style={{height: 30}}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function ChecklistRow(props: { label: string; ok: boolean; meta?: string }) {
    return (
        <View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between"}}>
            <View style={{flex: 1, paddingRight: 10}}>
                <Text style={{fontWeight: "900"}}>{props.label}</Text>
                {props.meta ? <Text style={{marginTop: 4, opacity: 0.7}}>{props.meta}</Text> : null}
            </View>
            <View style={[styles.tickPill, props.ok ? styles.tickYes : styles.tickNo]}>
                <Text style={styles.tickText}>{props.ok ? "OK" : "Missing"}</Text>
            </View>
        </View>
    );
}

/* =========================================================
   Styles
========================================================= */

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20, backgroundColor: "#fff"},
    center: {flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff"},

    title: {fontSize: 26, fontWeight: "900", marginTop: 6},
    sub: {marginTop: 8, opacity: 0.75, lineHeight: 18},

    card: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {fontSize: 16, fontWeight: "900"},
    label: {marginTop: 12, fontWeight: "800"},
    help: {marginTop: 6, opacity: 0.7, lineHeight: 18},
    tiny: {marginTop: 10, opacity: 0.65, lineHeight: 18, fontSize: 12},

    scoreText: {marginTop: 10, fontSize: 34, fontWeight: "900"},

    promptBox: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    promptTitle: {fontWeight: "900"},
    promptText: {marginTop: 6, opacity: 0.85, lineHeight: 18},

    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
    },

    ratingRow: {marginTop: 10, flexDirection: "row", gap: 10},
    rateBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
    },
    rateBtnOn: {backgroundColor: "#111", borderColor: "#111"},
    rateText: {fontWeight: "900", opacity: 0.85},
    rateTextOn: {color: "white", opacity: 1},

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    secondaryBtn: {
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#111",
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},

    tickPill: {borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10},
    tickYes: {backgroundColor: "#111"},
    tickNo: {backgroundColor: "#777"},
    tickText: {color: "white", fontWeight: "900"},

    badgeRow: {marginTop: 12, gap: 8},
    badgeLabel: {fontWeight: "800", opacity: 0.9},
    badge: {borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10},
    badgeYes: {backgroundColor: "#111"},
    badgeNo: {backgroundColor: "#777"},
    badgeText: {color: "white", fontWeight: "900"},
});