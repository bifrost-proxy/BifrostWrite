import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    isWheelZoomGesture,
    useWheelZoomModifier,
} from "../../../app/hooks/useWheelZoomModifier";
import { translate } from "../../../app/i18n";
import { formatZoomPercentage } from "../../../app/utils/zoom";
import {
    OPEN_MERMAID_FULLSCREEN_EVENT,
    type OpenMermaidFullscreenPayload,
} from "./mermaidFullscreen";
import { parseMermaidSvg } from "./mermaidSvg";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;
const PINCH_SENSITIVITY = 0.0025;

interface ZoomAnchor {
    pointerOffsetX: number;
    pointerOffsetY: number;
    previousZoom: number;
    nextZoom: number;
}

function clampZoom(value: number) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function clampScrollOffset(value: number) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function MermaidFullscreenHost() {
    const [svgSource, setSvgSource] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const viewportRef = useRef<HTMLDivElement>(null);
    const svgMountRef = useRef<HTMLDivElement>(null);
    const zoomRef = useRef(1);
    const pendingZoomAnchorRef = useRef<ZoomAnchor | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const wheelZoomModifierRef = useWheelZoomModifier();
    const svg = useMemo(
        () => (svgSource ? parseMermaidSvg(svgSource) : null),
        [svgSource],
    );

    const close = useCallback(() => {
        setSvgSource(null);
        pendingZoomAnchorRef.current = null;
        window.setTimeout(() => previousFocusRef.current?.focus(), 0);
    }, []);

    const setZoomAround = useCallback((requestedZoom: number, anchor?: { x: number; y: number }) => {
        const viewport = viewportRef.current;
        const previousZoom = zoomRef.current;
        const nextZoom = clampZoom(requestedZoom);
        if (!viewport || nextZoom === previousZoom) return;

        const rect = viewport.getBoundingClientRect();
        pendingZoomAnchorRef.current = {
            pointerOffsetX: anchor ? anchor.x - rect.left : viewport.clientWidth / 2,
            pointerOffsetY: anchor ? anchor.y - rect.top : viewport.clientHeight / 2,
            previousZoom,
            nextZoom,
        };
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
    }, []);

    useEffect(() => {
        const handleOpen = (event: Event) => {
            const detail = (event as CustomEvent<OpenMermaidFullscreenPayload>)
                .detail;
            if (!detail?.svg.trim() || !parseMermaidSvg(detail.svg)) return;

            previousFocusRef.current =
                document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
            zoomRef.current = 1;
            pendingZoomAnchorRef.current = null;
            setZoom(1);
            setSvgSource(detail.svg);
        };

        window.addEventListener(OPEN_MERMAID_FULLSCREEN_EVENT, handleOpen);
        return () =>
            window.removeEventListener(
                OPEN_MERMAID_FULLSCREEN_EVENT,
                handleOpen,
            );
    }, []);

    useEffect(() => {
        if (!svgSource) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        viewportRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            close();
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [close, svgSource]);

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport || !svgSource) return;
        let gestureStartZoom = zoomRef.current;

        const handleWheel = (event: WheelEvent) => {
            if (!isWheelZoomGesture(event, wheelZoomModifierRef)) return;
            event.preventDefault();
            event.stopPropagation();

            setZoomAround(
                zoomRef.current *
                    (1 - event.deltaY * PINCH_SENSITIVITY),
                { x: event.clientX, y: event.clientY },
            );
        };

        const handleGestureStart = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            gestureStartZoom = zoomRef.current;
        };

        const handleGestureChange = (event: Event) => {
            const gesture = event as Event & {
                scale?: number;
                clientX?: number;
                clientY?: number;
            };
            if (!Number.isFinite(gesture.scale)) return;
            event.preventDefault();
            event.stopPropagation();

            setZoomAround(gestureStartZoom * (gesture.scale ?? 1), {
                x: gesture.clientX ?? viewport.clientWidth / 2,
                y: gesture.clientY ?? viewport.clientHeight / 2,
            });
        };

        viewport.addEventListener("wheel", handleWheel, { passive: false });
        viewport.addEventListener("gesturestart", handleGestureStart, {
            passive: false,
        });
        viewport.addEventListener("gesturechange", handleGestureChange, {
            passive: false,
        });
        return () => {
            viewport.removeEventListener("wheel", handleWheel);
            viewport.removeEventListener("gesturestart", handleGestureStart);
            viewport.removeEventListener("gesturechange", handleGestureChange);
        };
    }, [setZoomAround, svgSource, wheelZoomModifierRef]);

    useLayoutEffect(() => {
        const viewport = viewportRef.current;
        const pending = pendingZoomAnchorRef.current;
        if (!viewport || !pending) return;

        const ratio = pending.nextZoom / pending.previousZoom;
        viewport.scrollLeft = clampScrollOffset(
            (viewport.scrollLeft + pending.pointerOffsetX) * ratio -
                pending.pointerOffsetX,
        );
        viewport.scrollTop = clampScrollOffset(
            (viewport.scrollTop + pending.pointerOffsetY) * ratio -
                pending.pointerOffsetY,
        );
        pendingZoomAnchorRef.current = null;
    }, [zoom]);

    useLayoutEffect(() => {
        const mount = svgMountRef.current;
        if (!mount || !svg) return;

        const clone = svg.cloneNode(true) as SVGSVGElement;
        clone.style.width = "100%";
        clone.style.maxWidth = "none";
        clone.style.height = "auto";
        clone.style.display = "block";
        mount.replaceChildren(clone);
    }, [svg]);

    if (!svgSource || !svg) return null;

    return (
        <div
            className="fixed inset-0"
            style={{
                zIndex: 20000,
                background:
                    "color-mix(in srgb, var(--bg-primary) 96%, black)",
                color: "var(--text-primary)",
            }}
            role="dialog"
            aria-modal="true"
            aria-label={translate("Mermaid preview")}
        >
            <div
                className="absolute left-4 top-4 z-10 rounded-lg px-3 py-2 text-[12px] font-semibold"
                style={{
                    border: "1px solid var(--border)",
                    background:
                        "color-mix(in srgb, var(--bg-secondary) 92%, transparent)",
                    boxShadow: "var(--shadow-soft)",
                }}
            >
                {translate("Mermaid preview")}
            </div>

            <div
                className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-lg p-1"
                style={{
                    border: "1px solid var(--border)",
                    background:
                        "color-mix(in srgb, var(--bg-secondary) 94%, transparent)",
                    boxShadow: "var(--shadow-soft)",
                }}
            >
                <ToolbarButton
                    label={translate("Zoom out")}
                    onClick={() => setZoomAround(zoomRef.current / ZOOM_STEP)}
                >
                    −
                </ToolbarButton>
                <button
                    type="button"
                    className="mermaid-fullscreen-toolbar-button h-8 min-w-14 rounded px-2 text-[11px] tabular-nums"
                    style={toolbarButtonStyle}
                    onClick={() => setZoomAround(1)}
                    title={translate("Reset zoom")}
                    aria-label={translate("Reset zoom")}
                >
                    {formatZoomPercentage(zoom)}
                </button>
                <ToolbarButton
                    label={translate("Zoom in")}
                    onClick={() => setZoomAround(zoomRef.current * ZOOM_STEP)}
                >
                    +
                </ToolbarButton>
                <span
                    aria-hidden="true"
                    style={{
                        width: 1,
                        height: 20,
                        margin: "0 3px",
                        background: "var(--border)",
                    }}
                />
                <ToolbarButton label={translate("Close")} onClick={close}>
                    ×
                </ToolbarButton>
            </div>

            <div
                className="absolute bottom-4 left-4 z-10 rounded-lg px-3 py-2 text-[11px]"
                style={{
                    border: "1px solid var(--border)",
                    background:
                        "color-mix(in srgb, var(--bg-secondary) 92%, transparent)",
                    color: "var(--text-secondary)",
                }}
            >
                {translate("Pinch to zoom • Scroll to pan • Esc to close")}
            </div>

            <div
                ref={viewportRef}
                className="absolute inset-0 overflow-auto outline-none"
                style={{
                    padding: "64px 32px 32px",
                    overscrollBehavior: "contain",
                    touchAction: "pan-x pan-y pinch-zoom",
                }}
                tabIndex={-1}
                aria-label={translate("Mermaid canvas")}
            >
                <div
                    className="flex min-h-full items-start justify-center"
                    style={{
                        width: `${zoom * 100}%`,
                        margin: "0 auto",
                    }}
                >
                    <div
                        ref={svgMountRef}
                        style={{
                            width: "100%",
                            minWidth: 0,
                            borderRadius: 12,
                            padding: 16,
                            background: "var(--bg-primary)",
                            boxShadow: "0 24px 80px rgb(0 0 0 / 0.22)",
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

function ToolbarButton({
    children,
    label,
    onClick,
}: {
    children: string;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className="mermaid-fullscreen-toolbar-button inline-flex h-8 w-8 items-center justify-center rounded text-[18px]"
            style={toolbarButtonStyle}
            onClick={onClick}
            title={label}
            aria-label={label}
        >
            {children}
        </button>
    );
}

const toolbarButtonStyle = {
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--text-primary)",
    cursor: "pointer",
} as const;
