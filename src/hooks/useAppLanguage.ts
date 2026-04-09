import {useLanguageContext} from "../providers/LanguageProvider";

export function useAppLanguage() {
    return useLanguageContext();
}