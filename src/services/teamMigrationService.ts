import {
    collection,
    doc,
    getDocs,
    serverTimestamp,
    writeBatch,
    type DocumentData,
} from "firebase/firestore";
import {db} from "./firebase";

function safeNum(x: unknown, fallback = 0): number {
    return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function isObject(x: unknown): x is Record<string, unknown> {
    return !!x && typeof x === "object" && !Array.isArray(x);
}

/**
 * Backfill team stats fields for leaderboard seasons/activity tabs.
 * Every team has:
 *  - stats.totalScore (number)
 *  - stats.memberCount (number)
 *  - stats.lastUpdated (timestamp)
 *  - stats.currentSeasonTotalScore (number)
 *  - stats.currentSeasonActivityScores (map)
 *  - stats.currentSeasonActivityScores.parachute_drop (number)
 */
export async function backfillTeamStats(): Promise<{ scanned: number; updated: number }> {
    const teamsRef = collection(db, "teams");
    const snap = await getDocs(teamsRef);

    const batch = writeBatch(db);

    let scanned = 0;
    let updated = 0;

    snap.forEach((teamDoc) => {
        scanned += 1;

        const data = teamDoc.data() as DocumentData;
        const stats = (data.stats ?? {}) as Record<string, unknown>;

        const members = Array.isArray(data.members) ? (data.members as unknown[]) : [];
        const memberCountFallback = members.length;

        const totalScore = safeNum(stats.totalScore, 0);
        const memberCount = safeNum(stats.memberCount, memberCountFallback);

        const currentSeasonTotalScore = safeNum(stats.currentSeasonTotalScore, totalScore);

        const curActScoresRaw = stats.currentSeasonActivityScores;
        const curActScores = isObject(curActScoresRaw) ? curActScoresRaw : {};

        // IMPORTANT: use underscore key (no hyphen) so field paths are safe
        const parachuteDrop = safeNum(curActScores["parachute_drop"], 0);

        // Determine if we need to update anything
        const needs =
            stats.totalScore == null ||
            stats.memberCount == null ||
            stats.lastUpdated == null ||
            stats.currentSeasonTotalScore == null ||
            !isObject(stats.currentSeasonActivityScores) ||
            curActScores["parachute_drop"] == null;

        if (!needs) return;

        const ref = doc(db, "teams", teamDoc.id);

        batch.update(ref, {
            "stats.totalScore": totalScore,
            "stats.memberCount": memberCount,

            "stats.lastUpdated": stats.lastUpdated ?? serverTimestamp(),

            "stats.currentSeasonTotalScore": currentSeasonTotalScore,
            "stats.currentSeasonActivityScores": {
                ...curActScores,
                parachute_drop: parachuteDrop,
            },

            updatedAt: serverTimestamp(),
        });

        updated += 1;
    });

    if (updated > 0) {
        await batch.commit();
    }

    return {scanned, updated};
}