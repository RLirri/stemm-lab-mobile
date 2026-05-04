import {
    collection,
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

    return snapshot.docs.map((document) => ({
        id: document.id,
        ...(document.data() as SubmissionDoc),
    }));
}