import AsyncStorage from "@react-native-async-storage/async-storage";
import {getLocales} from "expo-localization";
import {
    DEFAULT_LANGUAGE,
    LANGUAGE_STORAGE_KEY,
    SUPPORTED_LANGUAGES,
    SupportedLanguage,
} from "../constants/language";

function normalizeLanguage(value?: string | null): SupportedLanguage {
    if (!value) return DEFAULT_LANGUAGE;

    const lower = value.toLowerCase();

    if (lower.startsWith("en")) return "en";
    if (lower.startsWith("id")) return "id";
    if (lower.startsWith("zh")) return "zh";

    return DEFAULT_LANGUAGE;
}

export async function getStoredLanguage(): Promise<SupportedLanguage | null> {
    try {
        const value = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        return value ? normalizeLanguage(value) : null;
    } catch (error) {
        console.warn("getStoredLanguage failed:", error);
        return null;
    }
}

export async function persistLanguage(language: SupportedLanguage): Promise<void> {
    try {
        if (!SUPPORTED_LANGUAGES.includes(language)) return;
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch (error) {
        console.warn("persistLanguage failed:", error);
    }
}

export function detectDeviceLanguage(): SupportedLanguage {
    try {
        const locales = getLocales();
        const first = locales?.[0];

        return normalizeLanguage(first?.languageCode ?? first?.languageTag ?? null);
    } catch (error) {
        console.warn("detectDeviceLanguage failed:", error);
        return DEFAULT_LANGUAGE;
    }
}

export async function resolveInitialLanguage(): Promise<SupportedLanguage> {
    const stored = await getStoredLanguage();
    return stored ?? detectDeviceLanguage();
}