import { afterEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "../store/settingsStore";
import {
    resolveAppLanguage,
    resolveSystemLanguage,
    translate,
} from ".";

describe("application i18n", () => {
    afterEach(() => {
        useSettingsStore.setState({ appLanguage: "system" });
    });

    it("uses Chinese only when the primary system language is Chinese", () => {
        expect(resolveSystemLanguage(["zh-CN", "en-US"])).toBe("zh-CN");
        expect(resolveSystemLanguage(["zh-Hant-TW"])).toBe("zh-CN");
        expect(resolveSystemLanguage(["en-US", "zh-CN"])).toBe("en");
        expect(resolveSystemLanguage(["fr-FR"])).toBe("en");
    });

    it("allows an explicit language to override the system", () => {
        expect(resolveAppLanguage("en")).toBe("en");
        expect(resolveAppLanguage("zh-CN")).toBe("zh-CN");
    });

    it("translates known UI text and preserves unknown text", () => {
        useSettingsStore.setState({ appLanguage: "zh-CN" });

        expect(translate("Settings")).toBe("设置");
        expect(translate("Remove Demo from Recents")).toBe(
            "从最近使用中移除 Demo",
        );
        expect(translate("Loading Codex...")).toBe("正在加载 Codex…");
        expect(translate("User-authored note title")).toBe(
            "User-authored note title",
        );

        useSettingsStore.setState({ appLanguage: "en" });
        expect(translate("Settings")).toBe("Settings");
    });
});
