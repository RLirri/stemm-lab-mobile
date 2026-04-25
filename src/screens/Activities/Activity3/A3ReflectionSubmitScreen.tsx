import React, {useEffect, useMemo, useState} from "react";
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
import {doc, getDoc} from "firebase/firestore";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth, db} from "../../../services/firebase";
import {queueFinalSubmission} from "../../../services/offlineSubmissionQueueService";
import {submitActivity3} from "../../../services/activitySubmissionService";
import {ReflectionQualityCard} from "../../../components/reflection/ReflectionQualityCard";
import {checkReflectionQuality} from "../../../services/reflectionQualityService";

import {
    clearActivity3RunDraft,
    getActivity3RunDraft,
    setActivity3Reflection,
    type Activity3RunDraft,
} from "../../../store/activity3RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A3ReflectionSubmit">;

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function isNonEmptyString(x: unknown): x is string {
    return typeof x === "string" && x.trim().length > 0;
}

function hasSessionVideo(d: Activity3RunDraft) {
    return isNonEmptyString(d.evidence?.sessionVideo?.uri);
}

function countMeasurementVideos(d: Activity3RunDraft) {
    return d.measurements.reduce((acc, m) => acc + (isNonEmptyString(m.video?.uri) ? 1 : 0), 0);
}

function hasAnyMeasurement(d: Activity3RunDraft) {
    return d.measurements.length > 0;
}

function hasAnyValidAngle(d: Activity3RunDraft) {
    return d.measurements.some((m) => typeof m.bendAngleDeg === "number" && Number.isFinite(m.bendAngleDeg));
}

function hasPrediction(d: Activity3RunDraft) {
    return (
        typeof d.prediction?.predictedBestDesignIndex === "number" &&
        typeof d.prediction?.predictedBestDistanceCm === "number"
    );
}

function newestGeoText(d: Activity3RunDraft) {
    const geoRow = [...d.measurements]
        .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
        .find((m) => m.geo);

    const geo = geoRow?.geo;
    if (!geo) return "No coordinate saved yet";

    const acc = geo.accuracyM ? ` (±${Math.round(geo.accuracyM)}m)` : "";
    return `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}${acc}`;
}

function friendlyFirebaseError(error: unknown) {
    if (error instanceof Error) return error.message;
    return "Submission failed.";
}

export default function A3ReflectionSubmitScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity3RunDraft | null>(null);
    const [reflectionText, setReflectionText] = useState("");
    const [rating, setRating] = useState<number>(4);
    const [submitting, setSubmitting] = useState(false);

    const reflectionQuality = useMemo(
        () => checkReflectionQuality(reflectionText),
        [reflectionText]
    );

    useEffect(() => {
        if (!user) return;

        const d = getActivity3RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Your draft session was reset. Please start again.", [
                {text: "OK", onPress: () => navigation.replace("A3SessionSetup", {activityId})},
            ]);
            return;
        }

        setDraft(d);
        setReflectionText(d.reflection?.reflectionText ?? "");
        setRating(d.reflection?.rating ?? 4);
    }, [activityId, navigation, runId, user]);

    const evidenceVM = useMemo(() => {
        if (!draft) return null;

        const sessionVid = hasSessionVideo(draft);
        const measVidCount = countMeasurementVideos(draft);
        const gpsOk = draft.session.gpsEnabled && draft.session.gpsPermission === "granted";

        return {
            sessionVid,
            measVidCount,
            gpsOk,
            geoText: newestGeoText(draft),
        };
    }, [draft]);

    const bestMeasurement = useMemo(() => {
        if (!draft || draft.measurements.length === 0) return null;

        const valid = draft.measurements.filter(
            (m) => typeof m.bendAngleDeg === "number" && Number.isFinite(m.bendAngleDeg)
        );

        if (valid.length === 0) return null;

        return valid.reduce((best, current) => {
            const bestAngle = best.bendAngleDeg ?? 0;
            const currentAngle = current.bendAngleDeg ?? 0;
            return currentAngle > bestAngle ? current : best;
        }, valid[0]);
    }, [draft]);

    const smartReflectionSummary = useMemo(() => {
        if (!draft || !bestMeasurement) {
            return "Use your measurements to explain which fan setup produced the strongest air movement.";
        }

        const angle = bestMeasurement.bendAngleDeg;
        const angleText = typeof angle === "number" ? `${angle.toFixed(1)}°` : "the highest recorded angle";
        const distanceText =
            typeof bestMeasurement.distanceCm === "number"
                ? ` at ${bestMeasurement.distanceCm} cm`
                : "";

        const predictedDistance = draft.prediction?.predictedBestDistanceCm;
        const predictedDistanceText =
            typeof predictedDistance === "number"
                ? ` Your predicted best distance was ${predictedDistance} cm.`
                : "";

        return `Your strongest result was a bend angle of ${angleText}${distanceText}.${predictedDistanceText}`;
    }, [bestMeasurement, draft]);

    function validate(): string | null {
        if (!draft) return "Draft not found.";

        if (!hasAnyMeasurement(draft) || !hasAnyValidAngle(draft)) {
            return "No measurements found. Please record at least one bend angle before submitting.";
        }

        if (!hasPrediction(draft)) {
            return "Prediction is required before submission.";
        }

        if (reflectionQuality.isSubmissionBlocked) {
            return "Please improve your reflection before submitting. It may be empty, too short, or contain inappropriate language.";
        }

        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
            return "Rating must be between 1 and 5.";
        }

        if (!hasSessionVideo(draft)) {
            return "Session video is required before submission. Go back and attach a session video.";
        }

        if (!draft.session.gpsEnabled) return "GPS must be enabled before submission.";
        if (draft.session.gpsPermission !== "granted") return "GPS permission must be granted before submission.";

        return null;
    }

    async function fetchTeamIdOrThrow(uid: string): Promise<string> {
        const snap = await getDoc(doc(db, "users", uid));
        const teamId = snap.data()?.teamId;
        if (!teamId) throw new Error("You must join a team before submitting.");
        return teamId;
    }

    async function onSubmit() {
        if (!user) return;
        if (!draft) return;
        if (submitting) return;

        const err = validate();
        if (err) {
            const lower = err.toLowerCase();

            Alert.alert("Cannot submit", err, [
                lower.includes("session video")
                    ? {
                        text: "Go attach video",
                        onPress: () => navigation.navigate("A3SessionSetup", {activityId, runId}),
                    }
                    : lower.includes("measurements")
                        ? {
                            text: "Go to Measurements",
                            onPress: () => navigation.navigate("A3Measurements", {activityId, runId}),
                        }
                        : {text: "OK"},
            ]);
            return;
        }

        try {
            setSubmitting(true);

            const updated = setActivity3Reflection(runId, {
                reflectionText: reflectionText.trim(),
                rating,
            });
            setDraft(updated);

            const teamId = await fetchTeamIdOrThrow(user.uid);

            const res = await submitActivity3({
                run: updated,
                teamId,
                createdBy: user.uid,
                reflection: reflectionText.trim(),
                rating,
            });

            clearActivity3RunDraft(runId);

            Alert.alert("Submitted ✅", `Your score: ${res.score}`, [
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
                const teamId = await fetchTeamIdOrThrow(user.uid);

                const updated = setActivity3Reflection(runId, {
                    reflectionText: reflectionText.trim(),
                    rating,
                });

                await queueFinalSubmission({
                    runId: updated.runId,
                    activityId: "activity03_handFan",
                    userId: user.uid,
                    teamId,
                    payload: {
                        activityNumber: 3,
                        args: {
                            run: updated,
                            teamId,
                            createdBy: user.uid,
                            reflection: reflectionText.trim(),
                            rating,
                        },
                    },
                });

                Alert.alert(
                    "Saved offline",
                    "Firebase submission failed, so this finalized submission was saved locally and will sync automatically when connection is available."
                );
            } catch (queueError: unknown) {
                Alert.alert("Error", friendlyFirebaseError(queueError));
            }
        } finally {
            setSubmitting(false);
        }
    }

    if (!user) return null;

    if (!draft || !evidenceVM) {
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
                    Check evidence, write a meaningful reflection, and submit your Hand Fan Challenge result.
                </Text>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Evidence Checklist</Text>

                    <View style={{marginTop: 10, gap: 10}}>
                        <ChecklistRow label="Session video (required)" ok={evidenceVM.sessionVid}/>
                        <ChecklistRow
                            label="Measurement videos (optional, but great)"
                            ok={evidenceVM.measVidCount > 0}
                            meta={`${evidenceVM.measVidCount} attached`}
                        />
                        <ChecklistRow label="GPS enabled + granted (required)" ok={evidenceVM.gpsOk}/>
                    </View>

                    <View style={styles.badgeRow}>
                        <Text style={styles.badgeLabel}>Saved coordinate</Text>
                        <View style={[styles.badge, evidenceVM.gpsOk ? styles.badgeYes : styles.badgeNo]}>
                            <Text style={styles.badgeText}>{evidenceVM.geoText}</Text>
                        </View>
                    </View>

                    {!evidenceVM.sessionVid ? (
                        <Pressable
                            style={[styles.secondaryBtn, {marginTop: 12}]}
                            onPress={() => navigation.navigate("A3SessionSetup", {activityId, runId})}
                        >
                            <Text style={styles.secondaryBtnText}>Attach Session Video</Text>
                        </Pressable>
                    ) : null}
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Reflection</Text>

                    <View style={styles.smartBox}>
                        <Text style={styles.smartTitle}>Smart reflection guide</Text>
                        <Text style={styles.smartText}>{smartReflectionSummary}</Text>
                        <Text style={styles.smartText}>Try to include:</Text>
                        <Text style={styles.promptText}>• Which fan design bent the material the most, and why.</Text>
                        <Text style={styles.promptText}>• How distance, folds, layers, or material stiffness affected
                            airflow.</Text>
                        <Text style={styles.promptText}>• Whether your prediction matched the measured bend
                            angle.</Text>
                        <Text style={styles.promptText}>• One improvement for making the test fairer or more
                            accurate.</Text>
                    </View>

                    <Text style={styles.label}>Your reflection</Text>
                    <TextInput
                        value={reflectionText}
                        onChangeText={setReflectionText}
                        placeholder="Example: The strongest fan setup created the largest bend angle because the airflow was more focused..."
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