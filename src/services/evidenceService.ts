import * as ImagePicker from "expo-image-picker";
import {getDownloadURL, getStorage, ref, uploadBytes} from "firebase/storage";
import {auth} from "./firebase";

export type PickedVideo = {
    uri: string;
    mimeType?: string;
    fileName?: string;
};

export type UploadResult = {
    storagePath: string;
    downloadURL: string;
    contentType?: string;
};

function ensureSignedIn() {
    if (!auth.currentUser) throw new Error("Not signed in.");
}

async function ensureMediaLibraryPermission() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error("Media library permission denied.");
}

async function ensureCameraPermission() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Camera permission denied.");
}

function toPickedVideo(asset: ImagePicker.ImagePickerAsset): PickedVideo {
    if (!asset?.uri) throw new Error("No video URI returned by picker.");
    return {
        uri: asset.uri,
        mimeType: asset.mimeType ?? "video/mp4",
        fileName: asset.fileName ?? undefined,
    };
}

/**
 * Pick an existing video from library (works in emulator if media exists).
 */
export async function pickVideoFromLibrary(): Promise<PickedVideo | null> {
    ensureSignedIn();
    await ensureMediaLibraryPermission();

    const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
    });

    if (res.canceled) return null;
    const asset = res.assets?.[0];
    if (!asset) throw new Error("No asset returned.");
    return toPickedVideo(asset);
}

/**
 * Record a video with camera (best tested on a real device).
 */
export async function recordVideoWithCamera(): Promise<PickedVideo | null> {
    ensureSignedIn();
    await ensureCameraPermission();

    const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
    });

    if (res.canceled) return null;
    const asset = res.assets?.[0];
    if (!asset) throw new Error("No asset returned.");
    return toPickedVideo(asset);
}

async function uriToBlob(uri: string): Promise<Blob> {
    const r = await fetch(uri);
    return await r.blob();
}

/**
 * Upload a video URI to Firebase Storage.
 * NOTE: Requires Firebase Storage to be enabled + rules allow this path.
 */
export async function uploadVideoToStorage(args: {
    uri: string;
    storagePath: string;
    contentType?: string;
}): Promise<UploadResult> {
    ensureSignedIn();

    const storage = getStorage();
    const blob = await uriToBlob(args.uri);

    const contentType = args.contentType ?? "video/mp4";
    const storageRef = ref(storage, args.storagePath);

    await uploadBytes(storageRef, blob, {contentType});
    const downloadURL = await getDownloadURL(storageRef);

    return {storagePath: args.storagePath, downloadURL, contentType};
}