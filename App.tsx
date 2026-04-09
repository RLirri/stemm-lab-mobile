import React from "react";
import "./src/i18n";
import RootNavigator from "./src/navigation/RootNavigator";
import {LanguageProvider} from "./src/providers/LanguageProvider";

export default function App() {
    return (
        <LanguageProvider>
            <RootNavigator/>
        </LanguageProvider>
    );
}