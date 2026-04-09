import i18n from "i18next";
import {initReactI18next} from "react-i18next";
import {resources} from "./config";
import {DEFAULT_LANGUAGE} from "../constants/language";

void i18n.use(initReactI18next).init({
    compatibilityJSON: "v4",
    resources,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: "common",
    ns: ["common", "navigation", "activities", "profile"],
    interpolation: {
        escapeValue: false,
    },
    returnNull: false,
});

export default i18n;