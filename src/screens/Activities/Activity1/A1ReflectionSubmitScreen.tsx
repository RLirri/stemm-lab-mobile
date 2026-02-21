import React, {useEffect, useMemo, useState} from "react";
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth, db} from "../../../services/firebase";
import {getRunDraft, type ActivityRunDraft} from "../../../store/activityRunDraftStore";
import {submitActivity1} from "../../../services/activitySubmissionService";
import {doc, getDoc} from "firebase/firestore";

type Props = NativeStackScreenProps<AppStackParamList, "A1ReflectionSubmit">;

function attemptLabel(index: number) {
    return index === 0 ? "Baseline" : `Prototype ${index}`;
}

function hasAttemptData(run: ActivityRunDraft, i: number) {
    const a = run.attempts?.[i];
    return Boolean(a?.measurements?.tHitSec && (a.measurements.tHitSec ?? 0) > 0);
}

function hasAttemptVideo(run: ActivityRunDraft, i: number) {
    const uri = run.attempts?.[i]?.video?.uri;
    return typeof uri === "string" && uri.length > 0;
}

function clampInt(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(n)));
}

export default function A1ReflectionSubmitScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);

    const [bestIndex, setBestIndex] = useState<number | null>(null);
    const [reflection, setReflection] = useState<string>("");
    const [rating, setRating] = useState<number>(4);

    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!user) return;

        const d = getRunDraft(runId);
        if (!d) {
            Alert.alert("Session expired", "Your draft session was reset. Please start again.", [
                {text: "OK", onPress: () => navigation.replace("A1SessionSetup", {activityId})},
            ]);
            return;
        }
        setDraft(d);
    }, [activityId, navigation, runId, user]);

    const completedWithin20 = useMemo(() => {
        if (!draft) return null;
        const s = draft.session;
        if (!s.startedAt || !s.endsAt) return null;
        return Date.now() <= s.endsAt;
    }, [draft]);

    const options = useMemo(() => {
        if (!draft) return [];
        return [0, 1, 2, 3].map((i) => {
            const a = draft.attempts?.[i];
            const enabled = hasAttemptData(draft, i);
            const hasVid = hasAttemptVideo(draft, i);

            const tHit = a?.measurements?.tHitSec;
            const inZone = a?.measurements?.inTargetZone;

            const metaParts: string[] = [];
            if (typeof tHit === "number") metaParts.push(`t_hit ${tHit.toFixed(2)}s`);
            if (typeof inZone === "boolean") metaParts.push(inZone ? "in-zone" : "out-of-zone");
            metaParts.push(hasVid ? "video ✅" : "video ❌");

            return {
                index: i,
                label: `${attemptLabel(i)}${i === 0 ? " (No parachute)" : ""}`,
                enabled,
                meta: metaParts.length ? metaParts.join(" • ") : enabled ? "Completed" : "Not completed",
                hasVid,
            };
        });
    }, [draft]);

    function validate(): string | null {
        if (!draft) return "Draft not loaded.";

        const anyAttempt = [0, 1, 2, 3].some((i) => hasAttemptData(draft, i));
        if (!anyAttempt) return "No attempts found. Please complete at least the baseline attempt.";

        if (bestIndex == null) return "Please select the best design (Baseline / Prototype).";
        if (!hasAttemptData(draft, bestIndex)) return "Selected best design has no recorded t_hit.";

        // Evidence required (production: enforce video evidence for best attempt)
        if (!hasAttemptVideo(draft, bestIndex)) {
            return "Best attempt must have a video attached. Go back to Measurements and attach a video.";
        }

        const text = reflection.trim();
        if (text.length < 20) return "Reflection is too short. Please write at least 1–2 meaningful sentences.";

        if (rating < 1 || rating > 5) return "Rating must be between 1 and 5.";
        return null;
    }

    async function onSubmit() {
        if (!user) return;
        if (!draft) return;
        if (bestIndex == null) return;

        const err = validate();
        if (err) {
            Alert.alert("Cannot submit", err, [
                err.includes("video attached")
                    ? {
                        text: "Go attach video",
                        onPress: () =>
                            navigation.navigate("A1Measurements", {
                                activityId,
                                runId,
                                attemptIndex: bestIndex,
                            }),
                    }
                    : {text: "OK"},
            ]);
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

            const res = await submitActivity1({
                run: draft,
                teamId,
                createdBy: user.uid,
                bestAttemptIndex: bestIndex,
                reflection,
                rating,
            });

            Alert.alert(
                "Submitted ✅",
                `Your score for this submission: ${res.score}`,
                [
                    {
                        text: "View Leaderboard",
                        onPress: () =>
                            navigation.reset({
                                index: 1,
                                routes: [
                                    {name: "Home" as never},
                                    {name: "Leaderboard" as never},
                                ],
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
        } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Submission failed.");
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
            <Text style={styles.sub}>Choose best attempt, attach evidence, reflect, and submit.</Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Select Best Design</Text>
                <Text style={styles.help}>Attempts require t_hit. Best attempt must also have video evidence.</Text>

                <View style={{marginTop: 10, gap: 10}}>
                    {options.map((o) => {
                        const selected = bestIndex === o.index;
                        const disabled = !o.enabled;

                        return (
                            <Pressable
                                key={o.index}
                                onPress={() => (!disabled ? setBestIndex(o.index) : undefined)}
                                style={[styles.choiceCard, selected && styles.choiceCardOn, disabled && {opacity: 0.45}]}
                                disabled={disabled}
                            >
                                <Text style={[styles.choiceTitle, selected && styles.choiceTitleOn]}>{o.label}</Text>
                                <Text style={[styles.choiceMeta, selected && styles.choiceMetaOn]}>{o.meta}</Text>
                            </Pressable>
                        );
                    })}
                </View>

                {completedWithin20 != null ? (
                    <View style={styles.badgeRow}>
                        <Text style={styles.badgeLabel}>Completed within 20 minutes?</Text>
                        <View style={[styles.badge, completedWithin20 ? styles.badgeYes : styles.badgeNo]}>
                            <Text style={styles.badgeText}>{completedWithin20 ? "Yes" : "No"}</Text>
                        </View>
                    </View>
                ) : (
                    <Text style={styles.note}>Timer wasn’t started, so “within 20 minutes” isn’t recorded.</Text>
                )}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Reflection</Text>

                <View style={styles.promptBox}>
                    <Text style={styles.promptTitle}>Prompts</Text>
                    <Text style={styles.promptText}>• Which design was best and why?</Text>
                    <Text style={styles.promptText}>• Were you correct in your prediction?</Text>
                    <Text style={styles.promptText}>• What would you improve next?</Text>
                </View>

                <Text style={styles.label}>Outcome comment</Text>
                <TextInput
                    value={reflection}
                    onChangeText={setReflection}
                    placeholder="Write your reflection here..."
                    style={[styles.input, {height: 140, textAlignVertical: "top"}]}
                    multiline
                />
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Rating</Text>
                <Text style={styles.help}>How did this activity feel overall? (1–5)</Text>

                <View style={styles.ratingRow}>
                    {[1, 2, 3, 4, 5].map((n) => {
                        const on = rating === n;
                        return (
                            <Pressable key={n} onPress={() => setRating(clampInt(n, 1, 5))}
                                       style={[styles.rateBtn, on && styles.rateBtnOn]}>
                                <Text style={[styles.rateText, on && styles.rateTextOn]}>{n}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>

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
    note: {marginTop: 10, opacity: 0.75, lineHeight: 18},

    choiceCard: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },
    choiceCardOn: {backgroundColor: "#111", borderColor: "#111"},
    choiceTitle: {fontWeight: "900", fontSize: 14, opacity: 0.9},
    choiceTitleOn: {color: "white", opacity: 1},
    choiceMeta: {marginTop: 6, opacity: 0.75},
    choiceMetaOn: {color: "white", opacity: 0.85},

    badgeRow: {marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between"},
    badgeLabel: {fontWeight: "800", opacity: 0.9},
    badge: {borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10},
    badgeYes: {backgroundColor: "#111"},
    badgeNo: {backgroundColor: "#777"},
    badgeText: {color: "white", fontWeight: "900"},

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
});