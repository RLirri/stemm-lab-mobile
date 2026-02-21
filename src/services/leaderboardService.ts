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

/**
 * Read "season total" score with backward compatibility.
 * - New system: stats.currentSeasonTotalScore
 * - Legacy: stats.totalScore
 */
function getSeasonTotal(stats: NonNullable<TeamDoc["stats"]>): number {
    const season = safeNum((stats as any).currentSeasonTotalScore, NaN);
    if (Number.isFinite(season)) return season;
    return safeNum((stats as any).totalScore, 0);
}

/**
 * Read activity score map (season-aware) with backward compatibility.
 * - New system: stats.currentSeasonActivityScores (map)
 * - Legacy fallback: undefined -> {}
 */
function getSeasonActivityScores(stats: NonNullable<TeamDoc["stats"]>): Record<string, number> {
    const m = (stats as any).currentSeasonActivityScores;
    return m && typeof m === "object" ? (m as Record<string, number>) : {};
}

/**
 * Real-time leaderboard subscription.
 *
 * IMPORTANT:
 * - For ordering to work consistently, the ordered field must exist on docs.
 * - Ensure backfill sets:
 *   - stats.currentSeasonTotalScore (number)
 *   - stats.currentSeasonActivityScores.<activityKey> (number)
 */
export function subscribeLeaderboard(
    args: SubscribeLeaderboardArgs,
    onData: (rows: LeaderboardTeamRow[]) => void,
    onError?: (err: unknown) => void
): Unsubscribe {
    const pageSize = args.pageSize ?? 50;

    const teamsRef = collection(db, "teams");

    const q =
        args.mode === "global"
            ? query(
                teamsRef,
                where("isPublic", "==", true),
                // GLOBAL uses season total (NOT stats.totalScore)
                orderBy("stats.currentSeasonTotalScore", "desc"),
                orderBy("stats.lastUpdated", "desc"),
                limit(pageSize)
            )
            : (() => {
                const activityKey = args.activityKey;
                if (!activityKey) {
                    throw new Error("subscribeLeaderboard(activity): missing activityKey");
                }

                // activityKey must be like "parachute_drop" (no hyphens)
                const fieldPath = `stats.currentSeasonActivityScores.${activityKey}`;

                return query(
                    teamsRef,
                    where("isPublic", "==", true),
                    orderBy(fieldPath, "desc"),
                    orderBy("stats.lastUpdated", "desc"),
                    limit(pageSize)
                );
            })();

    return onSnapshot(
        q,
        (snap) => {
            const rows: LeaderboardTeamRow[] = snap.docs.map((d) => {
                const data = d.data() as TeamDoc;
                const stats = (data.stats ?? {}) as NonNullable<TeamDoc["stats"]>;

                const seasonTotal = getSeasonTotal(stats);
                const activityScores = getSeasonActivityScores(stats);

                return {
                    id: d.id,
                    name: data.name ?? "Unnamed Team",
                    memberCount: safeNum(stats.memberCount, data.members?.length ?? 0),
                    // totalScore in UI = season total
                    totalScore: seasonTotal,
                    lastUpdated: tsToDate((stats as any).lastUpdated ?? null),
                    activityScores,
                };
            });

            onData(rows);
        },
        (err) => {
            if (onError) onError(err);
        }
    );
}

/**
 * Optional: non-realtime fetch (useful for quick tests)
 */
export async function fetchLeaderboard(args: {
    activityKey?: string;
    pageSize?: number;
}): Promise<LeaderboardTeamRow[]> {
    const pageSize = args.pageSize ?? 50;
    const activityKey = args.activityKey;

    const teamsRef = collection(db, "teams");

    const q = !activityKey
        ? query(
            teamsRef,
            where("isPublic", "==", true),
            //  GLOBAL uses season total (NOT stats.totalScore)
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

    return snap.docs.map((d) => {
        const data = d.data() as TeamDoc;
        const stats = (data.stats ?? {}) as NonNullable<TeamDoc["stats"]>;

        const seasonTotal = getSeasonTotal(stats);
        const activityScores = getSeasonActivityScores(stats);

        return {
            id: d.id,
            name: data.name ?? "Unnamed Team",
            memberCount: safeNum(stats.memberCount, data.members?.length ?? 0),
            // totalScore in UI = season total
            totalScore: seasonTotal,
            lastUpdated: tsToDate((stats as any).lastUpdated ?? null),
            activityScores,
        };
    });
}