import React, {useEffect, useMemo, useState} from "react";
import {
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    Pressable,
    Alert,
    ScrollView,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../navigation/AppStack";
import {auth} from "../../services/firebase";
import {getActivityById} from "../../services/activityService";
import type {Activity} from "../../types/activity";

import {activityCatalog} from "../../features/activities/activityCatalog";

// Activity 1 draft store
import {createRunDraft} from "../../store/activityRunDraftStore";

// Activity 2 draft store
import {createActivity2RunDraft} from "../../store/activity2RunDraftStore";

// Activity 3 draft store
import {createActivity3RunDraft} from "../../store/activity3RunDraftStore";

import {createActivity4RunDraft} from "../../store/activity4RunDraftStore";


type Props = NativeStackScreenProps<AppStackParamList, "ActivityDetail">;

/**
 * Local-only routing metadata (keeps your ActivityDoc clean).
 * activityCatalog items should include:
 *  - id
 *  - slug
 *  - startRoute
 */
type ActivityFlowMeta = {
    id: string;
    slug?: string;
    startRoute?: keyof AppStackParamList;
};

function getActivitySlug(activity: Activity | null): string | null {
    if (!activity) return null;
    const maybeSlug = (activity as unknown as { slug?: string }).slug;
    if (typeof maybeSlug === "string" && maybeSlug.trim()) return maybeSlug.trim();
    return null;
}

function isNonEmptyString(x: unknown): x is string {
    return typeof x === "string" && x.trim().length > 0;
}

export default function ActivityDetailScreen({route, navigation}: Props) {
    const user = auth.currentUser;
    const {activityId} = route.params;

    const [activity, setActivity] = useState<Activity | null>(null);
    const [loading, setLoading] = useState(true);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        let mounted = true;

        (async () => {
            try {
                const a = await getActivityById(activityId);
                if (!mounted) return;
                setActivity(a);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "Failed to load activity";
                Alert.alert("Error", msg);
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [activityId]);

    const flow = useMemo<ActivityFlowMeta | null>(() => {
        const defs = activityCatalog as unknown as ActivityFlowMeta[];

        const slug = getActivitySlug(activity);
        if (slug) {
            const bySlug = defs.find((d) => isNonEmptyString(d.slug) && d.slug === slug);
            if (bySlug) return bySlug;
        }

        // Fallback: match by deterministic id
        const byId = defs.find((d) => d.id === activityId);
        return byId ?? null;
    }, [activity, activityId]);

    const timeSpanLabel =
        activity?.timeSpanMinutes && activity.timeSpanMinutes > 0
            ? `~${activity.timeSpanMinutes} min`
            : null;

    function assertNever(_x: never): never {
        throw new Error("Unexpected route");
    }

    async function onStart() {
        if (!user) return;
        if (!activity) return;

        try {
            setStarting(true);

            const startRoute = flow?.startRoute;

            if (!startRoute) {
                Alert.alert(
                    "Not implemented",
                    "This activity flow hasn’t been implemented yet for this build."
                );
                return;
            }

            /**
             * IMPORTANT:
             * The “NAVIGATE not handled” error happens when the route name string
             * is not exactly registered in AppStack OR you navigate with wrong params.
             *
             * We keep routing strict here with a switch on known routes.
             */
            switch (startRoute) {
                /* =========================
                   Activity 1
                ========================= */
                case "A1SessionSetup": {
                    const draft = createRunDraft(activityId, user.uid);
                    navigation.navigate("A1SessionSetup", {activityId, runId: draft.runId});
                    return;
                }

                // If someone sets startRoute to later steps by mistake, still handle safely
                case "A1AttemptPlan":
                case "A1Measurements":
                case "A1Result":
                case "A1Comparison":
                case "A1ReflectionSubmit": {
                    Alert.alert(
                        "Flow misconfigured",
                        "Activity 1 must start at Session Setup. Please set startRoute to A1SessionSetup."
                    );
                    return;
                }

                /* =========================
                   Activity 2
                ========================= */

                // If you want an overview-first UX (recommended)
                case "A2Overview": {
                    // A2Overview in your current AppStack expects ONLY { activityId }.
                    // The run draft is created later (usually in A2SessionSetup) OR
                    // you can create it inside A2Overview when user taps Continue.
                    navigation.navigate("A2Overview", {activityId});
                    return;
                }

                // If you want to start directly with Session Setup
                case "A2SessionSetup": {
                    const draft = createActivity2RunDraft(activityId, user.uid);
                    navigation.navigate("A2SessionSetup", {activityId, runId: draft.runId});
                    return;
                }

                // Guard against misconfigured startRoute
                case "A2Prediction":
                case "A2Measurement":
                case "A2Map":
                case "A2Results":
                case "A2ReflectionSubmit": {
                    Alert.alert(
                        "Flow misconfigured",
                        "Activity 2 must start at Overview or Session Setup. Please set startRoute to A2Overview or A2SessionSetup."
                    );
                    return;
                }
                /* =========================
   Activity 3
========================= */

                // Recommended: overview-first UX
                case "A3Overview": {
                    navigation.navigate("A3Overview", {activityId});
                    return;
                }

                // If starting directly at Session Setup (also supported)
                case "A3SessionSetup": {
                    const draft = createActivity3RunDraft({activityId, createdBy: user.uid});
                    navigation.navigate("A3SessionSetup", {activityId, runId: draft.runId});
                    return;
                }

                // Guard against misconfigured startRoute
                case "A3Prediction":
                case "A3Measurements":
                case "A3Results":
                case "A3Comparison":
                case "A3ReflectionSubmit": {
                    Alert.alert(
                        "Flow misconfigured",
                        "Activity 3 must start at Overview or Session Setup. Please set startRoute to A3Overview or A3SessionSetup."
                    );
                    return;
                }

                /* =========================
                   App-level routes (don’t start activities here)
                ========================= */
                case "A4Overview": {
                    navigation.navigate("A4Overview", {activityId});
                    return;
                }

                case "A4SessionSetup": {
                    const draft = createActivity4RunDraft({
                        activityId,
                        createdBy: user.uid,
                        designCount: 3,
                    });
                    navigation.navigate("A4SessionSetup", {activityId, runId: draft.runId});
                    return;
                }

                case "A4Prediction":
                case "A4Measurements":
                case "A4Results":
                case "A4Comparison":
                case "A4ReflectionSubmit": {
                    Alert.alert(
                        "Flow misconfigured",
                        "Activity 4 must start at Overview or Session Setup. Please set startRoute to A4Overview or A4SessionSetup."
                    );
                    return;
                }

                /* =========================
                   App-level routes (don’t start activities here)
                ========================= */
                case "Home":
                case "Profile":
                case "TeamUp":
                case "TeamDetail":
                case "ExploreTeams":
                case "Leaderboard":
                case "Activities":
                case "ActivityDetail": {
                    Alert.alert(
                        "Flow misconfigured",
                        "startRoute must point to an activity flow screen (A1*/A2*/A3*/A4*)."
                    );
                    return;
                }

                default: {
                    // If TypeScript can’t narrow (e.g., because startRoute comes from data),
                    // keep a safe runtime message.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const r = startRoute as any;
                    Alert.alert(
                        "Unknown route",
                        `startRoute "${String(r)}" is not supported. Check your activityCatalog mapping.`
                    );
                    return;
                }
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            Alert.alert("Start failed", msg);
        } finally {
            setStarting(false);
        }
    }

    if (!user) return null;

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10}}>Loading activity...</Text>
            </View>
        );
    }

    if (!activity) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>Activity not found</Text>
                <Text style={styles.body}>
                    This activity doesn’t exist or you don’t have permission to view it.
                </Text>
            </View>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.title}>{activity.title}</Text>

            <Text style={styles.meta}>
                {activity.category} • {activity.difficulty}
                {timeSpanLabel ? ` • ${timeSpanLabel}` : ""}
            </Text>

            {activity.shortDescription ? (
                <Text style={[styles.body, {marginTop: 12}]}>{activity.shortDescription}</Text>
            ) : null}

            {activity.description ? (
                <>
                    <Text style={styles.section}>Overview</Text>
                    <Text style={styles.body}>{activity.description}</Text>
                </>
            ) : null}

            {activity.instructions ? (
                <>
                    <Text style={styles.section}>Instructions</Text>
                    <Text style={styles.body}>{activity.instructions}</Text>
                </>
            ) : null}

            {activity.equipment?.length ? (
                <>
                    <Text style={styles.section}>Equipment</Text>
                    {activity.equipment.map((e, idx) => (
                        <Text key={`${e}-${idx}`} style={styles.body}>
                            • {e}
                        </Text>
                    ))}
                </>
            ) : null}

            <View style={{height: 18}}/>

            <Pressable
                style={[styles.primaryBtn, starting && {opacity: 0.6}]}
                onPress={onStart}
                disabled={starting}
            >
                <Text style={styles.primaryBtnText}>{starting ? "Starting..." : "Start"}</Text>
            </Pressable>

            {!flow?.startRoute ? (
                <Text style={styles.hint}>
                    Flow routing isn’t configured for this activity yet (missing startRoute in activityCatalog).
                </Text>
            ) : (
                <Text style={styles.hint}>
                    Start route: <Text style={{fontWeight: "900"}}>{String(flow.startRoute)}</Text>
                </Text>
            )}

            <View style={{height: 24}}/>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {flexGrow: 1, padding: 20},
    center: {flex: 1, alignItems: "center", justifyContent: "center"},

    title: {fontSize: 28, fontWeight: "900", marginTop: 10},
    meta: {marginTop: 8, opacity: 0.8},

    section: {marginTop: 16, fontWeight: "900", fontSize: 16},
    body: {marginTop: 8, opacity: 0.9, lineHeight: 20},

    primaryBtn: {
        marginTop: 10,
        backgroundColor: "#111",
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: "center",
    },
    primaryBtnText: {color: "white", fontWeight: "900", fontSize: 16},

    hint: {marginTop: 12, opacity: 0.7, lineHeight: 18},
});