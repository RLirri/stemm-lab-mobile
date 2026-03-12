// src/screens/Leaderboard/LeaderboardScreen.tsx
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
import {subscribeLeaderboardRobust} from "../../services/leaderboardService";

type Props = NativeStackScreenProps<AppStackParamList, "Leaderboard">;

/**
 * NOTE:
 * - Make sure `activityKeyForMode("human_performance")` matches submitActivity5 key
 *   (the key written to stats.currentSeasonActivityScores.<key>).
 */
type Mode =
    | "global"
    | "parachute_drop"
    | "sound_hunter"
    | "hand_fan"
    | "earthquake_structure"
    | "human_performance"
    | "reaction_board"
    | "breathing_pace";

const MODES: Mode[] = [
    "global",
    "parachute_drop",
    "sound_hunter",
    "hand_fan",
    "earthquake_structure",
    "human_performance",
    "reaction_board",
    "breathing_pace",
];

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
    if (mode === "sound_hunter") return "Activity 2 Leaderboard";
    if (mode === "hand_fan") return "Activity 3 Leaderboard";
    if (mode === "earthquake_structure") return "Activity 4 Leaderboard";
    if (mode === "human_performance") return "Activity 5 Leaderboard";
    if (mode === "reaction_board") return "Activity 6 Leaderboard";
    return "Activity 7 Leaderboard";
}

function modeTabLabel(mode: Mode) {
    if (mode === "global") return "Global";
    if (mode === "parachute_drop") return "A1";
    if (mode === "sound_hunter") return "A2";
    if (mode === "hand_fan") return "A3";
    if (mode === "earthquake_structure") return "A4";
    if (mode === "human_performance") return "A5";
    if (mode === "reaction_board") return "A6";
    return "A7";
}

function activityKeyForMode(mode: Mode): string | undefined {
    if (mode === "parachute_drop") return "parachute_drop";
    if (mode === "sound_hunter") return "sound_hunter";
    if (mode === "hand_fan") return "hand_fan";
    if (mode === "earthquake_structure") return "earthquake_structure";
    if (mode === "human_performance") return "human_performance";
    if (mode === "reaction_board") return "reaction_board";
    if (mode === "breathing_pace") return "breathing_pace";
    return undefined;
}

function scoreOrderForMode(mode: Mode): "asc" | "desc" {
    // Activity 4 is "lower is better"
    if (mode === "earthquake_structure") return "asc";
    // A1/A2/A3/A5: higher is better
    return "desc";
}

function helpLineForMode(mode: Mode) {
    if (mode === "global") return "Season total (current season).";
    if (mode === "earthquake_structure") return "Activity score (lower is better).";
    if (mode === "human_performance") return "Activity score (higher is better).";
    if (mode === "reaction_board")
        return "Activity score (higher is better). Requires tracing accuracy threshold to be eligible.";
    if (mode === "breathing_pace")
        return "Activity score (higher is better). Based on best recovery-consistency submission score.";
    return "Activity score (current season).";
}

function scoreDigitsForMode(mode: Mode): 0 | 1 {
    if (mode === "human_performance") return 1;
    // A6 score recommended as integer points
    return 0;
}

function fmtDelta(n: number, digits: number) {
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(digits)}`;
}

function AnimatedNumber({
                            value,
                            digits = 0,
                            style,
                        }: {
    value: number;
    digits?: number;
    style?: any;
}) {
    const animated = useRef(new Animated.Value(value)).current;
    const [display, setDisplay] = useState(value);

    useEffect(() => {
        const subId = animated.addListener(({value: v}) => setDisplay(v));

        Animated.timing(animated, {
            toValue: value,
            duration: 420,
            useNativeDriver: false,
        }).start();

        return () => {
            animated.removeListener(subId);
        };
    }, [animated, value]);

    return <Text style={style}>{Number.isFinite(display) ? display.toFixed(digits) : "0"}</Text>;
}

export default function LeaderboardScreen({navigation}: Props) {
    const [mode, setMode] = useState<Mode>("global");
    const [rows, setRows] = useState<LeaderboardTeamRow[]>([]);
    const [myTeamId, setMyTeamId] = useState<string | null>(null);
    const [myRank, setMyRank] = useState<number | null>(null);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Track deltas (support decimals)
    const prevScoreByTeamRef = useRef<Map<string, number>>(new Map());
    const [deltaByTeam, setDeltaByTeam] = useState<Record<string, number>>({});

    useEffect(() => {
        prevScoreByTeamRef.current = new Map();
        setDeltaByTeam({});
    }, [mode]);

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

    useEffect(() => {
        setLoading(true);
        setError(null);

        const activityKey = activityKeyForMode(mode);
        const scoreOrder = scoreOrderForMode(mode);

        const unsubscribe = subscribeLeaderboardRobust(
            {
                mode: mode === "global" ? "global" : "activity",
                activityKey,
                pageSize: 50,
                scoreOrder,
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
                        const d = shownScore - prev; // negative means improved if lower-is-better
                        if (d !== 0) nextDelta[r.id] = d;
                    }
                    prevMap.set(r.id, shownScore);
                }

                setDeltaByTeam(nextDelta);
                setRows(next);
                setLoading(false);
            },
            (err) => {
                setError((err as any)?.message ?? "Failed to load leaderboard.");
                setRows([]);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [mode]);

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
                <Text style={styles.sub}>{helpLineForMode(mode)}</Text>

                <View style={styles.tabs}>
                    {MODES.map((m) => (
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

                {myTeamId ? (
                    myRank ? (
                        <View style={styles.myRankCard}>
                            <Text style={styles.myRankLabel}>Your Team Rank</Text>
                            <Text style={styles.myRankValue}>#{myRank}</Text>
                            <Text style={styles.myRankHint}>Tap your row to view your team details.</Text>
                        </View>
                    ) : (
                        <View style={styles.myRankCardMuted}>
                            <Text style={styles.myRankMutedTitle}>Your team isn’t in top 50</Text>
                            <Text style={styles.myRankMutedHint}>
                                This list shows the top 50 public teams. Your team may still have points.
                            </Text>
                        </View>
                    )
                ) : (
                    <View style={styles.myRankCardMuted}>
                        <Text style={styles.myRankMutedTitle}>Join a team to be ranked</Text>
                        <Text style={styles.myRankMutedHint}>
                            You can view the leaderboard, but submissions/scores require a team.
                        </Text>
                    </View>
                )}

                {error ? <Text style={styles.error}>{error}</Text> : null}
            </>
        );
    }, [error, mode, myRank, myTeamId]);

    const digits = scoreDigitsForMode(mode);
    const isA4 = mode === "earthquake_structure";

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
                            No public teams yet — or leaderboard fields aren’t backfilled.
                            {"\n"}Make sure teams have isPublic=true and stats.currentSeasonTotalScore /
                            stats.currentSeasonActivityScores.
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
                        const isMine = myTeamId != null && item.id === myTeamId;

                        // Delta sign semantics:
                        // - A4 (lower-is-better): negative delta => improved
                        // - Others (higher-is-better): positive delta => improved
                        const deltaIsGood = isA4 ? delta < 0 : delta > 0;

                        return (
                            <Pressable
                                onPress={() => navigation.navigate("TeamDetail", {teamId: item.id, mode: "view"})}
                                style={({pressed}) => [styles.row, isMine && styles.myRow, pressed && styles.pressed]}
                            >
                                <Text style={[styles.rank, isMine && styles.rankMine]}>{medal(index + 1)}</Text>

                                <View style={{flex: 1}}>
                                    <Text style={[styles.name, isMine && styles.nameMine]} numberOfLines={1}>
                                        {item.name}
                                    </Text>
                                    <Text style={[styles.meta, isMine && styles.metaMine]}>
                                        {safeNum(item.memberCount)} members
                                    </Text>
                                </View>

                                <View style={{alignItems: "flex-end", minWidth: 88}}>
                                    <AnimatedNumber
                                        value={shownScore}
                                        digits={digits}
                                        style={[styles.score, isMine && styles.scoreMine]}
                                    />
                                    {delta !== 0 ? (
                                        <Text
                                            style={[
                                                styles.delta,
                                                deltaIsGood ? styles.deltaGood : styles.deltaBad,
                                            ]}
                                        >
                                            {fmtDelta(delta, digits)}
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
    sub: {paddingHorizontal: 16, paddingTop: 6, opacity: 0.7},

    error: {paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, color: "crimson"},

    tabs: {flexDirection: "row", paddingHorizontal: 16, gap: 8, paddingTop: 10, flexWrap: "wrap"},
    tab: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        paddingVertical: 10,
        paddingHorizontal: 12,
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
    myRankHint: {marginTop: 6, color: "white", opacity: 0.75},

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

    empty: {paddingHorizontal: 16, paddingVertical: 12, opacity: 0.7, lineHeight: 18},

    pressed: {opacity: 0.7},

    row: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        marginHorizontal: 16,
        marginVertical: 6,
        borderRadius: 16,
        backgroundColor: "white",
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
    },

    myRow: {backgroundColor: "#111", borderBottomColor: "#111"},

    rank: {width: 40, fontSize: 16, fontWeight: "900"},
    rankMine: {color: "white"},

    name: {fontSize: 16, fontWeight: "800"},
    nameMine: {color: "white"},

    meta: {fontSize: 12, opacity: 0.7},
    metaMine: {color: "white", opacity: 0.8},

    score: {fontSize: 22, fontWeight: "900"},
    scoreMine: {color: "white"},

    delta: {marginTop: 2, fontSize: 12, fontWeight: "900"},
    deltaGood: {color: "green"},
    deltaBad: {color: "crimson"},
    deltaMute: {marginTop: 2, fontSize: 12, opacity: 0},
});