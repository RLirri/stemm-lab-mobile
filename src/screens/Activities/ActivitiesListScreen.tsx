import React, {useEffect, useState} from "react";
import {View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";
import type {AppStackParamList} from "../../navigation/AppStack";
import {listActiveActivities} from "../../services/activityService";
import type {Activity} from "../../types/activity";

type Props = NativeStackScreenProps<AppStackParamList, "Activities">;

export default function ActivitiesListScreen({navigation}: Props) {
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
                if (mounted) setError(e?.message ?? "Failed to load activities");
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator/>
                <Text style={{marginTop: 10}}>Loading activities...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>Activities</Text>
                <Text style={{marginTop: 10, fontWeight: "800"}}>Couldn’t load</Text>
                <Text style={{marginTop: 6, opacity: 0.8}}>{error}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Activities</Text>

            {items.length === 0 ? (
                <View style={{marginTop: 18}}>
                    <Text style={{fontWeight: "800"}}>No activities yet</Text>
                    <Text style={{marginTop: 6, opacity: 0.7}}>
                        Ask admin to seed the Activity Catalog or create activity docs in Firestore.
                    </Text>
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
                            <Text style={styles.cardMeta}>
                                {item.category} • {item.difficulty}
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
    title: {fontSize: 28, fontWeight: "900", marginTop: 10, marginBottom: 10},
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