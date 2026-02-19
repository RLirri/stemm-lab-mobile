import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { User } from "firebase/auth";
import { db } from "./firebase";

function detectProvider(user: User): "password" | "google" | "unknown" {
    const ids = user.providerData?.map((p) => p.providerId) ?? [];
    if (ids.includes("password")) return "password";
    if (ids.includes("google.com")) return "google";
    return "unknown";
}

/**
 * Ensures a users/{uid} document exists.
 * - If missing: creates it
 * - If exists: optionally refreshes displayName/email/updatedAt
 */
export async function ensureUserProfile(user: User) {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);

    const baseData = {
        uid: user.uid,
        email: user.email ?? null,
        displayName: user.displayName ?? null,
        provider: detectProvider(user),
        teamId: null as string | null,
    };

    if (!snap.exists()) {
        await setDoc(ref, {
            ...baseData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
        return { created: true };
    }

    // Keep profile in sync (safe update)
    await updateDoc(ref, {
        email: baseData.email,
        displayName: baseData.displayName,
        provider: baseData.provider,
        updatedAt: serverTimestamp(),
    });

    return { created: false };
}
