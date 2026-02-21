import type {ActivityDoc} from "../../../types/activity";

/**
 * Deterministic Firestore document IDs make seeding/upserts easy and debuggable.
 * We omit server-managed timestamps here; seeder will set them.
 */
export type ActivityDefinition = Omit<ActivityDoc, "createdAt" | "updatedAt"> & {
    id: string;
};