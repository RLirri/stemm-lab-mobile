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
import {createRunDraft} from "../../store/activityRunDraftStore";

type Props = NativeStackScreenProps<AppStackParamList, "ActivityDetail">;

/**
 * Local-only routing metadata (keeps your ActivityDoc clean).
 * We try to match by:
 *  - activity.slug (preferred)
 *  - activityId === definition.id (works with deterministic IDs)
 */
type ActivityFlowMeta = {
    slug?: string;
    startRoute?: keyof AppStackParamList;
};

function getSlug(activity: Activity | null): string | null {
    if (!activity) return null;
    // Some teams store slug in Firestore; keep it optional and safe.
    const maybeSlug = (activity as unknown as { slug?: string }).slug;
    return maybeSlug ?? activity.id ?? null;
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

    const flow = useMemo(() => {
        const slug = getSlug(activity);
        if (!slug) return null;

        // We keep your existing activityCatalog/definitions intact by
        // allowing optional routing metadata (startRoute) via type assertion.
        const defs = activityCatalog as unknown as Array<
            { id: string } & ActivityFlowMeta
        >;

        // Preferred: match by slug if available; otherwise deterministic ID match.
        return (
            defs.find((d) => (d.slug ? d.slug === slug : false)) ??
            defs.find((d) => d.id === activityId) ??
            null
        );
    }, [activity, activityId]);

    const timeSpanLabel =
        activity?.timeSpanMinutes && activity.timeSpanMinutes > 0
            ? `~${activity.timeSpanMinutes} min`
            : null;

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

            // v1 approach: create a local run draft (in-memory store) for flows that need runId.
            if (startRoute === "A1SessionSetup") {
                const draft = createRunDraft(activityId, user.uid);
                navigation.navigate("A1SessionSetup", {activityId, runId: draft.runId});
                return;
            }

            // Generic fallback: navigate with activityId only.
            navigation.navigate(startRoute, {activityId} as never);
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
                <Text style={[styles.body, {marginTop: 12}]}>
                    {activity.shortDescription}
                </Text>
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
                    Flow routing isn’t configured for this activity yet (missing slug/startRoute mapping).
                </Text>
            ) : (
                <Text style={styles.hint}>
                    You’ll complete session setup, baseline + prototypes, measurements, results, reflection, and
                    submission.
                </Text>
            )}
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