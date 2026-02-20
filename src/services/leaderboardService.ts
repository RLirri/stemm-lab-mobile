import {
    collection,
    getDocs,
    limit,
    orderBy,
    query,
    where,
    Timestamp,
} from "firebase/firestore";


import {db} from "./firebase";
import type {LeaderboardTeamRow, TeamDoc} from "../types/team";

function tsToDate(ts?: Timestamp | null): Date | null {
    if (!ts) return null;
    return ts.toDate();
}

export async function fetchGlobalLeaderboard(pageSize = 30): Promise<LeaderboardTeamRow[]> {
    const teamsRef = collection(db, "teams");

    const q = query(
        teamsRef,
        where("isPublic", "==", true),
        orderBy("stats.totalScore", "desc"),
        orderBy("stats.lastUpdated", "desc"),
        limit(pageSize)
    );

    const snap = await getDocs(q);

    return snap.docs.map((d) => {
        const data = d.data() as TeamDoc;

        const stats = data.stats ?? {
            totalScore: 0,
            memberCount: data.members?.length ?? 0,
            lastUpdated: null,
        };

        return {
            id: d.id,
            name: data.name ?? "Unnamed Team",
            memberCount: stats.memberCount ?? 0,
            totalScore: stats.totalScore ?? 0,
            lastUpdated: tsToDate(stats.lastUpdated),
        };
    });
}