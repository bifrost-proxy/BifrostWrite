import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
    WebviewWindow,
    getAllWebviewWindows,
    getCurrentWebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { BifrostWriteRuntime } from "./types";

export const tauriRuntime = {
    name: "tauri",
    invoke<T>(command: string, args?: Record<string, unknown>) {
        return tauriInvoke<T>("backend_invoke", { command, args: args ?? {} });
    },
    listen,
    emitTo,
    open,
    confirm,
    openPath,
    revealItemInDir,
    openUrl,
    getCurrentWindow,
    getCurrentWebview,
    getCurrentWebviewWindow,
    getAllWebviewWindows,
    WebviewWindow,
    LogicalPosition,
} as unknown as BifrostWriteRuntime;
