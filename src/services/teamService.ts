import {
    collection,
    doc,
    setDoc,
    updateDoc,
    serverTimestamp,
    getDocs,
    query,
    where,
    arrayUnion,
} from "firebase/firestore";
import { db } from "./firebase";

function generateTeamCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function createTeam(
    name: string,
    uid: string,
    displayName: string | null,
    email: string | null
) {
    const teamRef = doc(collection(db, "teams"));
    const code = generateTeamCode();

    await setDoc(teamRef, {
        name,
        code,
        isPublic: true,
        createdBy: uid,
        members: [uid],
        memberMap: {
            [uid]: { displayName, email },
        },
        createdAt: serverTimestamp(),
    });

    await updateDoc(doc(db, "users", uid), { teamId: teamRef.id });

    return { teamId: teamRef.id, code };
}

export async function joinTeamByCode(
    code: string,
    uid: string,
    displayName: string | null,
    email: string | null
) {
    const q = query(collection(db, "teams"), where("code", "==", code.toUpperCase()));
    const snap = await getDocs(q);

    if (snap.empty) throw new Error("Team not found");

    const teamId = snap.docs[0].id;

    await updateDoc(doc(db, "teams", teamId), {
        members: arrayUnion(uid),
        [`memberMap.${uid}`]: { displayName, email },
    });

    await updateDoc(doc(db, "users", uid), { teamId });

    return teamId;
}

import { arrayRemove, deleteField } from "firebase/firestore";

export async function leaveTeam(teamId: string, uid: string) {
    await updateDoc(doc(db, "teams", teamId), {
        members: arrayRemove(uid),
        [`memberMap.${uid}`]: deleteField(),
    });

    await updateDoc(doc(db, "users", uid), {
        teamId: null,
    });
}


export async function joinTeamById(
    teamId: string,
    uid: string,
    displayName: string | null,
    email: string | null
) {
    await updateDoc(doc(db, "teams", teamId), {
        members: arrayUnion(uid),
        [`memberMap.${uid}`]: { displayName, email },
    });

    await updateDoc(doc(db, "users", uid), { teamId });

    return teamId;
}
