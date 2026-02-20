import React, {useCallback, useEffect, useMemo, useState} from "react";
import {
    View,
    Text,
    FlatList,
    RefreshControl,
    StyleSheet,
    ActivityIndicator,
    Pressable,
} from "react-native";
import {NativeStackScreenProps} from "@react-navigation/native-stack";
import type {AppStackParamList} from "../../navigation/AppStack";
import type {LeaderboardTeamRow} from "../../types/team";
import {fetchGlobalLeaderboard} from "../../services/leaderboardService";
import {getMyTeamId} from "../../services/meService";

type Props = NativeStackScreenProps<AppStackParamList, "Leaderboard">;

function formatDate(d: Date | null) {
    if (!d) return "—";
    // compact but readable
    return d.toLocaleString();
}

function LeaderboardRow({
                            rank,
                            item,
                            isMine,
                            onPress,
                        }: {
    rank: number;
    item: LeaderboardTeamRow;
    isMine: boolean;
    onPress: () => void;
}) {
    return (
        <Pressable onPress={onPress} style={({pressed}) => [pressed && styles.pressed]}>
            <View style={[styles.row, isMine && styles.rowMine]}>
                <Text style={[styles.rank, isMine && styles.rankMine]}>{rank}</Text>

                <View style={styles.main}>
                    <Text style={[styles.name, isMine && styles.nameMine]} numberOfLines={1}>
                        {item.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                        {item.memberCount} members • Updated {formatDate(item.lastUpdated)}
                    </Text>
                </View>

                <Text style={[styles.score, isMine && styles.scoreMine]}>{item.totalScore}</Text>
            </View>
        </Pressable>
    );
}

export default function LeaderboardScreen({navigation}: Props) {
    const [rows, setRows] = useState<LeaderboardTeamRow[]>([]);
    const [myTeamId, setMyTeamId] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setError(null);

            // Fetch leaderboard + myTeamId in parallel (fast + clean)
            const [data, tid] = await Promise.all([
                fetchGlobalLeaderboard(50),
                getMyTeamId(),
            ]);

            setRows(data);
            setMyTeamId(tid);
        } catch (e: any) {
            setError(e?.message ?? "Failed to load leaderboard");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    const listEmpty = useMemo(() => {
        if (loading) return null;
        return <Text style={styles.empty}>No public teams yet.</Text>;
    }, [loading]);

    const renderItem = useCallback(
        ({item, index}: { item: LeaderboardTeamRow; index: number }) => {
            const isMine = myTeamId === item.id;

            return (
                <LeaderboardRow
                    rank={index + 1}
                    item={item}
                    isMine={isMine}
                    onPress={() =>
                        navigation.navigate("TeamDetail", {teamId: item.id, mode: "view"})
                    }
                />
            );
        },
        [myTeamId, navigation]
    );

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Global Leaderboard</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator/>
                    <Text style={styles.loadingText}>Loading…</Text>
                </View>
            ) : (
                <FlatList
                    data={rows}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh}/>
                    }
                    ListEmptyComponent={listEmpty}
                    contentContainerStyle={rows.length === 0 ? styles.emptyContainer : undefined}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flex: 1},

    title: {fontSize: 22, fontWeight: "800", padding: 16},
    error: {paddingHorizontal: 16, paddingBottom: 8, color: "crimson"},

    center: {flex: 1, alignItems: "center", justifyContent: "center"},
    loadingText: {marginTop: 8, opacity: 0.7},

    emptyContainer: {flexGrow: 1, justifyContent: "flex-start"},
    empty: {paddingHorizontal: 16, paddingVertical: 8, opacity: 0.7},

    pressed: {opacity: 0.7},

    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowMine: {
        borderWidth: 1,
        borderRadius: 12,
        marginHorizontal: 12,
        marginVertical: 6,
        borderBottomWidth: 1, // keep consistent look
    },

    rank: {width: 34, fontSize: 16, fontWeight: "700"},
    rankMine: {fontWeight: "900"},

    main: {flex: 1, paddingRight: 12},
    name: {fontSize: 16, fontWeight: "700"},
    nameMine: {fontWeight: "900"},

    meta: {marginTop: 2, fontSize: 12, opacity: 0.75},

    score: {fontSize: 18, fontWeight: "800"},
    scoreMine: {fontWeight: "900"},
});