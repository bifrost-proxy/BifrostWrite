/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    isDebugLogEnabled,
    logDebug,
    logError,
    logWarn,
    resetRuntimeLogStateForTests,
} from "./runtimeLog";
type TestRuntimeLogBridge = {
    log: (
        level: "debug" | "warn" | "error",
        scope: string,
        message: string,
        detail?: unknown,
    ) => Promise<void>;
};

function installRuntimeLogBridge(log: TestRuntimeLogBridge["log"]) {
    window.bifrostwriteRuntimeLog = { log };
}

describe("runtimeLog", () => {
    afterEach(() => {
        resetRuntimeLogStateForTests();
        delete window.bifrostwriteRuntimeLog;
        vi.restoreAllMocks();
    });

    it("keeps debug logs disabled until the scope is explicitly enabled", () => {
        const debugSpy = vi
            .spyOn(console, "debug")
            .mockImplementation(() => {});

        logDebug("review", "should stay silent");
        expect(debugSpy).not.toHaveBeenCalled();

        expect(window.__bifrostwriteLogs?.enable("review")).toEqual(["review"]);
        expect(isDebugLogEnabled("review")).toBe(true);

        logDebug("review", "enabled debug log", { ok: true });
        expect(debugSpy).toHaveBeenCalledWith("[review] enabled debug log", {
            ok: true,
        });
    });

    it("deduplicates warn logs when onceKey is reused", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        logWarn("storage", "persist failed", { key: "a" }, { onceKey: "a" });
        logWarn("storage", "persist failed", { key: "a" }, { onceKey: "a" });

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalledWith("[storage] persist failed", {
            key: "a",
        });
    });

    it("does not deduplicate warn logs unless onceKey is provided", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        logWarn("storage", "persist failed", { key: "a" });
        logWarn("storage", "persist failed", { key: "b" });

        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(warnSpy).toHaveBeenNthCalledWith(1, "[storage] persist failed", {
            key: "a",
        });
        expect(warnSpy).toHaveBeenNthCalledWith(2, "[storage] persist failed", {
            key: "b",
        });
    });

    it("forwards warn and error logs to the desktop log bridge", () => {
        const log = vi.fn().mockResolvedValue(undefined);
        installRuntimeLogBridge(log);
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});

        logWarn("storage", "persist failed", { key: "a" });
        logError("runtime", "resume failed", new Error("boom"));

        expect(log).toHaveBeenNthCalledWith(
            1,
            "warn",
            "storage",
            "persist failed",
            {
                key: "a",
            },
        );
        expect(log).toHaveBeenNthCalledWith(
            2,
            "error",
            "runtime",
            "resume failed",
            expect.any(Error),
        );
    });

    it("forwards enabled debug logs to the desktop log bridge", () => {
        const log = vi.fn().mockResolvedValue(undefined);
        installRuntimeLogBridge(log);
        vi.spyOn(console, "debug").mockImplementation(() => {});

        logDebug("review", "hidden debug log");
        expect(log).not.toHaveBeenCalled();

        window.__bifrostwriteLogs?.enable("review");
        logDebug("review", "enabled debug log", { ok: true });

        expect(log).toHaveBeenCalledWith("debug", "review", "enabled debug log", {
            ok: true,
        });
    });
});
