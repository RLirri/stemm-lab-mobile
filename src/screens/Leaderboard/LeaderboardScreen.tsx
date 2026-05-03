// src/screens/Leaderboard/LeaderboardScreen.tsx
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    Animated,
    FlatList,
    Pressable,
    RefreshControl,
    StyleSheet,
    View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import type {AppStackParamList} from '../../navigation/AppStack';
import type {LeaderboardTeamRow} from '../../types/team';
import {getMyTeamId} from '../../services/meService';
import {subscribeLeaderboardRobust} from '../../services/leaderboardService';

import {
    AppBadge,
    AppCard,
    AppGradientScreen,
    AppSectionHeader,
    AppText,
    EmptyState,
    InfoBanner,
    LoadingState,
} from '../../components/ui';

import {colors, spacing} from '../../theme';

type Props = NativeStackScreenProps<AppStackParamList, 'Leaderboard'>;

type Mode =
    | 'global'
    | 'parachute_drop'
    | 'sound_hunter'
    | 'hand_fan'
    | 'earthquake_structure'
    | 'human_performance'
    | 'reaction_board'
    | 'breathing_pace';

const MODES: Mode[] = [
    'global',
    'parachute_drop',
    'sound_hunter',
    'hand_fan',
    'earthquake_structure',
    'human_performance',
    'reaction_board',
    'breathing_pace',
];

function medal(rank: number) {
    if (rank === 1) return '1';
    if (rank === 2) return '2';
    if (rank === 3) return '3';
    return `${rank}`;
}

function safeNum(x: unknown, fallback = 0) {
    return typeof x === 'number' && Number.isFinite(x) ? x : fallback;
}

function modeTitle(mode: Mode) {
    if (mode === 'global') return 'Global Leaderboard';
    if (mode === 'parachute_drop') return 'Activity 1 Leaderboard';
    if (mode === 'sound_hunter') return 'Activity 2 Leaderboard';
    if (mode === 'hand_fan') return 'Activity 3 Leaderboard';
    if (mode === 'earthquake_structure') return 'Activity 4 Leaderboard';
    if (mode === 'human_performance') return 'Activity 5 Leaderboard';
    if (mode === 'reaction_board') return 'Activity 6 Leaderboard';
    return 'Activity 7 Leaderboard';
}

function modeTabLabel(mode: Mode) {
    if (mode === 'global') return 'Global';
    if (mode === 'parachute_drop') return 'A1';
    if (mode === 'sound_hunter') return 'A2';
    if (mode === 'hand_fan') return 'A3';
    if (mode === 'earthquake_structure') return 'A4';
    if (mode === 'human_performance') return 'A5';
    if (mode === 'reaction_board') return 'A6';
    return 'A7';
}

function activityKeyForMode(mode: Mode): string | undefined {
    if (mode === 'parachute_drop') return 'parachute_drop';
    if (mode === 'sound_hunter') return 'sound_hunter';
    if (mode === 'hand_fan') return 'hand_fan';
    if (mode === 'earthquake_structure') return 'earthquake_structure';
    if (mode === 'human_performance') return 'human_performance';
    if (mode === 'reaction_board') return 'reaction_board';
    if (mode === 'breathing_pace') return 'breathing_pace';
    return undefined;
}

function scoreOrderForMode(mode: Mode): 'asc' | 'desc' {
    if (mode === 'earthquake_structure') return 'asc';
    return 'desc';
}

function helpLineForMode(mode: Mode) {
    if (mode === 'global') return 'Season total across all activities.';
    if (mode === 'earthquake_structure') return 'Lower score is better for this activity.';
    if (mode === 'reaction_board') {
        return 'Higher score is better. Requires tracing accuracy threshold.';
    }
    if (mode === 'breathing_pace') {
        return 'Higher score is better. Based on recovery consistency.';
    }
    return 'Activity score for the current season.';
}

function scoreDigitsForMode(mode: Mode): 0 | 1 {
    if (mode === 'human_performance') return 1;
    return 0;
}

function fmtDelta(n: number, digits: number) {
    const sign = n > 0 ? '+' : '';
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

    return (
        <AppText variant="subtitle" style={style}>
            {Number.isFinite(display) ? display.toFixed(digits) : '0'}
        </AppText>
    );
}

export default function LeaderboardScreen({navigation}: Props) {
    const [mode, setMode] = useState<Mode>('global');
    const [rows, setRows] = useState<LeaderboardTeamRow[]>([]);
    const [myTeamId, setMyTeamId] = useState<string | null>(null);
    const [myRank, setMyRank] = useState<number | null>(null);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
                mode: mode === 'global' ? 'global' : 'activity',
                activityKey,
                pageSize: 50,
                scoreOrder,
            },
            (next) => {
                const nextDelta: Record<string, number> = {};
                const prevMap = prevScoreByTeamRef.current;

                for (const r of next) {
                    const shownScore =
                        mode === 'global'
                            ? safeNum(r.totalScore, 0)
                            : safeNum(r.activityScores?.[activityKey ?? ''], 0);

                    const prev = prevMap.get(r.id);

                    if (typeof prev === 'number') {
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
                setError((err as any)?.message ?? 'Failed to load leaderboard.');
                setRows([]);
                setLoading(false);
            },
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
        await new Promise((resolve) => setTimeout(resolve, 250));
        setRefreshing(false);
    };

    const digits = scoreDigitsForMode(mode);
    const isA4 = mode === 'earthquake_structure';

    const header = useMemo(() => {
        return (
            <View>
                <AppText variant="caption" color="textMuted">
                    Competition
                </AppText>

                <AppText variant="title" style={styles.title}>
                    {modeTitle(mode)}
                </AppText>

                <AppText variant="body" color="textMuted" style={styles.subtitle}>
                    {helpLineForMode(mode)}
                </AppText>

                <View style={styles.tabs}>
                    {MODES.map((m) => {
                        const active = mode === m;

                        return (
                            <Pressable
                                key={m}
                                onPress={() => setMode(m)}
                                style={[styles.tab, active && styles.tabActive]}
                            >
                                <AppText
                                    variant="caption"
                                    color={active ? 'inverseText' : 'primary'}
                                    style={styles.tabText}
                                >
                                    {modeTabLabel(m)}
                                </AppText>
                            </Pressable>
                        );
                    })}
                </View>

                {myTeamId ? (
                    myRank ? (
                        <AppCard style={styles.rankCard}>
                            <AppText variant="caption" color="textMuted">
                                Your Team Rank
                            </AppText>

                            <AppText variant="title" color="primary" style={styles.rankValue}>
                                #{myRank}
                            </AppText>

                            <AppText variant="caption" color="textMuted">
                                Tap your row to view team details.
                            </AppText>
                        </AppCard>
                    ) : (
                        <InfoBanner
                            title="Your team is not in the top 50"
                            message="This list shows the top 50 public teams. Your team may still have points."
                            tone="info"
                        />
                    )
                ) : (
                    <InfoBanner
                        title="Join a team to be ranked"
                        message="You can view the leaderboard, but submissions and scores require a team."
                        tone="info"
                    />
                )}

                {error ? (
                    <InfoBanner title="Leaderboard unavailable" message={error} tone="danger"/>
                ) : null}

                <AppSectionHeader
                    title="Rankings"
                    subtitle={`${rows.length} team${rows.length === 1 ? '' : 's'} shown`}
                />
            </View>
        );
    }, [error, mode, myRank, myTeamId, rows.length]);

    if (loading) {
        return (
            <AppGradientScreen scroll={false}>
                <LoadingState message="Loading leaderboard..."/>
            </AppGradientScreen>
        );
    }

    return (
        <AppGradientScreen scroll={false} padded={false}>
            <FlatList
                data={rows}
                keyExtractor={(item) => item.id}
                ListHeaderComponent={header}
                contentContainerStyle={styles.content}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh}/>
                }
                ListEmptyComponent={
                    <EmptyState
                        title="No leaderboard data yet"
                        message="Public teams may not have submitted scores yet, or leaderboard fields need to be backfilled."
                    />
                }
                renderItem={({item, index}) => {
                    const activityKey = activityKeyForMode(mode);
                    const shownScore =
                        mode === 'global'
                            ? safeNum(item.totalScore, 0)
                            : safeNum(item.activityScores?.[activityKey ?? ''], 0);

                    const delta = safeNum(deltaByTeam[item.id], 0);
                    const isMine = myTeamId != null && item.id === myTeamId;
                    const deltaIsGood = isA4 ? delta < 0 : delta > 0;

                    return (
                        <Pressable
                            onPress={() =>
                                navigation.navigate('TeamDetail', {
                                    teamId: item.id,
                                    mode: 'view',
                                })
                            }
                            style={({pressed}) => [
                                styles.rowCard,
                                isMine && styles.myRowCard,
                                pressed && styles.pressed,
                            ]}
                        >
                            <View style={[styles.rankCircle, isMine && styles.myRankCircle]}>
                                <AppText
                                    variant="bodyStrong"
                                    color={isMine ? 'inverseText' : 'primary'}
                                >
                                    {medal(index + 1)}
                                </AppText>
                            </View>

                            <View style={styles.teamArea}>
                                <AppText
                                    variant="bodyStrong"
                                    color={isMine ? 'inverseText' : 'text'}
                                    numberOfLines={1}
                                >
                                    {item.name}
                                </AppText>

                                <AppText
                                    variant="caption"
                                    color={isMine ? 'inverseText' : 'textMuted'}
                                    style={styles.memberText}
                                >
                                    {safeNum(item.memberCount)} members
                                </AppText>
                            </View>

                            <View style={styles.scoreArea}>
                                <AnimatedNumber
                                    value={shownScore}
                                    digits={digits}
                                    style={isMine ? styles.scoreMine : styles.score}
                                />

                                {delta !== 0 ? (
                                    <AppBadge
                                        label={fmtDelta(delta, digits)}
                                        tone={deltaIsGood ? 'success' : 'danger'}
                                    />
                                ) : null}
                            </View>
                        </Pressable>
                    );
                }}
            />
        </AppGradientScreen>
    );
}

const styles = StyleSheet.create({
    content: {
        padding: spacing.lg,
        paddingBottom: spacing.xxxl,
    },

    title: {
        marginTop: spacing.xs,
    },

    subtitle: {
        marginTop: spacing.sm,
        marginBottom: spacing.lg,
    },

    tabs: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        marginBottom: spacing.lg,
    },

    tab: {
        minHeight: 38,
        paddingHorizontal: spacing.md,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
    },

    tabActive: {
        backgroundColor: colors.primary,
    },

    tabText: {
        fontWeight: '800',
    },

    rankCard: {
        marginBottom: spacing.md,
    },

    rankValue: {
        marginTop: spacing.xs,
        marginBottom: spacing.xs,
    },

    rowCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: 24,
        backgroundColor: colors.surface,
        marginBottom: spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },

    myRowCard: {
        backgroundColor: colors.primaryDark,
        borderColor: colors.primaryDark,
    },

    pressed: {
        opacity: 0.82,
    },

    rankCircle: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
    },

    myRankCircle: {
        backgroundColor: colors.primary,
    },

    teamArea: {
        flex: 1,
    },

    memberText: {
        marginTop: spacing.xs,
    },

    scoreArea: {
        minWidth: 88,
        alignItems: 'flex-end',
        gap: spacing.xs,
    },

    score: {
        color: colors.text,
    },

    scoreMine: {
        color: colors.inverseText,
    },
});