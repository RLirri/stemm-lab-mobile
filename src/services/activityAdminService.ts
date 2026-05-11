import {doc, serverTimestamp, setDoc} from "firebase/firestore";
import {db} from "./firebase";
import type {ActivityDefinition} from "../features/activities/definitions/types";

/**
 * Upsert activity by deterministic ID.
 * merge:true makes it safe to re-run for iteration/debugging.
 */
export async function upsertActivity(def: ActivityDefinition) {
    const ref = doc(db, "activities", def.id);

    await setDoc(
        ref,
        {
            ...def,
            updatedAt: serverTimestamp(),
            // For v1 seeding simplicity, we set createdAt too.
            // If you want createdAt to never change after the first seed, tell me and I’ll upgrade this to preserve it.
            createdAt: serverTimestamp(),
        },
        {merge: true}
    );
}

export async function seedActivities(defs: ActivityDefinition[]) {
    let upserted = 0;

    for (const def of defs) {
        await upsertActivity(def);
        upserted += 1;
    }

    return {upserted};
}