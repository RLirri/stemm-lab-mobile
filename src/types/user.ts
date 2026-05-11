export type UserProfile = {
    uid: string;
    email: string | null;
    displayName: string | null;
    provider: "password" | "google" | "unknown";
    teamId: string | null;
    createdAt: Date; // we’ll store serverTimestamp in Firestore, but in TS we keep Date
    updatedAt: Date;
};
