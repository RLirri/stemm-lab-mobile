import {Timestamp} from "firebase/firestore";

export type TeamStats = {
    totalScore: number;
    memberCount: number;
    lastUpdated: Timestamp | null;
};

export type TeamDoc = {
    name: string;
    isPublic: boolean;
    createdBy: string;
    members?: string[];
    memberMap?: Record<string, { displayName?: string; email?: string }>;
    stats?: {
        memberCount?: number;
        totalScore?: number;
        lastUpdated?: any;
        currentSeasonTotalScore?: number;
        currentSeasonActivityScores?: Record<string, number>;
    };
    createdAt?: any;
    updatedAt?: any;
};

export type LeaderboardTeamRow = {
    id: string;
    name: string;
    memberCount: number;
    totalScore: number;
    lastUpdated: Date | null;
    activityScores?: Record<string, number>;
};