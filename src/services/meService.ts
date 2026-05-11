import {doc, getDoc} from "firebase/firestore";
import {auth, db} from "./firebase";

export async function getMyTeamId(): Promise<string | null> {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;

    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;

    const data = snap.data() as any;
    return data.teamId ?? null;
}