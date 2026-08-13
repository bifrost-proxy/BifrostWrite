import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    disposeThemeStoreRuntime,
    initializeThemeStore,
    useThemeStore,
} from "./themeStore";
import { useVaultStore } from "./vaultStore";

describe("themeStore global persistence", () => {
    beforeEach(() => {
        disposeThemeStoreRuntime();
        initializeThemeStore();
        useVaultStore.setState((state) => ({
            ...state,
            vaultPath: null,
            isLoading: false,
            vaultOpenState: {
                ...state.vaultOpenState,
                path: null,
                stage: "idle",
            },
        }));
    });

    afterEach(() => {
        disposeThemeStoreRuntime();
    });

    it("persists theme globally across all vaults", () => {
        useThemeStore.getState().setThemeName("nord");
        useThemeStore.getState().setMode("dark");

        expect(useThemeStore.getState()).toMatchObject({
            themeName: "nord",
            mode: "dark",
            isDark: true,
        });
    });

    it("changing theme updates isDark correctly", () => {
        useThemeStore.getState().setMode("light");
        expect(useThemeStore.getState().isDark).toBe(false);

        useThemeStore.getState().setMode("dark");
        expect(useThemeStore.getState().isDark).toBe(true);
    });

    it("synchronizes native window chrome with the selected palette", () => {
        const runtimeWindow = (
            globalThis as typeof globalThis & {
                __mockCurrentWindow: {
                    setTheme: ReturnType<typeof vi.fn>;
                    setBackgroundColor: ReturnType<typeof vi.fn>;
                };
            }
        ).__mockCurrentWindow;

        useThemeStore.getState().setThemeName("nord");
        useThemeStore.getState().setMode("dark");

        expect(runtimeWindow.setTheme).toHaveBeenLastCalledWith("dark");
        expect(runtimeWindow.setBackgroundColor).toHaveBeenLastCalledWith(
            "#2e3440",
        );
    });

    it("forces light native chrome when the system theme is dark", () => {
        disposeThemeStoreRuntime();
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: query === "(prefers-color-scheme: dark)",
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
        localStorage.setItem(
            "bifrostwrite:theme",
            JSON.stringify({ mode: "light", themeName: "ocean" }),
        );

        initializeThemeStore();

        const runtimeWindow = (
            globalThis as typeof globalThis & {
                __mockCurrentWindow: {
                    setTheme: ReturnType<typeof vi.fn>;
                    setBackgroundColor: ReturnType<typeof vi.fn>;
                };
            }
        ).__mockCurrentWindow;
        expect(useThemeStore.getState()).toMatchObject({
            mode: "light",
            themeName: "ocean",
            isDark: false,
        });
        expect(runtimeWindow.setTheme).toHaveBeenLastCalledWith("light");
        expect(runtimeWindow.setBackgroundColor).toHaveBeenLastCalledWith(
            "#f8fafc",
        );
    });

    it("keeps the opening vault theme during transient loading state", () => {
        localStorage.setItem(
            "bifrostwrite:theme",
            JSON.stringify({ mode: "light", themeName: "rose" }),
        );
        localStorage.setItem(
            "bifrostwrite:theme:/vaults/work",
            JSON.stringify({ mode: "dark", themeName: "nord" }),
        );

        useVaultStore.setState((state) => ({
            ...state,
            vaultPath: null,
            isLoading: true,
            vaultOpenState: {
                ...state.vaultOpenState,
                path: "/vaults/work",
                stage: "scanning",
            },
        }));

        expect(useThemeStore.getState()).toMatchObject({
            themeName: "nord",
            mode: "dark",
            isDark: true,
        });
    });
});
