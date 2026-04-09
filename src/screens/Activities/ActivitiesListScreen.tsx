import React, {useEffect, useState} from "react";
import {View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";
import {useTranslation} from "react-i18next";

import type {AppStackParamList} from "../../navigation/AppStack";
import {listActiveActivities} from "../../services/activityService";
import type {Activity} from "../../types/activity";

type Props = NativeStackScreenProps<AppStackParamList, "Activities">;

export default function ActivitiesListScreen({navigation}: Props) {
    const {t} = useTranslation(["common", "activities"]);

    const [items, setItems] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        (async () => {
            try {
                const data = await listActiveActivities();
                if (mounted) setItems(data);
            } catch (e: any) {
                if (mounted) {
                    setError(e?.message ?? t("activities:listLoadFailed"));
                }
            } finally {
                if (mounted) setLoading(false);
            }
        })();

        return () => {
            mounted = false;
        };
    }, [t]);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={styles.loadingText}>{t("common:states.loadingActivities")}</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>{t("activities:listTitle")}</Text>
                <Text style={styles.errorTitle}>{t("activities:couldntLoad")}</Text>
                <Text style={styles.errorText}>{error}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{t("activities:listTitle")}</Text>

            {items.length === 0 ? (
                <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>{t("common:empty.noActivitiesYet")}</Text>
                    <Text style={styles.emptyText}>{t("activities:emptyHint")}</Text>
                </View>
            ) : (
                <FlatList
                    data={items}
                    keyExtractor={(a) => a.id}
                    ItemSeparatorComponent={() => <View style={{height: 10}}/>}
                    renderItem={({item}) => (
                        <Pressable
                            style={styles.card}
                            onPress={() => navigation.navigate("ActivityDetail", {activityId: item.id})}
                        >
                            <Text style={styles.cardTitle}>{item.title}</Text>

                            {item.shortDescription ? (
                                <Text style={styles.cardDesc} numberOfLines={2}>
                                    {item.shortDescription}
                                </Text>
                            ) : null}

                            <Text style={styles.cardMeta}>
                                {item.category} • {item.difficulty}
                                {item.timeSpanMinutes ? ` • ~${item.timeSpanMinutes} min` : ""}
                            </Text>
                        </Pressable>
                    )}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flex: 1, padding: 20},
    center: {flex: 1, alignItems: "center", justifyContent: "center"},
    loadingText: {marginTop: 10},
    title: {fontSize: 28, fontWeight: "900", marginTop: 10, marginBottom: 10},
    errorTitle: {marginTop: 10, fontWeight: "800"},
    errorText: {marginTop: 6, opacity: 0.8},
    emptyBox: {marginTop: 18},
    emptyTitle: {fontWeight: "800"},
    emptyText: {marginTop: 6, opacity: 0.7},
    card: {
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        padding: 14,
    },
    cardTitle: {fontSize: 16, fontWeight: "900"},
    cardMeta: {marginTop: 6, opacity: 0.8},
    cardDesc: {marginTop: 6, opacity: 0.85, lineHeight: 18},
});