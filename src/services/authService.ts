import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
} from "firebase/auth";
import {auth} from "./firebase";

export async function registerWithEmail(
    email: string,
    password: string,
    displayName?: string
) {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (displayName?.trim()) {
        await updateProfile(cred.user, {displayName: displayName.trim()});
    }
    return cred.user;
}

export async function loginWithEmail(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
}

export async function logout() {
    await signOut(auth);
}