import React from "react";
import {Pressable, StyleSheet, Text, View} from "react-native";
import {useTranslation} from "react-i18next";
import {SupportedLanguage} from "../../constants/language";
import {useAppLanguage} from "../../hooks/useAppLanguage";

const LANGUAGES: SupportedLanguage[] = ["en", "id", "zh"];

export default function LanguageSwitcher() {
    const {t} = useTranslation(["profile"]);
    const {language, setLanguage} = useAppLanguage();

    const labelMap: Record<SupportedLanguage, string> = {
        en: t("profile:labels.english"),
        id: t("profile:labels.indonesian"),
        zh: t("profile:labels.chinese"),
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{t("profile:languageTitle")}</Text>
            <Text style={styles.description}>{t("profile:languageDescription")}</Text>

            <View style={styles.row}>
                {LANGUAGES.map((option) => {
                    const active = option === language;

                    return (
                        <Pressable
                            key={option}
                            onPress={() => void setLanguage(option)}
                            style={[styles.chip, active && styles.chipActive]}
                        >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                {labelMap[option]}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 18,
    },
    title: {
        fontSize: 16,
        fontWeight: "700",
    },
    description: {
        marginTop: 6,
        opacity: 0.7,
        lineHeight: 18,
    },
    row: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 10,
    },
    chip: {
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: "white",
    },
    chipActive: {
        backgroundColor: "#111",
        borderColor: "#111",
    },
    chipText: {
        fontWeight: "700",
    },
    chipTextActive: {
        color: "white",
    },
});