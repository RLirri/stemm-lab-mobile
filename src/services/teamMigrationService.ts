import {collection, doc, getDocs, serverTimestamp, updateDoc} from "firebase/firestore";
import {db} from "./firebase";

export async function backfillTeamStats(): Promise<{ updated: number; scanned: number }> {
    const snap = await getDocs(collection(db, "teams"));
    let updated = 0;

    for (const d of snap.docs) {
        const team = d.data() as any;
        const members = Array.isArray(team.members) ? team.members : [];
        const stats = team.stats ?? {};

        const patch: Record<string, any> = {};
        let needUpdate = false;

        if (typeof stats.memberCount !== "number") {
            patch["stats.memberCount"] = members.length;
            needUpdate = true;
        }

        if (typeof stats.totalScore !== "number") {
            patch["stats.totalScore"] = 0;
            needUpdate = true;
        }

        if (!stats.lastUpdated) {
            patch["stats.lastUpdated"] = serverTimestamp();
            needUpdate = true;
        }

        if (!team.updatedAt) {
            patch["updatedAt"] = serverTimestamp();
            needUpdate = true;
        }

        if (needUpdate) {
            await updateDoc(doc(db, "teams", d.id), patch);
            updated += 1;
        }
    }

    return {updated, scanned: snap.size};
}