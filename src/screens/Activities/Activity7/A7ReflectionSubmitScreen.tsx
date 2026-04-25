// src/screens/Activities/Activity7/A7ReflectionSubmitScreen.tsx

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
    clearActivity7RunDraft,
    getActivity7RunDraft,
    setActivity7Reflection,
    setActivity7SessionVideo,
    validateA7Submission,
    getA7LeaderboardMetrics,
    isA7LeaderboardEligible,
    type Activity7RunDraft,
} from "../../../store/activity7RunDraftStore";
import {pickVideoFromLibrary, recordVideoWithCamera} from "../../../services/evidenceService";
import {submitActivity7} from "../../../services/activitySubmissionService";
import {ReflectionQualityCard} from "../../../components/reflection/ReflectionQualityCard";
import {checkReflectionQuality} from "../../../services/reflectionQualityService";

type Props = NativeStackScreenProps<AppStackParamList, "A7ReflectionSubmit">;

function now() {
    return Date.now();
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function isFiniteNumber(x: unknown): x is number {
    return typeof x === "number" && Number.isFinite(x);
}

function isNonEmptyString(x: unknown): x is string {
    return typeof x === "string" && x.trim().length > 0;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Submission failed.";
}

function getNumberProperty(value: unknown, key: string): number | undefined {
    if (typeof value !== "object" || value === null) return undefined;

    const record = value as Record<string, unknown>;
    const rawValue = record[key];

    return isFiniteNumber(rawValue) ? rawValue : undefined;
}

function getSessionVideoUri(run: Activity7RunDraft): string | null {
    const uri = run.evidence?.sessionVideo?.uri;
    return isNonEmptyString(uri) ? uri : null;
}

function hasSessionVideo(run: Activity7RunDraft) {
    return isNonEmptyString(getSessionVideoUri(run));
}

function hasGpsGranted(run: Activity7RunDraft) {
    return run.session.gpsEnabled === true && run.session.gpsPermission === "granted";
}

function hasRealGeo(run: Activity7RunDraft) {
    const g = run.session.geo;
    return !!g && isFiniteNumber(g.lat) && isFiniteNumber(g.lng);
}

function formatGeoText(geo: Activity7RunDraft["session"]["geo"] | undefined): string {
    if (!geo) return "No coordinate saved yet";
    if (!isFiniteNumber(geo.lat) || !isFiniteNumber(geo.lng)) return "No coordinate saved yet";

    const accText = isFiniteNumber(geo.accuracyM) ? ` (±${Math.round(geo.accuracyM)}m)` : "";
    const timeText = isFiniteNumber(geo.capturedAt)
        ? ` • ${new Date(geo.capturedAt).toLocaleString()}`
        : "";

    return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${accText}${timeText}`;
}

function stripVideoFromMissing(missing: string[]): string[] {
    return (missing ?? []).filter((m) => !String(m).toLowerCase().includes("video"));
}

function fmtBpm(v?: number) {
    if (!isFiniteNumber(v)) return "—";
    return `${v.toFixed(1)} BPM`;
}

function fmtScore(v?: number) {
    if (!isFiniteNumber(v)) return "—";
    return v.toFixed(3);
}

export default function A7ReflectionSubmitScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity7RunDraft | null>(null);
    const [reflectionText, setReflectionText] = useState("");
    const [rating, setRating] = useState<number>(4);
    const [submitting, setSubmitting] = useState(false);
    const [attaching, setAttaching] = useState(false);

    const reflectionQuality = useMemo(
        () => checkReflectionQuality(reflectionText),
        [reflectionText]
    );

    const refreshDraft = useCallback(() => {
        const d = getActivity7RunDraft(runId);
        setDraft(d ?? null);

        if (d) {
            setReflectionText(d.reflection?.reflectionText ?? "");
            setRating(d.reflection?.rating ?? 4);
        }
    }, [runId]);

    useEffect(() => {
        if (!user) return;

        const d = getActivity7RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Your draft session was reset. Please start again.", [
                {text: "OK", onPress: () => navigation.replace("A7SessionSetup", {activityId})},
            ]);
            return;
        }

        setDraft(d);
        setReflectionText(d.reflection?.reflectionText ?? "");
        setRating(d.reflection?.rating ?? 4);
    }, [activityId, navigation, runId, user]);

    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            refreshDraft();
        }, [refreshDraft, user])
    );

    const viewModel = useMemo(() => {
        if (!draft) return null;

        const missingAll = validateA7Submission(draft);
        const missingNoVideo = stripVideoFromMissing(missingAll);

        const leaderboard = getA7LeaderboardMetrics(draft);
        const eligible = isA7LeaderboardEligible(draft);

        const summaries = draft.metrics?.participantSummaries ?? [];
        const hasAllMeasurements =
            summaries.length > 0 &&
            summaries.every(
                (summary) =>
                    isFiniteNumber(summary.restBpm) &&
                    isFiniteNumber(summary.postJogBpm) &&
                    isFiniteNumber(summary.postStarJumpBpm) &&
                    isFiniteNumber(summary.recoveryConsistencyScore)
            );

        return {
            teamRecoveryConsistencyScore: leaderboard?.teamRecoveryConsistencyScore,
            bestParticipantId: leaderboard?.bestParticipantId,
            bestParticipantRecoveryConsistencyScore: leaderboard?.bestParticipantRecoveryConsistencyScore,

            eligible,
            hasAllMeasurements,

            sessionVid: hasSessionVideo(draft),

            gpsEnabled: draft.session.gpsEnabled === true,
            gpsGranted: hasGpsGranted(draft),
            geoCaptured: hasRealGeo(draft),
            geoText: formatGeoText(draft.session.geo),

            missingListNoVideo: missingNoVideo,
        };
    }, [draft]);

    const bestParticipantName = useMemo(() => {
        if (!draft || !viewModel?.bestParticipantId) return "—";

        return (
            draft.session.participants.find((participant) => participant.id === viewModel.bestParticipantId)?.name ??
            "—"
        );
    }, [draft, viewModel?.bestParticipantId]);

    const smartReflectionSummary = useMemo(() => {
        if (!draft || !viewModel) {
            return "Explain how breathing rate changed from rest to exercise and recovery.";
        }

        const predictedRest = fmtBpm(draft.prediction?.predictedRestBpm);
        const predictedAfterExercise = fmtBpm(draft.prediction?.predictedAfterExerciseBpm);
        const teamScore = fmtScore(viewModel.teamRecoveryConsistencyScore);

        return `Your team recovery consistency score was ${teamScore}. Your prediction estimated ${predictedRest} at rest and ${predictedAfterExercise} after exercise. Compare these predictions with the measured breathing phases and explain how exercise affected recovery.`;
    }, [draft, viewModel]);

    function validateLocal(targetDraft: Activity7RunDraft): string | null {
        const missingNoVideo = stripVideoFromMissing(validateA7Submission(targetDraft));

        if (missingNoVideo.length > 0) {
            return `Missing:\n• ${missingNoVideo.join("\n• ")}`;
        }

        if (reflectionQuality.isSubmissionBlocked) {
            return "Please improve your reflection before submitting. It may be empty, too short, or contain inappropriate language.";
        }

        if (!isFiniteNumber(rating) || rating < 1 || rating > 5) {
            return "Rating must be between 1 and 5.";
        }

        return null;
    }

    async function onAttachVideoPick() {
        try {
            setAttaching(true);
            const picked = await pickVideoFromLibrary();
            if (!picked) return;

            setActivity7SessionVideo(runId, {uri: picked.uri, createdAt: now()});
            refreshDraft();
        } catch (error: unknown) {
            Alert.alert("Attach failed", getErrorMessage(error));
        } finally {
            setAttaching(false);
        }
    }

    async function onAttachVideoRecord() {
        try {
            setAttaching(true);
            const recorded = await recordVideoWithCamera();
            if (!recorded) return;

            setActivity7SessionVideo(runId, {uri: recorded.uri, createdAt: now()});
            refreshDraft();
        } catch (error: unknown) {
            Alert.alert("Attach failed", getErrorMessage(error));
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
                    setActivity7SessionVideo(runId, undefined);
                    refreshDraft();
                },
            },
        ]);
    }

    function onAttachVideoMenu() {
        const hasVid = !!draft && hasSessionVideo(draft);

        const buttons: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [
            {text: "Pick from library", onPress: () => void onAttachVideoPick()},
            {text: "Record with camera", onPress: () => void onAttachVideoRecord()},
        ];

        if (hasVid) {
            buttons.push({text: "Remove attached video", style: "destructive", onPress: onRemoveVideo});
        }

        buttons.push({text: "Cancel", style: "cancel"});

        Alert.alert("Session video evidence", "Optional — attach if you have it.", buttons);
    }

    async function onSubmit() {
        if (!user || !draft) return;

        const updated = setActivity7Reflection(runId, {
            reflectionText: reflectionText.trim(),
            rating: clampInt(rating, 1, 5),
        });

        setDraft(updated);

        const err = validateLocal(updated);
        if (err) {
            const low = err.toLowerCase();

            Alert.alert("Cannot submit", err, [
                low.includes("gps") || low.includes("coordinate")
                    ? {
                        text: "Capture Location",
                        onPress: () => navigation.navigate("A7SessionSetup", {activityId, runId}),
                    }
                    : low.includes("prediction")
                        ? {
                            text: "Go to Prediction",
                            onPress: () => navigation.navigate("A7Prediction", {activityId, runId}),
                        }
                        : low.includes("measurement") ||
                        low.includes("rest") ||
                        low.includes("post-jog") ||
                        low.includes("post-star")
                            ? {
                                text: "Go to Measurements",
                                onPress: () => navigation.navigate("A7Measurements", {activityId, runId}),
                            }
                            : {text: "OK"},
            ]);
            return;
        }

        try {
            setSubmitting(true);

            const userSnap = await getDoc(doc(db, "users", user.uid));
            const teamId = userSnap.data()?.teamId;

            if (!isNonEmptyString(teamId)) {
                Alert.alert("Join a team", "You must join a team before submitting.");
                return;
            }

            const submitArgs = {
                run: updated,
                teamId,
                createdBy: user.uid,
                reflection: updated.reflection?.reflectionText ?? reflectionText.trim(),
                rating: updated.reflection?.rating ?? rating,
            };

            const res = await submitActivity7(submitArgs);

            clearActivity7RunDraft(runId);

            const scoreTxt = `${Math.round(getNumberProperty(res, "score") ?? 0)}`;
            const recoveryTxt = fmtScore(getNumberProperty(res, "teamRecoveryConsistencyScore"));

            Alert.alert(
                "Submitted ✅",
                `Leaderboard score: ${scoreTxt}\nTeam recovery consistency: ${recoveryTxt}`,
                [
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
                ]
            );
        } catch (error: unknown) {
            try {
                const userSnap = await getDoc(doc(db, "users", user.uid));
                const teamId = userSnap.data()?.teamId;

                if (!isNonEmptyString(teamId)) {
                    Alert.alert("Error", getErrorMessage(error));
                    return;
                }

                const submitArgs = {
                    run: updated,
                    teamId,
                    createdBy: user.uid,
                    reflection: updated.reflection?.reflectionText ?? reflectionText.trim(),
                    rating: updated.reflection?.rating ?? rating,
                };

                await queueFinalSubmission({
                    runId: updated.runId,
                    activityId: "activity07_breathingPaceTrainer",
                    userId: user.uid,
                    teamId,
                    payload: {
                        activityNumber: 7,
                        args: submitArgs,
                    },
                });

                Alert.alert(
                    "Saved offline",
                    "Firebase submission failed, so this finalized submission was saved locally and will sync automatically when connection is available."
                );
            } catch (queueError: unknown) {
                Alert.alert("Error", getErrorMessage(queueError));
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
                    Submission requires all breathing measurements, reflection quality, rating, and GPS if enabled.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Performance Summary</Text>

                    <Text style={styles.scoreText}>{fmtScore(viewModel.teamRecoveryConsistencyScore)}</Text>
                    <Text style={styles.help}>Team recovery consistency score. Lower is scientifically better.</Text>

                    <View style={{marginTop: 12, gap: 10}}>
                        <ChecklistRow label="All required breathing phases recorded" ok={viewModel.hasAllMeasurements}/>
                        <ChecklistRow
                            label="Leaderboard eligible"
                            ok={viewModel.eligible}
                            meta={`Best participant: ${bestParticipantName} • Best score: ${fmtScore(
                                viewModel.bestParticipantRecoveryConsistencyScore
                            )}`}
                        />
                        <ChecklistRow
                            label="Prediction available"
                            ok={!!draft.prediction?.createdAt}
                            meta={`Rest: ${fmtBpm(draft.prediction?.predictedRestBpm)} • After exercise: ${fmtBpm(
                                draft.prediction?.predictedAfterExerciseBpm
                            )}`}
                        />
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Submission Checklist</Text>

                    <View style={{marginTop: 10, gap: 10}}>
                        <ChecklistRow
                            label="Breathing measurement dataset recorded (required)"
                            ok={viewModel.hasAllMeasurements}
                        />

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
                            <ChecklistRow label="GPS disabled for this session" ok={true} meta="Not required"/>
                        )}

                        <ChecklistRow
                            label="Reflection quality"
                            ok={!reflectionQuality.isSubmissionBlocked}
                            meta={`${reflectionQuality.wordCount} words • ${reflectionQuality.status.replace("_", " ")}`}
                        />
                    </View>

                    {viewModel.missingListNoVideo.length > 0 ? (
                        <Text style={styles.tiny}>Missing: {viewModel.missingListNoVideo.join(", ")}</Text>
                    ) : (
                        <Text style={styles.tiny}>All required items are present.</Text>
                    )}

                    {viewModel.gpsEnabled ? (
                        <View style={styles.badgeRow}>
                            <Text style={styles.badgeLabel}>Saved coordinate</Text>
                            <View style={[styles.badge, viewModel.geoCaptured ? styles.badgeYes : styles.badgeNo]}>
                                <Text style={styles.badgeText}>{viewModel.geoText}</Text>
                            </View>

                            {viewModel.gpsGranted && !viewModel.geoCaptured ? (
                                <Pressable
                                    style={[styles.secondaryBtn, {marginTop: 12}]}
                                    onPress={() => navigation.navigate("A7SessionSetup", {activityId, runId})}
                                >
                                    <Text style={styles.secondaryBtnText}>Capture Location</Text>
                                </Pressable>
                            ) : null}
                        </View>
                    ) : null}

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

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Reflection</Text>

                    <View style={styles.smartBox}>
                        <Text style={styles.smartTitle}>Smart reflection guide</Text>
                        <Text style={styles.smartText}>{smartReflectionSummary}</Text>
                        <Text style={styles.smartText}>Try to include:</Text>
                        <Text style={styles.promptText}>• Whether your breathing-rate prediction matched the measured
                            BPM values.</Text>
                        <Text style={styles.promptText}>• Which stage had the highest breathing rate and why.</Text>
                        <Text style={styles.promptText}>• How exercise affected recovery and breathing control.</Text>
                        <Text style={styles.promptText}>• One way to improve the test accuracy next time.</Text>
                    </View>

                    <Text style={styles.label}>Your reflection</Text>
                    <TextInput
                        value={reflectionText}
                        onChangeText={setReflectionText}
                        placeholder="Example: My breathing rate increased after exercise, and the recovery phase showed how quickly it returned toward rest..."
                        style={[styles.input, {height: 150, textAlignVertical: "top"}]}
                        multiline
                    />

                    <ReflectionQualityCard result={reflectionQuality}/>
                </View>

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

                <Pressable
                    style={[styles.primaryBtn, submitting && {opacity: 0.7}]}
                    onPress={onSubmit}
                    disabled={submitting}
                >
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

    smartBox: {
        marginTop: 10,
        borderWidth: 1,
        borderColor: "#dbeafe",
        backgroundColor: "#eff6ff",
        borderRadius: 12,
        padding: 12,
    },
    smartTitle: {fontWeight: "900", color: "#1e3a8a"},
    smartText: {marginTop: 6, color: "#1f2937", lineHeight: 18},
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