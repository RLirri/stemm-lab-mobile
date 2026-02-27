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
    const teamsRef = collection(db, "teams");

    // Primary query (best)
    const primaryQuery =
        args.mode === "global"
            ? query(
                teamsRef,
                where("isPublic", "==", true),
                orderBy("stats.currentSeasonTotalScore", "desc"),
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
                    orderBy(fieldPath, "desc"),
                    orderBy("stats.lastUpdated", "desc"),
                    limit(pageSize)
                );
            })();

    // Fallback query (always works if isPublic exists)
    const fallbackQuery = query(
        teamsRef,
        where("isPublic", "==", true),
        orderBy("stats.lastUpdated", "desc"),
        limit(pageSize)
    );

    // Start primary subscription
    let unsubFallback: Unsubscribe | null = null;

    const unsubPrimary = onSnapshot(
        primaryQuery,
        (snap) => {
            const rows = snap.docs.map((d) => toRow({id: d.id, data: () => d.data()}));
            onData(rows);
        },
        (err) => {
            // If primary fails (missing index / missing ordered field), fallback gracefully
            if (onError) onError(err);

            // Start fallback subscription if not already started
            if (!unsubFallback) {
                unsubFallback = onSnapshot(
                    fallbackQuery,
                    (snap) => {
                        const rows = snap.docs
                            .map((d) => toRow({id: d.id, data: () => d.data()}))
                            .sort((a, b) => scoreForMode(b, args) - scoreForMode(a, args))
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