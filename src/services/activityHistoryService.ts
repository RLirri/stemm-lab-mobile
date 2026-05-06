import {
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    where,
} from 'firebase/firestore';

import {auth, db} from './firebase';
import type {SubmissionDoc} from '../types/submission';

export type ActivityHistoryItem = SubmissionDoc & {
    id: string;
};

export type ActivityHistoryDetail = ActivityHistoryItem;

export async function getUserActivityHistory(): Promise<ActivityHistoryItem[]> {
    const user = auth.currentUser;

    if (!user) {
        return [];
    }

    const submissionsQuery = query(
        collection(db, 'submissions'),
        where('createdBy', '==', user.uid),
        orderBy('createdAt', 'desc'),
    );

    const snapshot = await getDocs(submissionsQuery);

    return snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...(documentSnapshot.data() as SubmissionDoc),
    }));
}

export async function getActivityHistoryDetail(
    submissionId: string,
): Promise<ActivityHistoryDetail | null> {
    if (!submissionId) {
        return null;
    }

    const submissionRef = doc(db, 'submissions', submissionId);
    const submissionSnapshot = await getDoc(submissionRef);

    if (!submissionSnapshot.exists()) {
        return null;
    }

    return {
        id: submissionSnapshot.id,
        ...(submissionSnapshot.data() as SubmissionDoc),
    };
}