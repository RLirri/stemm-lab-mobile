import {collection, doc, getDoc, getDocs, orderBy, query, where} from "firebase/firestore";
import {db} from "./firebase";
import type {Activity, ActivityDoc} from "../types/activity";

const colRef = collection(db, "activities");

export async function listActiveActivities(): Promise<Activity[]> {
    // NOTE: Firestore doesn’t support fallback ordering in one query.
    // So we order by 'order' and ensure every activity has it.
    const q = query(colRef, where("isActive", "==", true), orderBy("order", "asc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({id: d.id, ...(d.data() as ActivityDoc)}));
}

export async function getActivityById(activityId: string): Promise<Activity | null> {
    const ref = doc(db, "activities", activityId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return {id: snap.id, ...(snap.data() as ActivityDoc)};
}