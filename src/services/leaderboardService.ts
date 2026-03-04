import {
    collection,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
    type Unsubscribe,
    type Timestamp,
} from "firebase/firestore";

import {db} from "./firebase";
import type {LeaderboardTeamRow, TeamDoc} from "../types/team";

export type SubscribeLeaderboardArgs = {
    mode: "global" | "activity";
    activityKey?: string; // e.g. "parachute_drop"
    pageSize?: number;
    scoreOrder?: "asc" | "desc";
};

function tsToDate(ts?: Timestamp | null): Date | null {
    if (!ts) return null;
    return ts.toDate();
}

function safeNum(x: unknown, fallback = 0): number {
    return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function getSeasonTotal(stats: NonNullable<TeamDoc["stats"]>): number {
    const season = safeNum((stats as any).currentSeasonTotalScore, NaN);
    if (Number.isFinite(season)) return season;
    return safeNum((stats as any).totalScore, 0);
}

function getSeasonActivityScores(stats: NonNullable<TeamDoc["stats"]>): Record<string, number> {
    const m = (stats as any).currentSeasonActivityScores;
    return m && typeof m === "object" ? (m as Record<string, number>) : {};
}

function toRow(d: { id: string; data: () => any }): LeaderboardTeamRow {
    const data = d.data() as TeamDoc;
    const stats = (data.stats ?? {}) as NonNullable<TeamDoc["stats"]>;

    return {
        id: d.id,
        name: data.name ?? "Unnamed Team",
        memberCount: safeNum(stats.memberCount, data.members?.length ?? 0),
        totalScore: getSeasonTotal(stats),
        lastUpdated: tsToDate((stats as any).lastUpdated ?? null),
        activityScores: getSeasonActivityScores(stats),
    };
}

function scoreForMode(row: LeaderboardTeamRow, args: SubscribeLeaderboardArgs): number {
    if (args.mode === "global") return safeNum(row.totalScore, 0);
    const k = args.activityKey ?? "";
    return safeNum(row.activityScores?.[k], 0);
}

/**
 * Robust realtime leaderboard:
 * - Try “proper ordered” query first (fast + correct)
 * - If it errors due to missing index/fields, fallback to safe query and client-sort
 */
export function subscribeLeaderboardRobust(
    args: SubscribeLeaderboardArgs,
    onData: (rows: LeaderboardTeamRow[]) => void,
    onError?: (err: unknown) => void
): Unsubscribe {
    const pageSize = args.pageSize ?? 50;
    const scoreOrder = args.scoreOrder ?? "desc"; // ✅ use it
    const teamsRef = collection(db, "teams");

    const primaryQuery =
        args.mode === "global"
            ? query(
                teamsRef,
                where("isPublic", "==", true),
                orderBy("stats.currentSeasonTotalScore", scoreOrder), // ✅
                orderBy("stats.lastUpdated", "desc"),
                limit(pageSize)
            )
            : (() => {
                const activityKey = args.activityKey;
                if (!activityKey) throw new Error("subscribeLeaderboardRobust(activity): missing activityKey");
                const fieldPath = `stats.currentSeasonActivityScores.${activityKey}`;
                return query(
                    teamsRef,
                    where("isPublic", "==", true),
                    orderBy(fieldPath, scoreOrder), // ✅
                    orderBy("stats.lastUpdated", "desc"),
                    limit(pageSize)
                );
            })();

    const fallbackQuery = query(
        teamsRef,
        where("isPublic", "==", true),
        orderBy("stats.lastUpdated", "desc"),
        limit(pageSize)
    );

    let unsubFallback: Unsubscribe | null = null;

    const unsubPrimary = onSnapshot(
        primaryQuery,
        (snap) => {
            const rows = snap.docs.map((d) => toRow({id: d.id, data: () => d.data()}));
            onData(rows);
        },
        (err) => {
            if (onError) onError(err);

            if (!unsubFallback) {
                unsubFallback = onSnapshot(
                    fallbackQuery,
                    (snap) => {
                        const rows = snap.docs
                            .map((d) => toRow({id: d.id, data: () => d.data()}))
                            .sort((a, b) => {
                                const sa = scoreForMode(a, args);
                                const sb = scoreForMode(b, args);
                                if (sa !== sb) return scoreOrder === "asc" ? sa - sb : sb - sa; // ✅
                                const ta = a.lastUpdated?.getTime() ?? 0;
                                const tb = b.lastUpdated?.getTime() ?? 0;
                                return tb - ta;
                            })
                            .slice(0, pageSize);

                        onData(rows);
                    },
                    (fallbackErr) => {
                        if (onError) onError(fallbackErr);
                        onData([]);
                    }
                );
            }
        }
    );

    return () => {
        unsubPrimary();
        if (unsubFallback) unsubFallback();
    };
}

/**
 * Optional: non-realtime fetch (kept)
 */
export async function fetchLeaderboard(args: {
    activityKey?: string;
    pageSize?: number
}): Promise<LeaderboardTeamRow[]> {
    const pageSize = args.pageSize ?? 50;
    const activityKey = args.activityKey;

    const teamsRef = collection(db, "teams");

    const q = !activityKey
        ? query(
            teamsRef,
            where("isPublic", "==", true),
            orderBy("stats.currentSeasonTotalScore", "desc"),
            orderBy("stats.lastUpdated", "desc"),
            limit(pageSize)
        )
        : query(
            teamsRef,
            where("isPublic", "==", true),
            orderBy(`stats.currentSeasonActivityScores.${activityKey}`, "desc"),
            orderBy("stats.lastUpdated", "desc"),
            limit(pageSize)
        );

    const snap = await getDocs(q);

    return snap.docs.map((d) => toRow({id: d.id, data: () => d.data()}));
}