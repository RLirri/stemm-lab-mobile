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
import {useTranslation} from "react-i18next";

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

type DesignTags = NonNullable<AttemptPlanDraft["designTags"]>;
type CanopyMaterial = DesignTags["canopyMaterial"];
type CanopyShape = DesignTags["canopyShape"];

type ConfirmGate = {
    key: "height" | "mass";
    message: string;
};

type AttemptPlanKey =
    | "subtitle"
    | "confirmationNeededTitle"
    | "confirmationUnderstand"
    | "predictionTitle"
    | "predictionHelp"
    | "predictionLabel"
    | "predictionPlaceholder"
    | "prototypeDesignTitle"
    | "prototypeDesignHelp"
    | "canopyMaterialLabel"
    | "canopyMaterialPaper"
    | "canopyMaterialPlastic"
    | "canopyMaterialFabric"
    | "canopyMaterialOther"
    | "canopyShapeLabel"
    | "canopyShapeCircle"
    | "canopyShapeSquare"
    | "canopyShapeOther"
    | "stringsCountLabel"
    | "stringsCountPlaceholder"
    | "stringLengthLabel"
    | "stringLengthPlaceholder"
    | "canopySizeLabel"
    | "canopySizePlaceholder"
    | "notesLabel"
    | "notesPlaceholder"
    | "sketchUploadTitle"
    | "sketchUploadHelp"
    | "attemptTypeTitle"
    | "attemptTypeHelp"
    | "attemptTypeBaselinePill"
    | "comparisonParametersTitle"
    | "dropHeightLabel"
    | "dropHeightPlaceholder"
    | "baselineReferenceHeight"
    | "payloadMassLabel"
    | "payloadMassHelp"
    | "payloadMassPlaceholder"
    | "massUnknown"
    | "massKnown"
    | "baselineReferenceMass"
    | "recordDropVideo"
    | "footerHint"
    | "validationDropHeight"
    | "validationPayloadMass"
    | "validationPrototypeDesign"
    | "confirmHeightChanged"
    | "confirmMassChanged";

type A1CommonKey =
    | "baselineLabel"
    | "prototypeLabel"
    | "attemptMissingTitle"
    | "attemptMissingMessage";

type ActivityCommonKey =
    | "sessionExpiredTitle"
    | "sessionExpiredMessage"
    | "checkFieldsTitle"
    | "loadingDraft";

function toNumberOrUndefined(raw: string): number | undefined {
    const value = raw.trim();
    if (!value) return undefined;

    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
}

function clampInt(n: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(n)));
}

function pctDiff(a: number, b: number): number {
    if (b === 0) return Infinity;
    return Math.abs((a - b) / b);
}

export default function A1AttemptPlanScreen({route, navigation}: Props) {
    const {t} = useTranslation(["activities", "common", "navigation"]);
    const user = auth.currentUser;
    const {activityId, runId, attemptIndex} = route.params;

    const [draft, setDraft] = useState<ActivityRunDraft | null>(null);
    const [attempt, setAttempt] = useState<AttemptDraft | null>(null);

    const [predictionRaw, setPredictionRaw] = useState<string>("");

    const [canopyMaterial, setCanopyMaterial] = useState<CanopyMaterial | undefined>(undefined);
    const [canopyShape, setCanopyShape] = useState<CanopyShape | undefined>(undefined);
    const [stringsCountRaw, setStringsCountRaw] = useState<string>("");
    const [canopySizeRaw, setCanopySizeRaw] = useState<string>("");
    const [stringLengthRaw, setStringLengthRaw] = useState<string>("");
    const [designNotes, setDesignNotes] = useState<string>("");

    const [dropHeightRaw, setDropHeightRaw] = useState<string>("");
    const [massUnknown, setMassUnknown] = useState<boolean>(false);
    const [payloadMassRaw, setPayloadMassRaw] = useState<string>("");

    const [pendingConfirm, setPendingConfirm] = useState<ConfirmGate | null>(null);
    const [confirmed, setConfirmed] = useState<{ height: boolean; mass: boolean }>({
        height: false,
        mass: false,
    });

    const isBaseline = attemptIndex === 0;

    const tA1AttemptPlan = (key: AttemptPlanKey, options?: Record<string, unknown>) =>
        t(`a1.attemptPlan.${key}`, {ns: "activities", ...options});

    const tA1Common = (key: A1CommonKey, options?: Record<string, unknown>) =>
        t(`a1.common.${key}`, {ns: "activities", ...options});

    const tActivityCommon = (key: ActivityCommonKey, options?: Record<string, unknown>) =>
        t(`common.${key}`, {ns: "activities", ...options});

    const attemptTitle =
        attemptIndex === 0
            ? tA1Common("baselineLabel")
            : tA1Common("prototypeLabel", {index: attemptIndex});

    useEffect(() => {
        if (!user) return;

        const loadedDraft = getRunDraft(runId);
        if (!loadedDraft) {
            Alert.alert(
                tActivityCommon("sessionExpiredTitle"),
                tActivityCommon("sessionExpiredMessage"),
                [
                    {
                        text: t("common:actions.ok"),
                        onPress: () => navigation.replace("A1SessionSetup", {activityId}),
                    },
                ]
            );
            return;
        }

        const loadedAttempt = loadedDraft.attempts?.[attemptIndex];
        if (!loadedAttempt) {
            Alert.alert(
                tA1Common("attemptMissingTitle"),
                tA1Common("attemptMissingMessage"),
                [{text: t("common:actions.ok"), onPress: () => navigation.goBack()}]
            );
            return;
        }

        setDraft(loadedDraft);
        setAttempt(loadedAttempt);
    }, [activityId, attemptIndex, navigation, runId, t, user]);

    useEffect(() => {
        if (!draft || !attempt) return;

        const session = draft.session;
        const plan = attempt.plan;

        setPredictionRaw(plan.predictionSec != null ? String(plan.predictionSec) : "");

        const tags = plan.designTags ?? {};
        setCanopyMaterial(tags.canopyMaterial);
        setCanopyShape(tags.canopyShape);
        setStringsCountRaw(tags.stringsCount != null ? String(tags.stringsCount) : "");
        setCanopySizeRaw(tags.canopySizeCm != null ? String(tags.canopySizeCm) : "");
        setStringLengthRaw(tags.stringLengthCm != null ? String(tags.stringLengthCm) : "");
        setDesignNotes(tags.notes ?? "");

        const dropHeightM = plan.dropHeightM ?? session.dropHeightM;
        setDropHeightRaw(dropHeightM != null ? String(dropHeightM) : "");

        const resolvedMassUnknown = plan.payloadMassUnknown ?? session.payloadMassUnknown ?? false;
        setMassUnknown(Boolean(resolvedMassUnknown));

        const payloadMassG = plan.payloadMassG ?? session.payloadMassG;
        setPayloadMassRaw(payloadMassG != null ? String(payloadMassG) : "");
    }, [attempt, draft]);

    const baselineRefs = useMemo(() => {
        if (!draft) return null;

        const baselineAttempt = draft.attempts?.[0];
        const session = draft.session;

        return {
            baseHeight: baselineAttempt?.plan?.dropHeightM ?? session.dropHeightM,
            baseMassUnknown:
                baselineAttempt?.plan?.payloadMassUnknown ?? session.payloadMassUnknown ?? false,
            baseMassG: baselineAttempt?.plan?.payloadMassG ?? session.payloadMassG,
        };
    }, [draft]);

    function persistAttemptPlan(nextPlan: AttemptPlanDraft) {
        const nextDraft = updateAttempt(runId, attemptIndex, {plan: nextPlan});
        setDraft(nextDraft);
        setAttempt(nextDraft.attempts[attemptIndex]);
    }

    function buildPlanFromForm(
        _session: SessionDraft,
        existingPlan: AttemptPlanDraft
    ): AttemptPlanDraft {
        const predictionSec = toNumberOrUndefined(predictionRaw);
        const dropHeightM = toNumberOrUndefined(dropHeightRaw);
        const payloadMassG = massUnknown ? undefined : toNumberOrUndefined(payloadMassRaw);

        const designTags: AttemptPlanDraft["designTags"] = isBaseline
            ? undefined
            : {
                canopyMaterial,
                canopyShape,
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

    function validateRequired(_session: SessionDraft): string | null {
        const dropHeightM = toNumberOrUndefined(dropHeightRaw);
        if (dropHeightM == null || dropHeightM <= 0) {
            return tA1AttemptPlan("validationDropHeight");
        }

        if (!massUnknown) {
            const massG = toNumberOrUndefined(payloadMassRaw);
            if (massG == null || massG <= 0) {
                return tA1AttemptPlan("validationPayloadMass");
            }
        }

        if (!isBaseline) {
            const hasAnyDesignDetail =
                Boolean(canopyMaterial) ||
                Boolean(canopyShape) ||
                Boolean(designNotes.trim()) ||
                Boolean(stringsCountRaw.trim()) ||
                Boolean(canopySizeRaw.trim()) ||
                Boolean(stringLengthRaw.trim());

            if (!hasAnyDesignDetail) {
                return tA1AttemptPlan("validationPrototypeDesign");
            }
        }

        return null;
    }

    function computeConfirmGates(): ConfirmGate[] {
        if (!baselineRefs) return [];

        const gates: ConfirmGate[] = [];
        const currentHeight = toNumberOrUndefined(dropHeightRaw);
        const baseHeight = baselineRefs.baseHeight;

        if (!isBaseline && currentHeight != null && baseHeight != null && baseHeight > 0) {
            const heightDiff = pctDiff(currentHeight, baseHeight);
            if (heightDiff > 0.05 && !confirmed.height) {
                gates.push({
                    key: "height",
                    message: tA1AttemptPlan("confirmHeightChanged"),
                });
            }
        }

        const currentMassG = massUnknown ? undefined : toNumberOrUndefined(payloadMassRaw);
        const {baseMassUnknown, baseMassG} = baselineRefs;

        if (!isBaseline) {
            if (
                !massUnknown &&
                !baseMassUnknown &&
                currentMassG != null &&
                baseMassG != null &&
                baseMassG > 0
            ) {
                const massDiff = pctDiff(currentMassG, baseMassG);
                if (massDiff > 0.1 && !confirmed.mass) {
                    gates.push({
                        key: "mass",
                        message: tA1AttemptPlan("confirmMassChanged"),
                    });
                }
            }
        }

        return gates;
    }

    function openNextConfirmIfNeeded(gates: ConfirmGate[]): boolean {
        const nextGate = gates[0] ?? null;
        if (!nextGate) return false;
        setPendingConfirm(nextGate);
        return true;
    }

    function onConfirmGateYes() {
        if (!pendingConfirm) return;

        const gateKey = pendingConfirm.key;
        setConfirmed((prev) => ({...prev, [gateKey]: true}));
        setPendingConfirm(null);

        queueMicrotask(() => {
            onRecordVideo();
        });
    }

    function onRecordVideo() {
        if (!user || !draft || !attempt) return;

        const validationError = validateRequired(draft.session);
        if (validationError) {
            Alert.alert(tActivityCommon("checkFieldsTitle"), validationError);
            return;
        }

        const gates = computeConfirmGates();
        const didOpenConfirm = openNextConfirmIfNeeded(gates);
        if (didOpenConfirm) return;

        const nextPlan = buildPlanFromForm(draft.session, attempt.plan);
        persistAttemptPlan(nextPlan);

        navigation.navigate("A1Measurements", {activityId, runId, attemptIndex});
    }

    if (!user) return null;

    if (!draft || !attempt) {
        return (
            <View style={styles.center}>
                <Text style={styles.loadingDraftText}>{tActivityCommon("loadingDraft")}</Text>
            </View>
        );
    }

    const materialOptions: ReadonlyArray<{
        value: CanopyMaterial;
        labelKey:
            | "canopyMaterialPaper"
            | "canopyMaterialPlastic"
            | "canopyMaterialFabric"
            | "canopyMaterialOther";
    }> = [
        {value: "paper", labelKey: "canopyMaterialPaper"},
        {value: "plastic", labelKey: "canopyMaterialPlastic"},
        {value: "fabric", labelKey: "canopyMaterialFabric"},
        {value: "other", labelKey: "canopyMaterialOther"},
    ];

    const shapeOptions: ReadonlyArray<{
        value: CanopyShape;
        labelKey:
            | "canopyShapeCircle"
            | "canopyShapeSquare"
            | "canopyShapeOther";
    }> = [
        {value: "circle", labelKey: "canopyShapeCircle"},
        {value: "square", labelKey: "canopyShapeSquare"},
        {value: "other", labelKey: "canopyShapeOther"},
    ];

    return (
        <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>{attemptTitle}</Text>
                <Text style={styles.sub}>{tA1AttemptPlan("subtitle")}</Text>

                {pendingConfirm ? (
                    <View style={styles.confirmCard}>
                        <Text style={styles.confirmTitle}>{tA1AttemptPlan("confirmationNeededTitle")}</Text>
                        <Text style={styles.confirmBody}>{pendingConfirm.message}</Text>

                        <View style={styles.confirmActionsRow}>
                            <Pressable
                                style={[styles.secondaryBtn, styles.confirmAction]}
                                onPress={() => setPendingConfirm(null)}
                            >
                                <Text style={styles.secondaryBtnText}>{t("common:actions.cancel")}</Text>
                            </Pressable>

                            <Pressable
                                style={[styles.primaryBtn, styles.confirmAction]}
                                onPress={onConfirmGateYes}
                            >
                                <Text style={styles.primaryBtnText}>
                                    {tA1AttemptPlan("confirmationUnderstand")}
                                </Text>
                            </Pressable>
                        </View>
                    </View>
                ) : null}

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{tA1AttemptPlan("predictionTitle")}</Text>
                    <Text style={styles.help}>{tA1AttemptPlan("predictionHelp")}</Text>

                    <Text style={styles.label}>{tA1AttemptPlan("predictionLabel")}</Text>
                    <TextInput
                        value={predictionRaw}
                        onChangeText={setPredictionRaw}
                        placeholder={tA1AttemptPlan("predictionPlaceholder")}
                        keyboardType="decimal-pad"
                        style={styles.input}
                    />
                </View>

                {!isBaseline ? (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>{tA1AttemptPlan("prototypeDesignTitle")}</Text>
                        <Text style={styles.help}>{tA1AttemptPlan("prototypeDesignHelp")}</Text>

                        <Text style={styles.label}>{tA1AttemptPlan("canopyMaterialLabel")}</Text>
                        <View style={styles.segment}>
                            {materialOptions.map((option) => (
                                <Pressable
                                    key={option.value}
                                    style={[
                                        styles.segmentBtn,
                                        canopyMaterial === option.value && styles.segmentBtnActive,
                                    ]}
                                    onPress={() => setCanopyMaterial(option.value)}
                                >
                                    <Text
                                        style={[
                                            styles.segmentText,
                                            canopyMaterial === option.value && styles.segmentTextActive,
                                        ]}
                                    >
                                        {tA1AttemptPlan(option.labelKey)}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        <Text style={[styles.label, styles.labelSpacing]}>
                            {tA1AttemptPlan("canopyShapeLabel")}
                        </Text>
                        <View style={styles.segment}>
                            {shapeOptions.map((option) => (
                                <Pressable
                                    key={option.value}
                                    style={[
                                        styles.segmentBtn,
                                        canopyShape === option.value && styles.segmentBtnActive,
                                    ]}
                                    onPress={() => setCanopyShape(option.value)}
                                >
                                    <Text
                                        style={[
                                            styles.segmentText,
                                            canopyShape === option.value && styles.segmentTextActive,
                                        ]}
                                    >
                                        {tA1AttemptPlan(option.labelKey)}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>

                        <View style={styles.twoColRow}>
                            <View style={styles.flexOne}>
                                <Text style={styles.label}>{tA1AttemptPlan("stringsCountLabel")}</Text>
                                <TextInput
                                    value={stringsCountRaw}
                                    onChangeText={setStringsCountRaw}
                                    placeholder={tA1AttemptPlan("stringsCountPlaceholder")}
                                    keyboardType="number-pad"
                                    style={styles.input}
                                />
                            </View>

                            <View style={styles.flexOne}>
                                <Text style={styles.label}>{tA1AttemptPlan("stringLengthLabel")}</Text>
                                <TextInput
                                    value={stringLengthRaw}
                                    onChangeText={setStringLengthRaw}
                                    placeholder={tA1AttemptPlan("stringLengthPlaceholder")}
                                    keyboardType="decimal-pad"
                                    style={styles.input}
                                />
                            </View>
                        </View>

                        <Text style={styles.label}>{tA1AttemptPlan("canopySizeLabel")}</Text>
                        <TextInput
                            value={canopySizeRaw}
                            onChangeText={setCanopySizeRaw}
                            placeholder={tA1AttemptPlan("canopySizePlaceholder")}
                            keyboardType="decimal-pad"
                            style={styles.input}
                        />

                        <Text style={styles.label}>{tA1AttemptPlan("notesLabel")}</Text>
                        <TextInput
                            value={designNotes}
                            onChangeText={setDesignNotes}
                            placeholder={tA1AttemptPlan("notesPlaceholder")}
                            style={[styles.input, styles.notesInput]}
                            multiline
                        />

                        <View style={styles.sketchBox}>
                            <Text style={styles.sketchTitle}>{tA1AttemptPlan("sketchUploadTitle")}</Text>
                            <Text style={styles.sketchHelp}>{tA1AttemptPlan("sketchUploadHelp")}</Text>
                        </View>
                    </View>
                ) : (
                    <View style={styles.card}>
                        <Text style={styles.cardTitle}>{tA1AttemptPlan("attemptTypeTitle")}</Text>
                        <Text style={styles.help}>{tA1AttemptPlan("attemptTypeHelp")}</Text>
                        <View style={styles.pill}>
                            <Text style={styles.pillText}>{tA1AttemptPlan("attemptTypeBaselinePill")}</Text>
                        </View>
                    </View>
                )}

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{tA1AttemptPlan("comparisonParametersTitle")}</Text>

                    <Text style={styles.label}>{tA1AttemptPlan("dropHeightLabel")}</Text>
                    <TextInput
                        value={dropHeightRaw}
                        onChangeText={(text) => {
                            setDropHeightRaw(text);
                            if (!isBaseline) {
                                setConfirmed((prev) => ({...prev, height: false}));
                            }
                        }}
                        placeholder={tA1AttemptPlan("dropHeightPlaceholder")}
                        keyboardType="decimal-pad"
                        style={styles.input}
                    />
                    {!isBaseline && baselineRefs?.baseHeight != null ? (
                        <Text style={styles.help}>
                            {tA1AttemptPlan("baselineReferenceHeight", {
                                value: baselineRefs.baseHeight,
                            })}
                        </Text>
                    ) : null}

                    <Text style={[styles.label, styles.labelSpacing]}>
                        {tA1AttemptPlan("payloadMassLabel")}
                    </Text>
                    <Text style={styles.help}>{tA1AttemptPlan("payloadMassHelp")}</Text>

                    <View style={styles.twoColRow}>
                        <View style={styles.flexOne}>
                            <TextInput
                                value={payloadMassRaw}
                                onChangeText={(text) => {
                                    setPayloadMassRaw(text);
                                    if (!isBaseline) {
                                        setConfirmed((prev) => ({...prev, mass: false}));
                                    }
                                }}
                                placeholder={tA1AttemptPlan("payloadMassPlaceholder")}
                                keyboardType="number-pad"
                                style={[styles.input, massUnknown && styles.disabledInput]}
                                editable={!massUnknown}
                            />
                        </View>

                        <Pressable
                            style={[styles.toggleChip, massUnknown && styles.toggleChipOn]}
                            onPress={() => {
                                setMassUnknown((prev) => {
                                    const nextValue = !prev;
                                    if (!isBaseline) {
                                        setConfirmed((current) => ({...current, mass: false}));
                                    }
                                    return nextValue;
                                });
                            }}
                        >
                            <Text style={[styles.toggleChipText, massUnknown && styles.toggleChipTextOn]}>
                                {massUnknown
                                    ? tA1AttemptPlan("massUnknown")
                                    : tA1AttemptPlan("massKnown")}
                            </Text>
                        </Pressable>
                    </View>

                    {!isBaseline &&
                    !massUnknown &&
                    baselineRefs?.baseMassG != null &&
                    !baselineRefs.baseMassUnknown ? (
                        <Text style={styles.help}>
                            {tA1AttemptPlan("baselineReferenceMass", {
                                value: baselineRefs.baseMassG,
                            })}
                        </Text>
                    ) : null}
                </View>

                <Pressable style={styles.primaryBtn} onPress={onRecordVideo}>
                    <Text style={styles.primaryBtnText}>{tA1AttemptPlan("recordDropVideo")}</Text>
                </Pressable>

                <Text style={styles.footerHint}>{tA1AttemptPlan("footerHint")}</Text>

                <View style={styles.bottomSpacer}/>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    container: {
        flexGrow: 1,
        padding: 20,
    },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    loadingDraftText: {
        fontWeight: "900",
    },
    title: {
        fontSize: 26,
        fontWeight: "900",
        marginTop: 6,
    },
    sub: {
        marginTop: 8,
        opacity: 0.75,
        lineHeight: 18,
    },
    card: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: "900",
    },
    label: {
        marginTop: 12,
        fontWeight: "800",
    },
    labelSpacing: {
        marginTop: 12,
    },
    help: {
        marginTop: 6,
        opacity: 0.7,
        lineHeight: 18,
    },
    input: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "#fff",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === "ios" ? 12 : 10,
    },
    disabledInput: {
        opacity: 0.5,
    },
    notesInput: {
        height: 90,
        textAlignVertical: "top",
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
        backgroundColor: "#fff",
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    segmentBtnActive: {
        backgroundColor: "#111",
        borderColor: "#111",
    },
    segmentText: {
        fontWeight: "800",
        opacity: 0.85,
    },
    segmentTextActive: {
        color: "#fff",
        opacity: 1,
    },
    twoColRow: {
        flexDirection: "row",
        gap: 10,
    },
    flexOne: {
        flex: 1,
    },
    pill: {
        marginTop: 10,
        alignSelf: "flex-start",
        backgroundColor: "#111",
        borderRadius: 999,
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    pillText: {
        color: "#fff",
        fontWeight: "900",
    },
    sketchBox: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
    },
    sketchTitle: {
        fontWeight: "900",
    },
    sketchHelp: {
        marginTop: 6,
        opacity: 0.75,
        lineHeight: 18,
    },
    toggleChip: {
        alignSelf: "stretch",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 12,
        paddingHorizontal: 12,
        backgroundColor: "#fff",
    },
    toggleChipOn: {
        backgroundColor: "#111",
        borderColor: "#111",
    },
    toggleChipText: {
        fontWeight: "900",
        opacity: 0.8,
    },
    toggleChipTextOn: {
        color: "#fff",
        opacity: 1,
    },
    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {
        color: "#fff",
        fontWeight: "900",
        fontSize: 16,
    },
    secondaryBtn: {
        marginTop: 14,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText: {
        fontWeight: "900",
    },
    confirmCard: {
        marginTop: 14,
        borderWidth: 1,
        borderColor: "#111",
        backgroundColor: "#fff",
        borderRadius: 14,
        padding: 14,
    },
    confirmTitle: {
        fontSize: 16,
        fontWeight: "900",
    },
    confirmBody: {
        marginTop: 8,
        opacity: 0.85,
        lineHeight: 18,
    },
    confirmActionsRow: {
        flexDirection: "row",
        gap: 10,
        marginTop: 12,
    },
    confirmAction: {
        flex: 1,
    },
    footerHint: {
        marginTop: 10,
        opacity: 0.7,
        lineHeight: 18,
    },
    bottomSpacer: {
        height: 30,
    },
});