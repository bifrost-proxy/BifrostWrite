/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updaterApiMocks = vi.hoisted(() => ({
    getAppUpdateConfiguration: vi.fn(),
    checkForAppUpdate: vi.fn(),
    downloadAndInstallAppUpdate: vi.fn(),
}));

vi.mock("./api", () => updaterApiMocks);

import {
    APP_UPDATE_CHECK_INTERVAL_MS,
    startAppUpdateBackgroundChecks,
    useAppUpdateStore,
} from "./store";

const baseStatus = {
    enabled: true,
    currentVersion: "1.1.2",
    channel: "stable",
    endpoint: "https://github.com/bifrost-proxy/BifrostWrite/releases",
    message: null,
    update: null,
};

describe("app update background checks", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        updaterApiMocks.getAppUpdateConfiguration.mockResolvedValue(baseStatus);
        updaterApiMocks.checkForAppUpdate.mockResolvedValue(baseStatus);
        updaterApiMocks.downloadAndInstallAppUpdate.mockResolvedValue(undefined);
        useAppUpdateStore.getState().reset();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
        useAppUpdateStore.getState().reset();
    });

    it("checks at startup and then once per hour until stopped", async () => {
        const stop = startAppUpdateBackgroundChecks();

        await vi.waitFor(() => {
            expect(updaterApiMocks.checkForAppUpdate).toHaveBeenCalledTimes(1);
        });

        await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS);
        expect(updaterApiMocks.checkForAppUpdate).toHaveBeenCalledTimes(2);

        stop();
        await vi.advanceTimersByTimeAsync(APP_UPDATE_CHECK_INTERVAL_MS);
        expect(updaterApiMocks.checkForAppUpdate).toHaveBeenCalledTimes(2);
    });
});
