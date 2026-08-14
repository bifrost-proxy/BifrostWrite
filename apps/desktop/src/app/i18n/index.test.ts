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

    it("uses product language instead of literal machine translations", () => {
        useSettingsStore.setState({ appLanguage: "zh-CN" });

        expect(translate("Vault")).toBe("知识库");
        expect(translate("Active agent sessions")).toBe("活跃的智能体会话");
        expect(translate("Composer")).toBe("消息输入框");
        expect(translate("Mermaid preview")).toBe("Mermaid 预览");
        expect(translate("Match case")).toBe("区分大小写");
        expect(translate("Continue last session")).toBe("继续上次会话");
        expect(translate("Reveal in Finder")).toBe("在访达中显示");
        expect(translate("Stacked tabs")).toBe("堆叠标签页");
    });

    it("preserves search syntax while localizing explanations", () => {
        useSettingsStore.setState({ appLanguage: "zh-CN" });

        expect(translate("tag:")).toBe("tag:");
        expect(translate("[status:]")).toBe("[status:]");
        expect(translate('filename matching "draft"')).toBe(
            "文件名匹配“draft”",
        );
        expect(
            translate(
                'excluding tag "archived", content matching "release"',
            ),
        ).toBe("排除标签为“archived”，正文匹配“release”");
    });

    it("localizes dynamic graph and review status text", () => {
        useSettingsStore.setState({ appLanguage: "zh-CN" });

        expect(translate("23 nodes • 41 links visible")).toBe(
            "可见 23 个节点、41 条连线",
        );
        expect(translate("Accept 3 changes")).toBe("接受 3 项变更");
        expect(translate("Image not found: diagram.png")).toBe(
            "找不到图片：diagram.png",
        );
    });
});
