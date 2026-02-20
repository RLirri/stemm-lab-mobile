import {doc, runTransaction, serverTimestamp} from "firebase/firestore";
import {db} from "./firebase";

/**
 * DEV ONLY: client-side score updates are not cheat-proof.
 * Use only for v1 testing until Cloud Functions owns scoring.
 */
export async function incrementTeamScore(teamId: string, delta: number) {
    if (!teamId) throw new Error("teamId is required");
    if (!Number.isFinite(delta)) throw new Error("delta must be a number");

    const ref = doc(db, "teams", teamId);

    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Team not found");

        const data = snap.data() as any;
        const current = Number(data?.stats?.totalScore ?? 0);
        const next = Math.max(0, current + delta);

        tx.update(ref, {
            "stats.totalScore": next,
            "stats.lastUpdated": serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    });
}