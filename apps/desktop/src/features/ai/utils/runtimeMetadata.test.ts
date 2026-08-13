import { describe, expect, it } from "vitest";
import {
    buildFallbackRuntimeDescriptors,
    getRuntimeDisplayName,
    PROVIDER_CATALOG,
} from "./runtimeMetadata";

describe("runtimeMetadata", () => {
    it("limits the provider catalog to Codex and Claude agents", () => {
        expect(PROVIDER_CATALOG.map(({ id }) => id)).toEqual([
            "codex-acp",
            "claude-acp",
            "claude-code-terminal",
        ]);
    });

    it("builds fallback descriptors only for supported ACP runtimes", () => {
        const descriptors = buildFallbackRuntimeDescriptors();
        expect(descriptors.map(({ runtime }) => runtime.id)).toEqual([
            "codex-acp",
            "claude-acp",
        ]);
    });

    it("only advertises native resume in fallback descriptors for verified runtimes", () => {
        const descriptors = buildFallbackRuntimeDescriptors();
        const resumeRuntimeIds = descriptors
            .filter((descriptor) =>
                descriptor.runtime.capabilities.includes("resume_session"),
            )
            .map((descriptor) => descriptor.runtime.id);

        expect(resumeRuntimeIds).toEqual(["codex-acp"]);
    });

    it("normalizes runtime display names for the UI", () => {
        expect(getRuntimeDisplayName("codex-acp", "Codex ACP")).toBe("Codex");
        expect(getRuntimeDisplayName("claude-acp")).toBe("Claude");
        expect(getRuntimeDisplayName("grok-acp")).toBe("grok-acp");
        expect(getRuntimeDisplayName(undefined, undefined)).toBe("Assistant");
    });
});
