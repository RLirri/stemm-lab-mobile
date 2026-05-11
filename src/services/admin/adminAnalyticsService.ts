import {collection, getCountFromServer, query, where} from 'firebase/firestore';

import {db} from '../firebase';
import {activityCatalog} from '../../features/activities/activityCatalog';

export type AdminAnalyticsSnapshot = {
    totalActivities: number;
    totalSubmissions: number;
    totalTeams: number;
    submissionsByActivity: {
        activityId: string;
        title: string;
        count: number;
    }[];
};

export async function getAdminAnalyticsSnapshot(): Promise<AdminAnalyticsSnapshot> {
    const submissionsCountSnapshot = await getCountFromServer(collection(db, 'submissions'));
    const teamsCountSnapshot = await getCountFromServer(collection(db, 'teams'));

    const submissionsByActivity = await Promise.all(
        activityCatalog.map(async (activity) => {
            const activitySubmissionsQuery = query(
                collection(db, 'submissions'),
                where('activityId', '==', activity.id),
            );

            const countSnapshot = await getCountFromServer(activitySubmissionsQuery);

            return {
                activityId: activity.id,
                title: activity.title,
                count: countSnapshot.data().count,
            };
        }),
    );

    return {
        totalActivities: activityCatalog.length,
        totalSubmissions: submissionsCountSnapshot.data().count,
        totalTeams: teamsCountSnapshot.data().count,
        submissionsByActivity,
    };
}