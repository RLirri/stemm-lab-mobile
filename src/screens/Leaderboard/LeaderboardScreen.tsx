import React, {useEffect, useMemo, useRef, useState} from "react";
import {
    View,
    Text,
    FlatList,
    RefreshControl,
    StyleSheet,
    ActivityIndicator,
    Pressable,
    Animated,
} from "react-native";
import type {NativeStackScreenProps} from "@react-navigation/native-stack";

import type {AppStackParamList} from "../../navigation/AppStack";
import type {LeaderboardTeamRow} from "../../types/team";
import {getMyTeamId} from "../../services/meService";
import {subscribeLeaderboard} from "../../services/leaderboardService";

type Props = NativeStackScreenProps<AppStackParamList, "Leaderboard">;

type Mode = "global" | "parachute_drop" | "sound_hunter";

function medal(rank: number) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `${rank}`;
}

function safeNum(x: unknown, fallback = 0) {
    return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function modeTitle(mode: Mode) {
    if (mode === "global") return "Global Leaderboard";
    if (mode === "parachute_drop") return "Activity 1 Leaderboard";
    return "Activity 2 Leaderboard";
}

function modeTabLabel(mode: Mode) {
    if (mode === "global") return "Global";
    if (mode === "parachute_drop") return "Parachute Drop";
    return "Sound Hunter";
}

function activityKeyForMode(mode: Mode): string | undefined {
    if (mode === "parachute_drop") return "parachute_drop";
    if (mode === "sound_hunter") return "sound_hunter";
    return undefined;
}

function AnimatedNumber({value, style}: { value: number; style?: any }) {
    const animated = useRef(new Animated.Value(value)).current;
    const [display, setDisplay] = useState(value);

    useEffect(() => {
        const id = animated.addListener(({value: v}) => setDisplay(Math.round(v)));

        Animated.timing(animated, {
            toValue: value,
            duration: 420,
            useNativeDriver: false,
        }).start();

        return () => {
            animated.removeListener(id);
        };
    }, [animated, value]);

    return <Text style={style}>{display}</Text>;
}

export default function LeaderboardScreen({navigation}: Props) {
    const [mode, setMode] = useState<Mode>("global");
    const [rows, setRows] = useState<LeaderboardTeamRow[]>([]);
    const [myTeamId, setMyTeamId] = useState<string | null>(null);
    const [myRank, setMyRank] = useState<number | null>(null);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Score delta
    const prevScoreByTeamRef = useRef<Map<string, number>>(new Map());
    const [deltaByTeam, setDeltaByTeam] = useState<Record<string, number>>({});

    // IMPORTANT: reset delta cache when switching tabs
    useEffect(() => {
        prevScoreByTeamRef.current = new Map();
        setDeltaByTeam({});
    }, [mode]);

    // Fetch my team once
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const tid = await getMyTeamId();
                if (!cancelled) setMyTeamId(tid);
            } catch {
                if (!cancelled) setMyTeamId(null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    // Subscribe leaderboard by mode (real-time)
    useEffect(() => {
        setLoading(true);
        setError(null);

        const activityKey = activityKeyForMode(mode);

        const unsubscribe = subscribeLeaderboard(
            {
                mode: mode === "global" ? "global" : "activity",
                activityKey,
                pageSize: 50,
            },
            (next) => {
                const nextDelta: Record<string, number> = {};
                const prevMap = prevScoreByTeamRef.current;

                for (const r of next) {
                    const shownScore =
                        mode === "global"
                            ? safeNum(r.totalScore, 0)
                            : safeNum(r.activityScores?.[activityKey ?? ""], 0);

                    const prev = prevMap.get(r.id);
                    if (typeof prev === "number") {
                        const d = shownScore - prev;
                        if (d !== 0) nextDelta[r.id] = d;
                    }
                    prevMap.set(r.id, shownScore);
                }

                setDeltaByTeam(nextDelta);
                setRows(next);
                setLoading(false);
            },
            (err) => {
                setError((err as any)?.message ?? "Failed to load leaderboard");
                setRows([]);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [mode]);

    // Compute my rank whenever rows change
    useEffect(() => {
        if (!myTeamId) {
            setMyRank(null);
            return;
        }
        const idx = rows.findIndex((r) => r.id === myTeamId);
        setMyRank(idx >= 0 ? idx + 1 : null);
    }, [myTeamId, rows]);

    const onRefresh = async () => {
        setRefreshing(true);
        await new Promise((r) => setTimeout(r, 250));
        setRefreshing(false);
    };

    const header = useMemo(() => {
        return (
            <>
                <Text style={styles.title}>{modeTitle(mode)}</Text>

                <View style={styles.tabs}>
                    {(["global", "parachute_drop", "sound_hunter"] as Mode[]).map((m) => (
                        <Pressable
                            key={m}
                            onPress={() => setMode(m)}
                            style={[styles.tab, mode === m && styles.tabActive]}
                        >
                            <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                                {modeTabLabel(m)}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {myRank ? (
                    <View style={styles.myRankCard}>
                        <Text style={styles.myRankLabel}>Your Team Rank</Text>
                        <Text style={styles.myRankValue}>#{myRank}</Text>
                    </View>
                ) : (
                    <View style={styles.myRankCardMuted}>
                        <Text style={styles.myRankMutedTitle}>Join a team to be ranked</Text>
                        <Text style={styles.myRankMutedHint}>
                            You can still view the leaderboard, but submissions/scores require a team.
                        </Text>
                    </View>
                )}

                {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
        );
    }, [error, mode, myRank]);

    return (
        <View style={styles.container}>
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator/>
                    <Text style={styles.loadingText}>Loading…</Text>
                </View>
            ) : (
                <FlatList
                    data={rows}
                    keyExtractor={(item) => item.id}
                    ListHeaderComponent={header}
                    ListEmptyComponent={
                        <Text style={styles.empty}>
                            No public teams yet (or missing fields). Run backfill once, and make sure teams
                            arePublic=true.
                        </Text>
                    }
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}/>}
                    renderItem={({item, index}) => {
                        const activityKey = activityKeyForMode(mode);

                        const shownScore =
                            mode === "global"
                                ? safeNum(item.totalScore, 0)
                                : safeNum(item.activityScores?.[activityKey ?? ""], 0);

                        const delta = safeNum(deltaByTeam[item.id], 0);

                        return (
                            <Pressable
                                onPress={() => navigation.navigate("TeamDetail", {teamId: item.id, mode: "view"})}
                                style={({pressed}) => [styles.row, pressed && styles.pressed]}
                            >
                                <Text style={styles.rank}>{medal(index + 1)}</Text>

                                <View style={{flex: 1}}>
                                    <Text style={styles.name} numberOfLines={1}>
                                        {item.name}
                                    </Text>
                                    <Text style={styles.meta}>{safeNum(item.memberCount)} members</Text>
                                </View>

                                <View style={{alignItems: "flex-end", minWidth: 72}}>
                                    <AnimatedNumber value={shownScore} style={styles.score}/>
                                    {delta !== 0 ? (
                                        <Text style={[styles.delta, delta > 0 ? styles.deltaUp : styles.deltaDown]}>
                                            {delta > 0 ? `+${delta}` : `${delta}`}
                                        </Text>
                                    ) : (
                                        <Text style={styles.deltaMute}> </Text>
                                    )}
                                </View>
                            </Pressable>
                        );
                    }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flex: 1},

    title: {fontSize: 22, fontWeight: "900", paddingHorizontal: 16, paddingTop: 16},
    error: {paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, color: "crimson"},

    tabs: {flexDirection: "row", paddingHorizontal: 16, gap: 8, paddingTop: 10},

    tab: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor: "white",
    },
    tabActive: {backgroundColor: "#111", borderColor: "#111"},
    tabText: {fontWeight: "800", opacity: 0.9},
    tabTextActive: {color: "white", opacity: 1},

    myRankCard: {
        marginHorizontal: 16,
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        backgroundColor: "#111",
    },
    myRankLabel: {color: "white", opacity: 0.8},
    myRankValue: {color: "white", fontSize: 22, fontWeight: "900"},

    myRankCardMuted: {
        marginHorizontal: 16,
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        backgroundColor: "#f6f6f6",
        borderWidth: 1,
        borderColor: "#ececec",
    },
    myRankMutedTitle: {fontWeight: "900"},
    myRankMutedHint: {marginTop: 6, opacity: 0.75, lineHeight: 18},

    center: {flex: 1, justifyContent: "center", alignItems: "center"},
    loadingText: {marginTop: 8, opacity: 0.7},

    empty: {paddingHorizontal: 16, paddingVertical: 12, opacity: 0.7},

    pressed: {opacity: 0.7},

    row: {
        flexDirection: "row",
        alignItems: "center",
        padding: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },

    rank: {width: 40, fontSize: 16, fontWeight: "900"},
    name: {fontSize: 16, fontWeight: "800"},
    meta: {fontSize: 12, opacity: 0.7},

    score: {fontSize: 18, fontWeight: "900"},

    delta: {marginTop: 2, fontSize: 12, fontWeight: "900"},
    deltaUp: {color: "green"},
    deltaDown: {color: "crimson"},
    deltaMute: {marginTop: 2, fontSize: 12, opacity: 0},
});