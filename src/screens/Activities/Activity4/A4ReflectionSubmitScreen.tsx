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
    clearActivity4RunDraft,
    getActivity4RunDraft,
    setActivity4Reflection,
    setActivity4SessionVideo,
    type Activity4RunDraft,
} from "../../../store/activity4RunDraftStore";
import {pickVideoFromLibrary, recordVideoWithCamera} from "../../../services/evidenceService";
import {submitActivity4} from "../../../services/activitySubmissionService";
import {ReflectionQualityCard} from "../../../components/reflection/ReflectionQualityCard";
import {checkReflectionQuality} from "../../../services/reflectionQualityService";

type Props = NativeStackScreenProps<AppStackParamList, "A4ReflectionSubmit">;

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

function getSessionVideoUri(run: Activity4RunDraft): string | null {
    const uri = run.evidence?.sessionVideo?.uri;
    return isNonEmptyString(uri) ? uri : null;
}

function hasSessionVideo(run: Activity4RunDraft) {
    return isNonEmptyString(getSessionVideoUri(run));
}

function hasGpsGranted(run: Activity4RunDraft) {
    return run.session.gpsEnabled === true && run.session.gpsPermission === "granted";
}

function hasRealGeo(run: Activity4RunDraft) {
    const g = run.session.geo;
    return !!g && isFiniteNumber(g.lat) && isFiniteNumber(g.lng);
}

function formatGeoText(geo: Activity4RunDraft["session"]["geo"] | undefined): string {
    if (!geo) return "No coordinate saved yet";
    if (!isFiniteNumber(geo.lat) || !isFiniteNumber(geo.lng)) return "No coordinate saved yet";

    const accText = isFiniteNumber(geo.accuracyM) ? ` (±${Math.round(geo.accuracyM)}m)` : "";
    const timeText = isFiniteNumber(geo.capturedAt)
        ? ` • ${new Date(geo.capturedAt).toLocaleString()}`
        : "";

    return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${accText}${timeText}`;
}

function hasPrediction(run: Activity4RunDraft) {
    return Boolean(run.prediction?.createdAt);
}

function measurementScore(m: Activity4RunDraft["measurements"][number]): number | null {
    if (isFiniteNumber(m.finalScore)) return m.finalScore;
    if (isFiniteNumber(m.movementScore)) return m.movementScore;
    return null;
}

function bestMovementScore(run: Activity4RunDraft): number | null {
    const scores = run.measurements
        .map((m) => measurementScore(m))
        .filter((x): x is number => isFiniteNumber(x));

    if (scores.length === 0) return null;
    return Math.min(...scores);
}

function validMeasurementCount(run: Activity4RunDraft): number {
    return run.measurements.filter((m) => measurementScore(m) != null).length;
}

function distinctMeasuredDesignCount(run: Activity4RunDraft): number {
    const designs = new Set<number>();

    for (const measurement of run.measurements) {
        const score = measurementScore(measurement);
        if (score != null && Number.isFinite(score)) {
            designs.add(measurement.designIndex);
        }
    }

    return designs.size;
}

function bestMeasuredDesignName(run: Activity4RunDraft): string | null {
    const validMeasurements = run.measurements.filter((m) => measurementScore(m) != null);

    if (validMeasurements.length === 0) return null;

    const best = validMeasurements.reduce((currentBest, current) => {
        const bestScore = measurementScore(currentBest) ?? Number.POSITIVE_INFINITY;
        const currentScore = measurementScore(current) ?? Number.POSITIVE_INFINITY;
        return currentScore < bestScore ? current : currentBest;
    }, validMeasurements[0]);

    const designName = run.session.designs?.[best.designIndex]?.name;
    return designName ?? `Design ${best.designIndex + 1}`;
}

export default function A4ReflectionSubmitScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity4RunDraft | null>(null);
    const [reflectionText, setReflectionText] = useState("");
    const [rating, setRating] = useState<number>(4);
    const [submitting, setSubmitting] = useState(false);
    const [attaching, setAttaching] = useState(false);

    const reflectionQuality = useMemo(
        () => checkReflectionQuality(reflectionText),
        [reflectionText]
    );

    const refreshDraft = useCallback(() => {
        const d = getActivity4RunDraft(runId);
        setDraft(d ?? null);

        if (d) {
            setReflectionText(d.reflection?.reflectionText ?? "");
            setRating(d.reflection?.rating ?? 4);
        }
    }, [runId]);

    useEffect(() => {
        if (!user) return;

        const d = getActivity4RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Your draft session was reset. Please start again.", [
                {text: "OK", onPress: () => navigation.replace("A4SessionSetup", {activityId})},
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

        return {
            bestScore: bestMovementScore(draft),
            bestDesignName: bestMeasuredDesignName(draft),
            measurementCount: validMeasurementCount(draft),
            distinctDesignsMeasured: distinctMeasuredDesignCount(draft),
            predictionOk: hasPrediction(draft),
            sessionVid: hasSessionVideo(draft),
            gpsGranted: hasGpsGranted(draft),
            geoCaptured: hasRealGeo(draft),
            geoText: formatGeoText(draft.session.geo),
            requiredDesigns: Math.max(3, draft.session.designCount ?? 3),
        };
    }, [draft]);

    const smartReflectionSummary = useMemo(() => {
        if (!draft || !viewModel) {
            return "Explain which structure was most stable during the simulated earthquake test.";
        }

        if (viewModel.bestScore == null || !viewModel.bestDesignName) {
            return "Use your accelerometer measurements to explain which structure reduced movement the most.";
        }

        return `${viewModel.bestDesignName} had the lowest movement score (${viewModel.bestScore.toFixed(3)}), so it showed the strongest vibration resistance. Compare this result with your prediction and explain what design features may have improved stability.`;
    }, [draft, viewModel]);

    function validate(): string | null {
        if (!draft) return "Draft not found.";

        const measuredDesigns = distinctMeasuredDesignCount(draft);
        if (measuredDesigns < 3) {
            return "Please measure at least 3 designs before submitting.";
        }

        if (!hasPrediction(draft)) {
            return "Prediction is required before submission.";
        }

        if (!hasGpsGranted(draft)) {
            return "GPS must be enabled and granted before submission.";
        }

        if (!hasRealGeo(draft)) {
            return "GPS coordinate not saved yet. Please capture location before submitting.";
        }

        if (reflectionQuality.isSubmissionBlocked) {
            return "Please improve your reflection before submitting. It may be empty, too short, or contain inappropriate language.";
        }

        if (!isFiniteNumber(rating) || rating < 1 || rating > 5) {
            return "Rating must be between 1 and 5.";
        }

        if (bestMovementScore(draft) == null) {
            return "No movement score recorded. Please run at least one vibration measurement.";
        }

        return null;
    }

    async function onAttachVideoPick() {
        try {
            setAttaching(true);
            const picked = await pickVideoFromLibrary();
            if (!picked) return;

            setActivity4SessionVideo(runId, {uri: picked.uri, createdAt: Date.now()});
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

            setActivity4SessionVideo(runId, {uri: recorded.uri, createdAt: Date.now()});
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
                    setActivity4SessionVideo(runId, undefined);
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

        const err = validate();
        if (err) {
            Alert.alert("Cannot submit", err, [
                err.toLowerCase().includes("coordinate") || err.toLowerCase().includes("gps")
                    ? {
                        text: "Capture Location",
                        onPress: () => navigation.navigate("A4SessionSetup", {activityId, runId}),
                    }
                    : err.toLowerCase().includes("measure")
                        ? {
                            text: "Go to Measurements",
                            onPress: () => navigation.navigate("A4Measurements", {activityId, runId}),
                        }
                        : err.toLowerCase().includes("prediction")
                            ? {
                                text: "Go to Prediction",
                                onPress: () => navigation.navigate("A4Prediction", {activityId, runId}),
                            }
                            : {text: "OK"},
            ]);
            return;
        }

        try {
            setSubmitting(true);

            const updated = setActivity4Reflection(runId, {
                reflectionText: reflectionText.trim(),
                rating,
            });

            setDraft(updated);

            const userSnap = await getDoc(doc(db, "users", user.uid));
            const teamId = userSnap.data()?.teamId;

            if (!isNonEmptyString(teamId)) {
                Alert.alert("Join a team", "You must join a team before submitting.");
                return;
            }

            const res = await submitActivity4({
                run: updated,
                teamId,
                createdBy: user.uid,
                reflection: updated.reflection?.reflectionText ?? reflectionText.trim(),
                rating: updated.reflection?.rating ?? rating,
            });

            clearActivity4RunDraft(runId);

            Alert.alert("Submitted ✅", `Your score: ${res.score} (lower is better)`, [
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
        } catch (error: unknown) {
            try {
                const updated = setActivity4Reflection(runId, {
                    reflectionText: reflectionText.trim(),
                    rating,
                });

                const userSnap = await getDoc(doc(db, "users", user.uid));
                const teamId = userSnap.data()?.teamId;

                if (!isNonEmptyString(teamId)) {
                    Alert.alert("Error", getErrorMessage(error));
                    return;
                }

                await queueFinalSubmission({
                    runId: updated.runId,
                    activityId: "activity04_earthquake",
                    userId: user.uid,
                    teamId,
                    payload: {
                        activityNumber: 4,
                        args: {
                            run: updated,
                            teamId,
                            createdBy: user.uid,
                            reflection: updated.reflection?.reflectionText ?? reflectionText.trim(),
                            rating: updated.reflection?.rating ?? rating,
                        },
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

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Reflection & Submit</Text>
                <Text style={styles.sub}>
                    Lower movement score means stronger vibration resistance. Review your evidence, write a meaningful
                    reflection, and submit.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Best Movement Score</Text>
                    <Text style={styles.scoreText}>
                        {viewModel.bestScore == null ? "—" : viewModel.bestScore.toFixed(3)}
                    </Text>
                    <Text style={styles.help}>
                        This is the score used for the leaderboard. Lower is better.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Submission Checklist</Text>

                    <View style={{marginTop: 10, gap: 10}}>
                        <ChecklistRow label="Prediction completed" ok={viewModel.predictionOk}/>
                        <ChecklistRow
                            label="Measured designs (min 3)"
                            ok={viewModel.distinctDesignsMeasured >= 3}
                            meta={`${viewModel.distinctDesignsMeasured} measured`}
                        />
                        <ChecklistRow
                            label="Sensor measurements"
                            ok={viewModel.measurementCount > 0}
                            meta={`${viewModel.measurementCount} captured`}
                        />
                        <ChecklistRow
                            label="Session video (optional)"
                            ok={viewModel.sessionVid}
                            meta={viewModel.sessionVid ? "Attached ✅" : "Not attached (OK)"}
                        />
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
                    </View>

                    <View style={styles.badgeRow}>
                        <Text style={styles.badgeLabel}>Saved coordinate</Text>
                        <View style={[styles.badge, viewModel.geoCaptured ? styles.badgeYes : styles.badgeNo]}>
                            <Text style={styles.badgeText}>{viewModel.geoText}</Text>
                        </View>
                    </View>

                    {viewModel.gpsGranted && !viewModel.geoCaptured ? (
                        <Pressable
                            style={[styles.secondaryBtn, {marginTop: 12}]}
                            onPress={() => navigation.navigate("A4SessionSetup", {activityId, runId})}
                        >
                            <Text style={styles.secondaryBtnText}>Capture Location</Text>
                        </Pressable>
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
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Reflection</Text>

                    <View style={styles.smartBox}>
                        <Text style={styles.smartTitle}>Smart reflection guide</Text>
                        <Text style={styles.smartText}>{smartReflectionSummary}</Text>
                        <Text style={styles.smartText}>Try to include:</Text>
                        <Text style={styles.promptText}>• Which structure reduced movement the most and why.</Text>
                        <Text style={styles.promptText}>• Whether your prediction matched the accelerometer
                            result.</Text>
                        <Text style={styles.promptText}>• How shape, base width, height, or material affected
                            stability.</Text>
                        <Text style={styles.promptText}>• One design improvement you would test next.</Text>
                    </View>

                    <Text style={styles.label}>Your reflection</Text>
                    <TextInput
                        value={reflectionText}
                        onChangeText={setReflectionText}
                        placeholder="Example: Design 2 had the lowest movement score because its wider base made it more stable during vibration..."
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
    container: {flexGrow: 1, padding: 20},
    center: {flex: 1, alignItems: "center", justifyContent: "center"},

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