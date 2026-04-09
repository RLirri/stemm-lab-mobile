import React, {useEffect, useMemo, useState} from "react";
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";
import {useTranslation} from "react-i18next";

import type {AppStackParamList} from "../../../navigation/AppStack";
import {getActivityById} from "../../../services/activityService";
import {SOUND_RISK_BANDS} from "../../../services/scoringService";
import type {Activity} from "../../../types/activity";

import {auth} from "../../../services/firebase";
import {createActivity2RunDraft} from "../../../store/activity2RunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "A2Overview">;

function normalizeText(x: unknown): string | undefined {
    const s = typeof x === "string" ? x.trim() : "";
    return s.length ? s : undefined;
}

function splitLines(x: string): string[] {
    return x
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);
}

function safeStringArray(x: unknown): string[] {
    if (!Array.isArray(x)) return [];
    return x
        .filter((v) => typeof v === "string" && v.trim().length)
        .map((v) => (v as string).trim());
}

function formatDbRange(minDb: number, maxDb: number | null): string {
    if (maxDb == null) return `${minDb}+ dB`;
    return `${minDb}–${maxDb} dB`;
}

export default function A2OverviewScreen({route, navigation}: Props) {
    const {t} = useTranslation(["common", "activities"]);
    const user = auth.currentUser;
    const {activityId} = route.params;

    const [activity, setActivity] = useState<Activity | null>(null);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        let mounted = true;

        async function load() {
            try {
                setLoading(true);
                const a = await getActivityById(activityId);
                if (!mounted) return;
                setActivity(a);
            } catch (e: any) {
                if (!mounted) return;
                setActivity(null);
                Alert.alert(
                    t("common:feedback.error"),
                    e?.message ?? t("activities:listLoadFailed")
                );
            } finally {
                if (!mounted) return;
                setLoading(false);
            }
        }

        void load();

        return () => {
            mounted = false;
        };
    }, [activityId, t]);

    const title = useMemo(
        () => normalizeText(activity?.title) ?? t("activities:a2.fallbackTitle"),
        [activity?.title, t]
    );

    const shortDesc = useMemo(() => {
        const a = activity as any;
        return (
            normalizeText(a?.shortDescription) ??
            t("activities:a2.fallbackShortDescription")
        );
    }, [activity, t]);

    const overview = useMemo(() => {
        const a = activity as any;
        return (
            normalizeText(a?.description) ??
            t("activities:a2.fallbackOverview")
        );
    }, [activity, t]);

    const equipment: string[] = useMemo(() => {
        const a = activity as any;
        const list = safeStringArray(a?.equipment);
        if (list.length) return list;

        return [
            t("activities:a2.equipmentFallback1"),
            t("activities:a2.equipmentFallback2"),
        ];
    }, [activity, t]);

    const instructionLines: string[] = useMemo(() => {
        const a = activity as any;
        const inst = normalizeText(a?.instructions);
        if (inst) return splitLines(inst);

        return [
            "Measure noise from different actions (drop pens/books, talking, walking, stamping).",
            "Record sound levels (dB) and locations (GPS if enabled).",
            "Map loud and quiet zones.",
            "Predict the loudest action, then check if you were correct.",
            "Submit: at least 3 valid measurements + session video evidence + reflection.",
        ];
    }, [activity]);

    async function onStart() {
        if (!user) {
            Alert.alert(
                t("common:feedback.signInRequired"),
                "Please sign in to start this activity."
            );
            return;
        }

        try {
            setStarting(true);

            const draft = createActivity2RunDraft(activityId, user.uid);
            navigation.navigate("A2SessionSetup", {activityId, runId: draft.runId});
        } catch (e: any) {
            Alert.alert(
                t("activities:detail.startFailed"),
                e?.message ?? "Unable to start Activity 2."
            );
        } finally {
            setStarting(false);
        }
    }

    function onBack() {
        navigation.goBack();
    }

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={styles.loadingText}>{t("common:states.loadingActivity")}</Text>
            </View>
        );
    }

    if (!activity) {
        return (
            <View style={styles.center}>
                <Text style={styles.errorTitle}>{t("activities:detail.notFound")}</Text>
                <Text style={styles.errorSub}>
                    This activity may be missing from Firestore or the provided activityId is invalid.
                </Text>

                <Pressable style={styles.primaryBtn} onPress={onBack}>
                    <Text style={styles.primaryBtnText}>{t("common:actions.back")}</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>{shortDesc}</Text>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>{t("activities:detail.overview")}</Text>
                <Text style={styles.help}>{overview}</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>{t("activities:detail.equipment")}</Text>
                {equipment.map((it, idx) => (
                    <Bullet key={`${it}-${idx}`} text={it}/>
                ))}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>{t("activities:detail.instructions")}</Text>
                {instructionLines.map((line, idx) => (
                    <Bullet key={`${line}-${idx}`} text={line}/>
                ))}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>{t("activities:a2.hearingRiskTitle")}</Text>
                <Text style={styles.help}>{t("activities:a2.hearingRiskHelp")}</Text>

                <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHeader]}>
                        <Text style={[styles.cell, styles.cellHeader]}>Sound Level</Text>
                        <Text style={[styles.cell, styles.cellHeader]}>Risk</Text>
                    </View>

                    {SOUND_RISK_BANDS.map((b) => (
                        <View key={`${b.minDb}-${String(b.maxDb)}`} style={styles.tableRow}>
                            <Text style={styles.cell}>{formatDbRange(b.minDb, b.maxDb)}</Text>
                            <Text style={styles.cell}>{b.label}</Text>
                        </View>
                    ))}
                </View>

                <Text style={styles.note}>{t("activities:a2.submissionPolicy")}</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>{t("activities:a2.promptsTitle")}</Text>
                <Bullet text={t("activities:a2.prompt1")}/>
                <Bullet text={t("activities:a2.prompt2")}/>
                <Bullet text={t("activities:a2.prompt3")}/>
                <Bullet text={t("activities:a2.prompt4")}/>
                <Bullet text={t("activities:a2.prompt5")}/>
            </View>

            <Pressable
                style={[styles.primaryBtn, starting && {opacity: 0.7}]}
                onPress={onStart}
                disabled={starting}
            >
                <Text style={styles.primaryBtnText}>
                    {starting ? t("common:states.starting") : t("common:actions.startActivity")}
                </Text>
            </Pressable>

            <Pressable
                style={styles.secondaryBtn}
                onPress={() =>
                    Alert.alert(
                        t("common:actions.back"),
                        "Return to the previous screen?",
                        [
                            {text: t("common:actions.cancel"), style: "cancel"},
                            {text: t("common:actions.ok"), onPress: onBack},
                        ]
                    )
                }
            >
                <Text style={styles.secondaryBtnText}>{t("common:actions.back")}</Text>
            </Pressable>

            <View style={{height: 30}}/>
        </ScrollView>
    );
}

function Bullet({text}: { text: string }) {
    return (
        <View style={styles.bulletRow}>
            <Text style={styles.bulletDot}>•</Text>
            <Text style={styles.bulletText}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20},

    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backgroundColor: "white",
    },
    loadingText: {marginTop: 10, opacity: 0.7},

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
    help: {marginTop: 8, opacity: 0.7, lineHeight: 18},

    bulletRow: {flexDirection: "row", alignItems: "flex-start", marginTop: 8, gap: 8},
    bulletDot: {fontWeight: "900", opacity: 0.85, marginTop: 1},
    bulletText: {flex: 1, fontWeight: "700", opacity: 0.9, lineHeight: 18},

    table: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "white",
    },
    tableRow: {
        flexDirection: "row",
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderTopWidth: 1,
        borderTopColor: "#f0f0f0",
    },
    tableHeader: {borderTopWidth: 0, backgroundColor: "#fafafa"},
    cell: {flex: 1, fontWeight: "800", opacity: 0.9},
    cellHeader: {fontWeight: "900", opacity: 0.85},

    note: {marginTop: 10, opacity: 0.75, lineHeight: 18},

    primaryBtn: {
        marginTop: 14,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    secondaryBtn: {
        marginTop: 10,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#e5e5e5",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    secondaryBtnText: {fontWeight: "900"},

    errorTitle: {fontSize: 16, fontWeight: "900"},
    errorSub: {marginTop: 8, opacity: 0.7, lineHeight: 18, textAlign: "center"},
});