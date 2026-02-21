// src/screens/Activities/Activity1/A1AttemptPlanScreen.tsx
import React, {useEffect, useMemo, useState} from "react";
import {
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

import type {AppStackParamList} from "../../../navigation/AppStack";
import {auth} from "../../../services/firebase";
import {
    getRunDraft,
    updateAttempt,
    type ActivityRunDraft,
    type AttemptDraft,
    type AttemptPlanDraft,
    type SessionDraft,
} from "../../../store/activityRunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A1AttemptPlan">;

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
    key: "height" | "mass";
    message: string;
};

function attemptLabel(index: number) {
    if (index === 0) return "Baseline (No parachute)";
    return `Prototype ${index}`;
}

export default function A1AttemptPlanScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId, runId, attemptIndex} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);
    const [attempt, setAttempt] = useState<AttemptDraft | null>(null);

    // Form fields
    const [predictionRaw, setPredictionRaw] = useState<string>("");

    const [canopyMaterial, setCanopyMaterial] =
        useState<AttemptPlanDraft["designTags"] extends infer T ? (T extends object ? any : any) : any>(
            undefined
        );
    const [canopyShape, setCanopyShape] = useState<any>(undefined);
    const [stringsCountRaw, setStringsCountRaw] = useState<string>("");
    const [canopySizeRaw, setCanopySizeRaw] = useState<string>("");
    const [stringLengthRaw, setStringLengthRaw] = useState<string>("");
    const [designNotes, setDesignNotes] = useState<string>("");

    const [dropHeightRaw, setDropHeightRaw] = useState<string>("");
    const [massUnknown, setMassUnknown] = useState<boolean>(false);
    const [payloadMassRaw, setPayloadMassRaw] = useState<string>("");

    // “warning confirmations” gating when height/mass differs from baseline.
    const [pendingConfirm, setPendingConfirm] = useState<ConfirmGate | null>(null);
    const [confirmed, setConfirmed] = useState<{ height: boolean; mass: boolean }>({
        height: false,
        mass: false,
    });

    useEffect(() => {
        if (!user) return;

        const d = getRunDraft(runId);
        if (!d) {
            // If the store got reset, send them back to setup where we recreate.
            Alert.alert("Session expired", "Your draft session was reset. Please start again.", [
                {
                    text: "OK",
                    onPress: () => navigation.replace("A1SessionSetup", {activityId}),
                },
            ]);
            return;
        }

        const a = d.attempts?.[attemptIndex];
        if (!a) {
            Alert.alert("Attempt missing", "This attempt slot does not exist.", [
                {text: "OK", onPress: () => navigation.goBack()},
            ]);
            return;
        }

        setDraft(d);
        setAttempt(a);
    }, [activityId, attemptIndex, navigation, runId, user]);

    useEffect(() => {
        if (!draft || !attempt) return;

        const s = draft.session;

        // Prefill per-attempt parameters from attempt.plan if exists, else from session.
        const plan = attempt.plan;

        setPredictionRaw(plan.predictionSec != null ? String(plan.predictionSec) : "");

        const tags = plan.designTags ?? {};
        setCanopyMaterial(tags.canopyMaterial);
        setCanopyShape(tags.canopyShape);
        setStringsCountRaw(tags.stringsCount != null ? String(tags.stringsCount) : "");
        setCanopySizeRaw(tags.canopySizeCm != null ? String(tags.canopySizeCm) : "");
        setStringLengthRaw(tags.stringLengthCm != null ? String(tags.stringLengthCm) : "");
        setDesignNotes(tags.notes ?? "");

        const dropH = plan.dropHeightM ?? s.dropHeightM;
        setDropHeightRaw(dropH != null ? String(dropH) : "");

        const massU = plan.payloadMassUnknown ?? s.payloadMassUnknown ?? false;
        setMassUnknown(Boolean(massU));

        const m = plan.payloadMassG ?? s.payloadMassG;
        setPayloadMassRaw(m != null ? String(m) : "");
    }, [attempt, draft]);

    const baselineRefs = useMemo(() => {
        if (!draft) return null;
        const base = draft.attempts?.[0];
        const session = draft.session;

        // baseline reference: prefer baseline plan values, fallback to session values.
        const baseHeight = base?.plan?.dropHeightM ?? session.dropHeightM;
        const baseMassUnknown = base?.plan?.payloadMassUnknown ?? session.payloadMassUnknown ?? false;
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

    function buildPlanFromForm(session: SessionDraft, existingPlan: AttemptPlanDraft): AttemptPlanDraft {
        const predictionSec = toNumberOrUndefined(predictionRaw);
        const dropHeightM = toNumberOrUndefined(dropHeightRaw);

        const payloadMassG = massUnknown ? undefined : toNumberOrUndefined(payloadMassRaw);

        const designTags = isBaseline
            ? undefined
            : {
                canopyMaterial: canopyMaterial,
                canopyShape: canopyShape,
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
            attemptType: isBaseline ? "baseline" : "prototype",
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
            return "Drop Height (m) is required and must be > 0.";
        }

        // session setup said you can "measure later" BUT must be filled before attempt saved.
        // So here we enforce.
        if (!massUnknown) {
            const massG = toNumberOrUndefined(payloadMassRaw);
            if (massG == null || massG <= 0) {
                return "Payload Mass (g) is required unless you set it as Unknown.";
            }
        }

        if (!isBaseline) {
            // For prototypes, encourage at least one design descriptor (material/shape/notes)
            const anyTag =
                Boolean(canopyMaterial) ||
                Boolean(canopyShape) ||
                Boolean(designNotes.trim()) ||
                Boolean(stringsCountRaw.trim()) ||
                Boolean(canopySizeRaw.trim()) ||
                Boolean(stringLengthRaw.trim());

            if (!anyTag) {
                return "Please add at least one prototype design detail (material/shape/size/notes).";
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
                    key: "height",
                    message:
                        "Height changed; comparisons may be unfair. Please confirm you still want to continue.",
                });
            }
        }

        const curMassG = massUnknown ? undefined : toNumberOrUndefined(payloadMassRaw);
        const baseMassUnknown = baselineRefs.baseMassUnknown;
        const baseMassG = baselineRefs.baseMassG;

        if (!isBaseline) {
            // Only gate if both are known numeric masses
            if (!massUnknown && !baseMassUnknown && curMassG != null && baseMassG != null && baseMassG > 0) {
                const diff = pctDiff(curMassG, baseMassG);
                if (diff > 0.1 && !confirmed.mass) {
                    gates.push({
                        key: "mass",
                        message:
                            "Payload changed; speed/force comparison changes. Please confirm you still want to continue.",
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

        // After confirming, try continue again automatically.
        // We call onRecordVideo via a microtask so state updates apply.
        queueMicrotask(() => onRecordVideo());
    }

    function onRecordVideo() {
        if (!user) return;
        if (!draft || !attempt) return;

        const err = validateRequired(draft.session);
        if (err) {
            Alert.alert("Check fields", err);
            return;
        }

        const gates = computeConfirmGates();
        const opened = openNextConfirmIfNeeded(gates);
        if (opened) return;

        // Persist plan
        const nextPlan = buildPlanFromForm(draft.session, attempt.plan);
        persistAttemptPlan(nextPlan);

        // v1: we haven’t implemented camera screen yet, so route directly to Measurements.
        // Next step: A1RecordVideo screen (you asked "metadata only for now"; we’ll add later if you want).
        navigation.navigate("A1Measurements", {activityId, runId, attemptIndex});
    }

    if (!user) return null;

    if (!draft || !attempt) {
        return (
            <View style={styles.center}>
                <Text style={{fontWeight: "900"}}>Loading draft...</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{attemptLabel(attemptIndex)}</Text>
                <Text style={styles.sub}>
                    Plan this attempt before recording. Keep height and payload consistent for fair comparison.
                </Text>

                {/* Confirm modal-like card (simple, no extra deps) */}
                {pendingConfirm ? (
                    <View style={styles.confirmCard}>
                        <Text style={styles.confirmTitle}>Confirmation needed</Text>
                        <Text style={styles.confirmBody}>{pendingConfirm.message}</Text>
                        <View style={{flexDirection: "row", gap: 10, marginTop: 12}}>
                            <Pressable
                                style={[styles.secondaryBtn, {flex: 1}]}
                                onPress={() => setPendingConfirm(null)}
                            >
                                <Text style={styles.secondaryBtnText}>Cancel</Text>
                            </Pressable>
                            <Pressable style={[styles.primaryBtn, {flex: 1}]} onPress={onConfirmGateYes}>
                                <Text style={styles.primaryBtnText}>I Understand</Text>
                            </Pressable>
                        </View>
                    </View>
                ) : null}

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Prediction</Text>
                    <Text style={styles.help}>Estimate how many seconds until first ground contact.</Text>

                    <Text style={styles.label}>Prediction (seconds)</Text>
                    <TextInput
                        value={predictionRaw}
                        onChangeText={setPredictionRaw}
                        placeholder="e.g. 1.2"
                        keyboardType="decimal-pad"
                        style={styles.input}
                    />
                </View>

                {!isBaseline ? (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Prototype Design</Text>
                        <Text style={styles.help}>
                            Choose a few tags and/or write notes. This helps your comparison dashboard later.
                        </Text>

                        <Text style={styles.label}>Canopy material</Text>
                        <View style={styles.segment}>
                            {(["paper", "plastic", "fabric", "other"] as const).map((v) => (
                                <Pressable
                                    key={v}
                                    style={[styles.segmentBtn, canopyMaterial === v && styles.segmentBtnActive]}
                                    onPress={() => setCanopyMaterial(v)}
                                >
                                    <Text
                                        style={[styles.segmentText, canopyMaterial === v && styles.segmentTextActive]}>
                                        {v}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        <Text style={[styles.label, {marginTop: 12}]}>Canopy shape</Text>
                        <View style={styles.segment}>
                            {(["circle", "square", "other"] as const).map((v) => (
                                <Pressable
                                    key={v}
                                    style={[styles.segmentBtn, canopyShape === v && styles.segmentBtnActive]}
                                    onPress={() => setCanopyShape(v)}
                                >
                                    <Text style={[styles.segmentText, canopyShape === v && styles.segmentTextActive]}>
                                        {v}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        <View style={{flexDirection: "row", gap: 10}}>
                            <View style={{flex: 1}}>
                                <Text style={styles.label}>Strings count</Text>
                                <TextInput
                                    value={stringsCountRaw}
                                    onChangeText={setStringsCountRaw}
                                    placeholder="e.g. 4"
                                    keyboardType="number-pad"
                                    style={styles.input}
                                />
                            </View>
                            <View style={{flex: 1}}>
                                <Text style={styles.label}>String length (cm)</Text>
                                <TextInput
                                    value={stringLengthRaw}
                                    onChangeText={setStringLengthRaw}
                                    placeholder="e.g. 20"
                                    keyboardType="decimal-pad"
                                    style={styles.input}
                                />
                            </View>
                        </View>

                        <Text style={styles.label}>Canopy diameter / side length (cm)</Text>
                        <TextInput
                            value={canopySizeRaw}
                            onChangeText={setCanopySizeRaw}
                            placeholder="e.g. 25"
                            keyboardType="decimal-pad"
                            style={styles.input}
                        />

                        <Text style={styles.label}>Notes</Text>
                        <TextInput
                            value={designNotes}
                            onChangeText={setDesignNotes}
                            placeholder="What changed and why?"
                            style={[styles.input, {height: 90, textAlignVertical: "top"}]}
                            multiline
                        />

                        <View style={styles.sketchBox}>
                            <Text style={{fontWeight: "900"}}>Sketch upload (photo)</Text>
                            <Text style={{marginTop: 6, opacity: 0.75, lineHeight: 18}}>
                                v1: we’ll add camera/gallery picker later. For now, keep your sketch photo ready.
                            </Text>
                        </View>
                    </View>
                ) : (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>Attempt Type</Text>
                        <Text style={styles.help}>
                            Baseline is always “No parachute”. You’ll build prototypes after this.
                        </Text>
                        <View style={styles.pill}>
                            <Text style={styles.pillText}>Baseline (No parachute)</Text>
                        </View>
                    </View>
                )}

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Comparison Parameters</Text>

                    <Text style={styles.label}>Drop Height (m)</Text>
                    <TextInput
                        value={dropHeightRaw}
                        onChangeText={(t) => {
                            setDropHeightRaw(t);
                            if (!isBaseline) setConfirmed((prev) => ({...prev, height: false}));
                        }}
                        placeholder="e.g. 1.5"
                        keyboardType="decimal-pad"
                        style={styles.input}
                    />
                    {!isBaseline && baselineRefs?.baseHeight != null ? (
                        <Text style={styles.help}>Baseline reference height: {baselineRefs.baseHeight} m</Text>
                    ) : null}

                    <Text style={[styles.label, {marginTop: 12}]}>Payload Mass (g)</Text>
                    <Text style={styles.help}>If unknown, force/drag/g-force may not be computed.</Text>

                    <View style={{flexDirection: "row", gap: 10}}>
                        <View style={{flex: 1}}>
                            <TextInput
                                value={payloadMassRaw}
                                onChangeText={(t) => {
                                    setPayloadMassRaw(t);
                                    if (!isBaseline) setConfirmed((prev) => ({...prev, mass: false}));
                                }}
                                placeholder="e.g. 20"
                                keyboardType="number-pad"
                                style={[styles.input, massUnknown && {opacity: 0.5}]}
                                editable={!massUnknown}
                            />
                        </View>
                        <Pressable
                            style={[styles.toggleChip, massUnknown && styles.toggleChipOn]}
                            onPress={() => {
                                setMassUnknown((v) => {
                                    const next = !v;
                                    if (!isBaseline) setConfirmed((prev) => ({...prev, mass: false}));
                                    return next;
                                });
                            }}
                        >
                            <Text style={[styles.toggleChipText, massUnknown && styles.toggleChipTextOn]}>
                                {massUnknown ? "Unknown" : "Known"}
                            </Text>
                        </Pressable>
                    </View>

                    {!isBaseline && !massUnknown && baselineRefs?.baseMassG != null && !baselineRefs.baseMassUnknown ? (
                        <Text style={styles.help}>Baseline reference mass: {baselineRefs.baseMassG} g</Text>
                    ) : null}
                </View>

                <Pressable style={styles.primaryBtn} onPress={onRecordVideo}>
                    <Text style={styles.primaryBtnText}>Record Drop Video</Text>
                </Pressable>

                <Text style={styles.footerHint}>
                    Next: video capture (v1 placeholder) → measurements → results. You can add up to 3 prototypes.
                </Text>

                <View style={{height: 30}}/>
            </ScrollView>
        </KeyboardAvoidingView>
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

    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === "ios" ? 12 : 10,
    },

    segment: {
        marginTop: 8,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    segmentBtn: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    segmentBtnActive: {backgroundColor: "#111", borderColor: "#111"},
    segmentText: {fontWeight: "800", opacity: 0.85, textTransform: "capitalize"},
    segmentTextActive: {color: "white", opacity: 1},

    pill: {
        marginTop: 10,
        alignSelf: "flex-start",
        backgroundColor: "#111",
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    pillText: {color: "white", fontWeight: "900"},

    sketchBox: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "white",
        borderRadius: 12,
        padding: 12,
    },

    toggleChip: {
        alignSelf: "stretch",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 12,
        paddingHorizontal: 12,
        backgroundColor: "white",
    },
    toggleChipOn: {backgroundColor: "#111", borderColor: "#111"},
    toggleChipText: {fontWeight: "900", opacity: 0.8},
    toggleChipTextOn: {color: "white", opacity: 1},

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    secondaryBtn: {
        marginTop: 14,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},

    confirmCard: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#111",
        backgroundColor: "#fff",
        borderRadius: 14,
        padding: 14,
    },
    confirmTitle: {fontSize: 16, fontWeight: "900"},
    confirmBody: {marginTop: 8, opacity: 0.85, lineHeight: 18},

    footerHint: {marginTop: 10, opacity: 0.7, lineHeight: 18},
});