import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: "jsdom",
            globals: true,
            setupFiles: "./src/test/setup.ts",
            clearMocks: true,
            restoreMocks: true,
            css: true,
            include: [
                "src/**/*.test.ts",
                "src/**/*.test.tsx",
                "scripts/codex-v8-artifacts.test.mjs",
                "scripts/packaged-sidecar-isolation.test.mjs",
                "scripts/stage-native-runtime-assets.test.mjs",
            ],
            exclude: [
            ],
        },
    }),
);
