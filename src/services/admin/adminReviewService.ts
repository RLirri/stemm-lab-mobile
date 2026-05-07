import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
} from 'firebase/firestore';

import {db} from '../firebase';
import type {SubmissionDoc} from '../../types/submission';

export type AdminSubmissionItem = SubmissionDoc & {
    id: string;
};

export type AdminTeamItem = Record<string, unknown> & {
    id: string;
};

export async function getRecentAdminSubmissions(
    maxResults = 30,
): Promise<AdminSubmissionItem[]> {
    const submissionsQuery = query(
        collection(db, 'submissions'),
        orderBy('createdAt', 'desc'),
        limit(maxResults),
    );

    const snapshot = await getDocs(submissionsQuery);

    return snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...(documentSnapshot.data() as SubmissionDoc),
    }));
}

export async function getAdminSubmissionDetail(
    submissionId: string,
): Promise<AdminSubmissionItem | null> {
    const submissionRef = doc(db, 'submissions', submissionId);
    const snapshot = await getDoc(submissionRef);

    if (!snapshot.exists()) {
        return null;
    }

    return {
        id: snapshot.id,
        ...(snapshot.data() as SubmissionDoc),
    };
}

export async function getAdminTeams(
    maxResults = 30,
): Promise<AdminTeamItem[]> {
    const teamsQuery = query(
        collection(db, 'teams'),
        limit(maxResults),
    );

    const snapshot = await getDocs(teamsQuery);

    return snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data(),
    }));
}

export async function getAdminTeamDetail(
    teamId: string,
): Promise<AdminTeamItem | null> {
    const teamRef = doc(db, 'teams', teamId);
    const snapshot = await getDoc(teamRef);

    if (!snapshot.exists()) {
        return null;
    }

    return {
        id: snapshot.id,
        ...snapshot.data(),
    };
}