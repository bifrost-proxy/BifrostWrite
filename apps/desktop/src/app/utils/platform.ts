export type DesktopPlatform = "macos" | "windows" | "linux";

export const WINDOW_CHROME_BAR_HEIGHT = 34;
export const WINDOW_CHROME_CONTROL_SIZE = 26;

export interface WindowChromeLayout {
    platform: DesktopPlatform;
    leadingInsetWidth: number;
    titlebarPaddingTop: number;
    windowControlsSide: "left" | "right";
}

export interface ManagedWindowChromeOptions {
    decorations?: boolean;
    titleBarStyle?: "overlay";
    hiddenTitle?: boolean;
    trafficLightPosition?: { x: number; y: number };
}

export function getDesktopPlatform(): DesktopPlatform {
    if (typeof navigator === "undefined") return "macos";

    const platformHints = [
        navigator.userAgent,
        navigator.platform,
        // userAgentData is not typed consistently across environments.
        (navigator as Navigator & { userAgentData?: { platform?: string } })
            .userAgentData?.platform,
    ]
        .filter((value): value is string => typeof value === "string")
        .join(" ");

    if (/windows/i.test(platformHints)) return "windows";
    if (/linux|x11|wayland/i.test(platformHints)) return "linux";
    return "macos";
}

/**
 * Synchronous macOS version detection from WKWebView user-agent.
 * Works immediately at render time — no async IPC needed for layout.
 */
function detectMacOSMajorVersionSync(): number {
    if (typeof navigator === "undefined") return 15;
    const match = navigator.userAgent.match(/Mac OS X (\d+)[._]/);
    if (match) return parseInt(match[1], 10);
    return 15;
}

export function getMacOSMajorVersion(): number {
    return detectMacOSMajorVersionSync();
}

export function isMacOSTahoe(): boolean {
    return getDesktopPlatform() === "macos" && getMacOSMajorVersion() >= 26;
}

const TRAFFIC_LIGHT_X = 14;
// Tao treats this value as the extra height below the native controls, not as
// their top offset. A 20px inset centers the traffic lights against our 33px
// pane bar instead of leaving them pinned near the window's top edge.
const TRAFFIC_LIGHT_Y = 20;
// Keep a comfortable gap after the zoom button before pane navigation starts.
// The Tahoe controls are slightly wider, so they receive a little more room.
const TRAFFIC_LIGHT_SPACER_LEGACY = 80;
const TRAFFIC_LIGHT_SPACER_TAHOE = 84;
const TITLEBAR_PADDING_TOP_LEGACY = 0;
const TITLEBAR_PADDING_TOP_TAHOE = 0;

export function getTrafficLightPosition(): { x: number; y: number } {
    return {
        x: TRAFFIC_LIGHT_X,
        y: TRAFFIC_LIGHT_Y,
    };
}

export function getTrafficLightSpacerWidth(): number {
    if (getDesktopPlatform() !== "macos") return 0;
    return isMacOSTahoe()
        ? TRAFFIC_LIGHT_SPACER_TAHOE
        : TRAFFIC_LIGHT_SPACER_LEGACY;
}

export function getTitlebarPaddingTop(): number {
    if (getDesktopPlatform() !== "macos") return 0;
    return isMacOSTahoe()
        ? TITLEBAR_PADDING_TOP_TAHOE
        : TITLEBAR_PADDING_TOP_LEGACY;
}

export function getWindowChromeLayout(): WindowChromeLayout {
    const platform = getDesktopPlatform();
    return {
        platform,
        leadingInsetWidth:
            platform === "macos" ? getTrafficLightSpacerWidth() : 0,
        titlebarPaddingTop: getTitlebarPaddingTop(),
        windowControlsSide: platform === "macos" ? "left" : "right",
    };
}

export function getManagedWindowChromeOptions(): ManagedWindowChromeOptions {
    // On Windows we intentionally return no options so satellite windows
    // (settings, detached note, vault) go through the main-process window
    // factory the same way the main window does — getting native acrylic
    // via `backgroundMaterial` and native caption buttons via
    // `titleBarOverlay`. Passing `decorations: false` here used to force
    // them chromeless, which suppressed the acrylic and hid the native
    // min/max/close buttons.
    if (getDesktopPlatform() === "windows") {
        return {};
    }

    if (getDesktopPlatform() !== "macos") {
        return {};
    }

    return {
        decorations: true,
        titleBarStyle: "overlay",
        hiddenTitle: true,
        trafficLightPosition: getTrafficLightPosition(),
    };
}
