import {
    arrayRemove,
    arrayUnion,
    collection,
    deleteField,
    doc,
    getDoc,
    getDocs,
    query,
    runTransaction,
    serverTimestamp,
    where,
} from "firebase/firestore";
import {db} from "./firebase";

function generateTeamCode(): string {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function assertUserNotInTeam(uid: string) {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    const teamId = userSnap.exists() ? (userSnap.data() as any).teamId : null;
    if (teamId) throw new Error("You are already in a team. Leave your current team first.");
}

export async function createTeam(
    name: string,
    uid: string,
    displayName: string | null,
    email: string | null
) {
    await assertUserNotInTeam(uid);

    const teamRef = doc(collection(db, "teams"));
    const code = generateTeamCode();
    const userRef = doc(db, "users", uid);

    await runTransaction(db, async (tx) => {
        // ensure user exists
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error("User profile not found. Please re-login.");

        tx.set(teamRef, {
            name,
            code,
            isPublic: true,
            createdBy: uid,

            members: [uid],
            memberMap: {
                [uid]: {displayName, email},
            },

            stats: {
                totalScore: 0,
                memberCount: 1,
                lastUpdated: serverTimestamp(),
            },

            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        tx.update(userRef, {teamId: teamRef.id, updatedAt: serverTimestamp()});
    });

    return {teamId: teamRef.id, code};
}

export async function joinTeamByCode(
    code: string,
    uid: string,
    displayName: string | null,
    email: string | null
) {
    await assertUserNotInTeam(uid);

    const q = query(collection(db, "teams"), where("code", "==", code.toUpperCase()));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error("Team not found");

    const teamDoc = snap.docs[0];
    return joinTeamById(teamDoc.id, uid, displayName, email);
}

export async function joinTeamById(
    teamId: string,
    uid: string,
    displayName: string | null,
    email: string | null
) {
    await assertUserNotInTeam(uid);

    const teamRef = doc(db, "teams", teamId);
    const userRef = doc(db, "users", uid);

    await runTransaction(db, async (tx) => {
        const [teamSnap, userSnap] = await Promise.all([tx.get(teamRef), tx.get(userRef)]);
        if (!teamSnap.exists()) throw new Error("Team not found");
        if (!userSnap.exists()) throw new Error("User profile not found. Please re-login.");

        const team = teamSnap.data() as any;

        // If user already in members (edge case), block.
        if (Array.isArray(team.members) && team.members.includes(uid)) {
            throw new Error("You are already in this team.");
        }

        const currentCount =
            Number(team?.stats?.memberCount) ||
            (Array.isArray(team.members) ? team.members.length : 0);

        tx.update(teamRef, {
            members: arrayUnion(uid),
            [`memberMap.${uid}`]: {displayName, email},
            "stats.memberCount": currentCount + 1,
            updatedAt: serverTimestamp(),
        });

        tx.update(userRef, {teamId, updatedAt: serverTimestamp()});
    });

    return teamId;
}

export async function leaveTeam(teamId: string, uid: string) {
    const teamRef = doc(db, "teams", teamId);
    const userRef = doc(db, "users", uid);

    await runTransaction(db, async (tx) => {
        const [teamSnap, userSnap] = await Promise.all([tx.get(teamRef), tx.get(userRef)]);
        if (!teamSnap.exists()) throw new Error("Team not found");
        if (!userSnap.exists()) throw new Error("User profile not found. Please re-login.");

        const team = teamSnap.data() as any;
        const members: string[] = Array.isArray(team.members) ? team.members : [];

        if (!members.includes(uid)) {
            // already left - idempotent safety
            tx.update(userRef, {teamId: null, updatedAt: serverTimestamp()});
            return;
        }

        const currentCount =
            Number(team?.stats?.memberCount) ||
            (Array.isArray(team.members) ? team.members.length : 0);

        const nextCount = Math.max(0, currentCount - 1);

        tx.update(teamRef, {
            members: arrayRemove(uid),
            [`memberMap.${uid}`]: deleteField(),
            "stats.memberCount": nextCount,
            updatedAt: serverTimestamp(),
        });

        tx.update(userRef, {teamId: null, updatedAt: serverTimestamp()});
    });
}