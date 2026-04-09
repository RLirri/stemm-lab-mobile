import React, {createContext, useContext, useEffect, useMemo, useState} from "react";
import i18n from "../i18n";
import {DEFAULT_LANGUAGE, SupportedLanguage} from "../constants/language";
import {persistLanguage, resolveInitialLanguage} from "../services/languageService";

type LanguageContextValue = {
    language: SupportedLanguage;
    isReady: boolean;
    setLanguage: (language: SupportedLanguage) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({children}: React.PropsWithChildren) {
    const [language, setLanguageState] = useState<SupportedLanguage>(DEFAULT_LANGUAGE);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        let mounted = true;

        async function bootstrap() {
            try {
                const initialLanguage = await resolveInitialLanguage();
                await i18n.changeLanguage(initialLanguage);

                if (!mounted) return;
                setLanguageState(initialLanguage);
            } catch (error) {
                console.warn("LanguageProvider bootstrap failed:", error);

                if (!mounted) return;
                setLanguageState(DEFAULT_LANGUAGE);
            } finally {
                if (mounted) setIsReady(true);
            }
        }

        void bootstrap();

        return () => {
            mounted = false;
        };
    }, []);

    async function setLanguage(nextLanguage: SupportedLanguage) {
        if (nextLanguage === language) return;

        try {
            await i18n.changeLanguage(nextLanguage);
            await persistLanguage(nextLanguage);
            setLanguageState(nextLanguage);
        } catch (error) {
            console.warn("setLanguage failed:", error);
        }
    }

    const value = useMemo<LanguageContextValue>(
        () => ({
            language,
            isReady,
            setLanguage,
        }),
        [language, isReady]
    );

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguageContext(): LanguageContextValue {
    const context = useContext(LanguageContext);

    if (!context) {
        throw new Error("useLanguageContext must be used within LanguageProvider");
    }

    return context;
}