import {Timestamp} from "firebase/firestore";

export type TeamStats = {
    totalScore: number;
    memberCount: number;
    lastUpdated: Timestamp | null;
};

export type TeamDoc = {
    name: string;
    code: string;
    isPublic: boolean;
    createdBy: string;

    members: string[];
    memberMap: Record<
        string,
        {
            displayName: string | null;
            email: string | null;
        }
    >;

    stats?: TeamStats;

    createdAt: Timestamp;
    updatedAt?: Timestamp;
};

export type LeaderboardTeamRow = {
    id: string;
    name: string;
    memberCount: number;
    totalScore: number;
    lastUpdated: Date | null;
};