import { useEffect } from "react";
import {
    useSettingsStore,
    type AppLanguage,
} from "../store/settingsStore";
import { ZH_CN_TRANSLATIONS, translateZhCnPattern } from "./zh-CN";

export type ResolvedAppLanguage = Exclude<AppLanguage, "system">;

export function resolveSystemLanguage(
    languages: readonly string[] =
        typeof navigator === "undefined"
            ? []
            : navigator.languages?.length
              ? navigator.languages
              : [navigator.language],
): ResolvedAppLanguage {
    return languages[0]?.trim().toLowerCase().startsWith("zh")
        ? "zh-CN"
        : "en";
}

export function resolveAppLanguage(
    preference: AppLanguage,
): ResolvedAppLanguage {
    return preference === "system" ? resolveSystemLanguage() : preference;
}

export function translate(source: string): string {
    const preference = useSettingsStore.getState().appLanguage;
    if (resolveAppLanguage(preference) !== "zh-CN") {
        return source;
    }
    return (
        ZH_CN_TRANSLATIONS[source] ?? translateZhCnPattern(source) ?? source
    );
}

export function useAppLanguage(): ResolvedAppLanguage {
    const preference = useSettingsStore((state) => state.appLanguage);
    const language = resolveAppLanguage(preference);

    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    return language;
}
