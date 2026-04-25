import React, {useCallback, useEffect, useMemo, useState} from "react";
import {
    ActivityIndicator,
    Alert,
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
    getActivity2RunDraft,
    updateActivity2Session,
    type Activity2RunDraft,
} from "../../../store/activity2RunDraftStore";
import {pickVideoFromLibrary, recordVideoWithCamera} from "../../../services/evidenceService";
import {submitActivity2} from "../../../services/activitySubmissionService";
import {ReflectionQualityCard} from "../../../components/reflection/ReflectionQualityCard";
import {checkReflectionQuality} from "../../../services/reflectionQualityService";

type Props = NativeStackScreenProps<AppStackParamList, "A2ReflectionSubmit">;

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Submission failed.";
}

export default function A2ReflectionSubmitScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<Activity2RunDraft | null>(null);
    const [reflection, setReflection] = useState<string>("");
    const [rating, setRating] = useState<number>(4);
    const [submitting, setSubmitting] = useState(false);
    const [attaching, setAttaching] = useState(false);

    const reflectionQuality = useMemo(
        () => checkReflectionQuality(reflection),
        [reflection]
    );

    const refreshDraft = useCallback(() => {
        const d = getActivity2RunDraft(runId);
        setDraft(d ?? null);
    }, [runId]);

    useEffect(() => {
        if (!user) return;

        const d = getActivity2RunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Your draft session was reset. Please start again.", [
                {text: "OK", onPress: () => navigation.replace("A2SessionSetup", {activityId})},
            ]);
            return;
        }

        setDraft(d);
    }, [activityId, navigation, runId, user]);

    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            refreshDraft();
        }, [refreshDraft, user])
    );

    const computed = useMemo(() => draft?.computed ?? null, [draft]);
    const validCount = useMemo(() => draft?.actions.filter((a) => a.isValid).length ?? 0, [draft]);

    const sessionVideoUri = draft?.session?.sessionVideo?.uri;
    const hasSessionVideo = typeof sessionVideoUri === "string" && sessionVideoUri.length > 0;

    const predicted = draft?.session?.predictedLoudestAction?.trim() || "—";
    const loudest = computed?.loudestActionLabel?.trim() || "—";
    const wasRight = computed?.wasPredictionCorrect;

    const smartReflectionSummary = useMemo(() => {
        const avgDbText = computed?.avgDb != null ? `${computed.avgDb.toFixed(1)} dB` : "not calculated yet";
        const resultText = `Your average sound level was ${avgDbText}.`;
        const comparisonText =
            typeof wasRight === "boolean"
                ? wasRight
                    ? `Your prediction matched the result: ${loudest} was the loudest action.`
                    : `Your prediction was ${predicted}, but the measured loudest action was ${loudest}.`
                : `Compare your predicted loudest action (${predicted}) with the actual loudest action (${loudest}).`;

        return `${resultText} ${comparisonText}`;
    }, [computed?.avgDb, loudest, predicted, wasRight]);

    function validate(): string | null {
        if (!draft) return "Draft not loaded.";

        if (validCount < 3) {
            return "You must have at least 3 valid measurements before submitting.";
        }

        if (reflectionQuality.isSubmissionBlocked) {
            return "Please improve your reflection before submitting. It may be empty, too short, or contain inappropriate language.";
        }

        if (rating < 1 || rating > 5) {
            return "Rating must be between 1 and 5.";
        }

        return null;
    }

    async function onAttachVideoPick() {
        try {
            setAttaching(true);
            const picked = await pickVideoFromLibrary();
            if (!picked) return;

            updateActivity2Session(runId, {
                sessionVideo: {
                    type: "video",
                    uri: picked.uri,
                    createdAt: Date.now(),
                },
            });

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

            updateActivity2Session(runId, {
                sessionVideo: {
                    type: "video",
                    uri: recorded.uri,
                    createdAt: Date.now(),
                },
            });

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
                    updateActivity2Session(runId, {sessionVideo: undefined});
                    refreshDraft();
                },
            },
        ]);
    }

    function onAttachVideoMenu() {
        const buttons: Array<{ text: string; onPress?: () => void; style?: "cancel" | "destructive" }> = [
            {text: "Pick from library", onPress: () => void onAttachVideoPick()},
            {text: "Record with camera", onPress: () => void onAttachVideoRecord()},
        ];

        if (hasSessionVideo) {
            buttons.push({text: "Remove attached video", style: "destructive", onPress: onRemoveVideo});
        }

        buttons.push({text: "Cancel", style: "cancel"});

        Alert.alert("Session video evidence", "Optional — attach if you have it.", buttons);
    }

    async function onSubmit() {
        if (!user) return;
        if (!draft) return;

        const err = validate();
        if (err) {
            Alert.alert("Cannot submit", err);
            return;
        }

        try {
            setSubmitting(true);

            const userSnap = await getDoc(doc(db, "users", user.uid));
            const teamId = userSnap.data()?.teamId;

            if (!teamId) {
                Alert.alert("Join a team", "You must join a team before submitting.");
                return;
            }

            const submitArgs = {
                run: draft,
                teamId,
                createdBy: user.uid,
                reflection,
                rating,
            };

            const res = await submitActivity2(submitArgs);

            Alert.alert("Submitted ✅", `Your score for this submission: ${res.score}`, [
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
                const userSnap = await getDoc(doc(db, "users", user.uid));
                const teamId = userSnap.data()?.teamId;

                if (!teamId) {
                    Alert.alert("Error", getErrorMessage(error));
                    return;
                }

                const submitArgs = {
                    run: draft,
                    teamId,
                    createdBy: user.uid,
                    reflection,
                    rating,
                };

                await queueFinalSubmission({
                    runId: draft.runId,
                    activityId: draft.activityId,
                    userId: user.uid,
                    teamId,
                    payload: {
                        activityNumber: 2,
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

    if (!draft) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10, opacity: 0.7}}>Loading draft…</Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Reflection & Submit</Text>
            <Text style={styles.sub}>
                Confirm your sound results, write a meaningful reflection, optionally attach evidence, then submit.
            </Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Session Summary</Text>

                <View style={styles.row}>
                    <Text style={styles.k}>Valid measurements</Text>
                    <Text style={styles.v}>{validCount} / 3 minimum</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Average dB (score)</Text>
                    <Text style={styles.v}>{computed?.avgDb != null ? `${computed.avgDb.toFixed(1)} dB` : "—"}</Text>
                </View>

                <View style={styles.divider}/>

                <View style={styles.row}>
                    <Text style={styles.k}>Predicted loudest</Text>
                    <Text style={styles.v}>{predicted}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Actual loudest</Text>
                    <Text style={styles.v}>{loudest}</Text>
                </View>

                <View style={styles.row}>
                    <Text style={styles.k}>Were you right?</Text>
                    <Text style={styles.v}>{typeof wasRight === "boolean" ? (wasRight ? "Yes ✅" : "No ❌") : "—"}</Text>
                </View>

                <View style={{marginTop: 12}}>
                    <Text style={styles.k}>Session video evidence (optional)</Text>
                    <Text style={styles.note}>{hasSessionVideo ? "Attached ✅" : "Not attached (OK)"}</Text>

                    <Pressable
                        style={[styles.secondaryBtn, attaching && {opacity: 0.7}]}
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
                                {hasSessionVideo ? "Manage Session Video" : "Attach Session Video"}
                            </Text>
                        )}
                    </Pressable>

                    {hasSessionVideo ? (
                        <Text style={styles.tiny}>
                            Tip: keep evidence short. Upload happens on submit; attaching here only stores local URI.
                        </Text>
                    ) : null}
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Reflection</Text>

                <View style={styles.smartBox}>
                    <Text style={styles.smartTitle}>Smart reflection guide</Text>
                    <Text style={styles.smartText}>{smartReflectionSummary}</Text>
                    <Text style={styles.smartText}>Try to include:</Text>
                    <Text style={styles.promptText}>• Whether your loudest-action prediction matched the
                        measurements.</Text>
                    <Text style={styles.promptText}>• What may have affected the sound level, such as distance, surface,
                        or background noise.</Text>
                    <Text style={styles.promptText}>• Whether the measured sound level could be uncomfortable or unsafe
                        in a classroom.</Text>
                    <Text style={styles.promptText}>• One way to improve the measurement accuracy next time.</Text>
                </View>

                <Text style={styles.label}>Outcome comment</Text>
                <TextInput
                    value={reflection}
                    onChangeText={setReflection}
                    placeholder="Example: My prediction was different from the result because the surface and distance affected the sound level..."
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
    note: {marginTop: 6, opacity: 0.8, lineHeight: 18},
    tiny: {marginTop: 8, opacity: 0.65, lineHeight: 18, fontSize: 12},

    row: {flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 12},
    k: {flex: 1, fontWeight: "800", opacity: 0.9},
    v: {fontWeight: "900"},

    divider: {height: 1, backgroundColor: "#e5e5e5", marginTop: 12},

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
        marginTop: 12,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        paddingVertical: 12,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},
});