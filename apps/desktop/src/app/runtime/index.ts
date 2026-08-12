import { tauriRuntime } from "./tauriRuntime";
import type {
    ConfirmDialogOptions,
    BifrostWriteRuntime,
    OpenDialogOptions,
    RuntimeEventHandler,
    RuntimeLogicalPosition,
    RuntimeWebviewWindow,
    RuntimeWindow,
    RuntimeWebview,
    UnlistenFn,
} from "./types";

export type {
    ConfirmDialogOptions,
    BifrostWriteRuntime,
    OpenDialogOptions,
    RuntimeDragDropEvent,
    RuntimeDragDropPayload,
    RuntimeEvent,
    RuntimeEventHandler,
    RuntimeLogicalPosition,
    RuntimeWebviewWindow,
    RuntimeWindow,
    RuntimeWebview,
    UnlistenFn,
    Update,
} from "./types";
export { createTestRuntime } from "./testRuntime";

declare global {
    interface Window {
        __TAURI_INTERNALS__?: unknown;
        bifrostwriteRuntimeLog?: {
            log?: (
                level: "debug" | "warn" | "error",
                scope: string,
                message: string,
                detail?: unknown,
            ) => Promise<void>;
        };
    }
}

function selectRuntime(): BifrostWriteRuntime {
    if (typeof window === "undefined") {
        throw new Error(
            "BifrostWrite desktop runtime is only available in a browser window.",
        );
    }

    if (!window.__TAURI_INTERNALS__) {
        throw new Error(
            'BifrostWrite desktop APIs are only available inside Tauri. Start the app with "npm run dev" or use "npm run renderer:dev" only for renderer-focused work.',
        );
    }

    return tauriRuntime;
}

export const runtime = selectRuntime();
export const runtimeName = runtime.name;

export function invoke<T>(
    command: string,
    args?: Record<string, unknown>,
): Promise<T> {
    return runtime.invoke<T>(command, args);
}

export function listen<T>(
    eventName: string,
    handler: RuntimeEventHandler<T>,
): Promise<UnlistenFn> {
    return runtime.listen(eventName, handler);
}

export function emitTo<T>(
    targetLabel: string,
    eventName: string,
    payload: T,
): Promise<void> {
    return runtime.emitTo(targetLabel, eventName, payload);
}

export function open(
    options: OpenDialogOptions & { multiple: true },
): Promise<string[] | null>;
export function open(
    options?: OpenDialogOptions & { multiple?: false },
): Promise<string | null>;
export function open(
    options?: OpenDialogOptions,
): Promise<string | string[] | null> {
    return runtime.open(options);
}

export function confirm(
    message: string,
    options?: ConfirmDialogOptions,
): Promise<boolean> {
    return runtime.confirm(message, options);
}

export function openPath(path: string): Promise<void> {
    return runtime.openPath(path);
}

export function revealItemInDir(path: string): Promise<void> {
    return runtime.revealItemInDir(path);
}

export function openUrl(url: string): Promise<void> {
    return runtime.openUrl(url);
}

export function getCurrentWindow(): RuntimeWindow {
    return runtime.getCurrentWindow();
}

export function getCurrentWebview(): RuntimeWebview {
    return runtime.getCurrentWebview();
}

export function getCurrentWebviewWindow(): RuntimeWindow {
    return runtime.getCurrentWebviewWindow();
}

export function getAllWebviewWindows(): Promise<RuntimeWindow[]> {
    return runtime.getAllWebviewWindows();
}

export type WebviewWindow = RuntimeWebviewWindow;
export const WebviewWindow = runtime.WebviewWindow;

export type LogicalPosition = RuntimeLogicalPosition;
export const LogicalPosition = runtime.LogicalPosition;
