import { translate } from "../../app/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    renderMermaidDiagram,
    type MermaidRenderResult,
} from "./mermaid/mermaidRenderer";
import { openMermaidFullscreen } from "./mermaid/mermaidFullscreen";
import { parseMermaidSvg } from "./mermaid/mermaidSvg";

type MermaidFilePreviewState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "rendered"; svg: SVGElement }
    | { status: "error"; message: string };

interface MermaidFilePreviewProps {
    source: string;
    tabId: string;
}

export function MermaidFilePreview({ source, tabId }: MermaidFilePreviewProps) {
    const requestRef = useRef(0);
    const [state, setState] = useState<MermaidFilePreviewState>({
        status: source.trim() ? "loading" : "idle",
    });
    const diagramId = useMemo(
        () => `mermaid-file-${sanitizeIdPart(tabId)}-${hashString(source)}`,
        [source, tabId],
    );

    useEffect(() => {
        const trimmedSource = source.trim();
        const requestId = requestRef.current + 1;
        requestRef.current = requestId;

        if (!trimmedSource) {
            setState({ status: "idle" });
            return;
        }

        setState({ status: "loading" });

        void renderMermaidDiagram(source, diagramId).then((result) => {
            if (requestRef.current !== requestId) return;

            setState(toPreviewState(result));
        });
    }, [diagramId, source]);

    return (
        <div
            className="mermaid-file-preview flex h-full min-w-0 flex-col"
            style={{
                borderLeft: "1px solid var(--border)",
                backgroundColor: "var(--bg-primary)",
            }}
            aria-label={translate("Mermaid preview")}
        >
            <div
                className="flex h-8 shrink-0 items-center px-3 text-[11px] font-medium"
                style={{
                    borderBottom:
                        "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
                    color: "var(--text-secondary)",
                }}
            >
                {translate("Preview")}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
                {state.status === "idle" ? (
                    <div
                        className="flex h-full items-center justify-center text-[12px]"
                        style={{ color: "var(--text-secondary)" }}
                    >
                        {translate("Mermaid source is empty.")}
                    </div>
                ) : null}
                {state.status === "loading" ? (
                    <div
                        className="flex h-full items-center justify-center text-[12px]"
                        style={{ color: "var(--text-secondary)" }}
                    >
                        {translate("Rendering Mermaid diagram...")}
                    </div>
                ) : null}
                {state.status === "rendered" ? (
                    <div
                        className="mermaid-file-preview-body relative flex min-h-full items-start justify-center"
                    >
                        <div
                            ref={(node) => {
                                if (!node) return;
                                node.replaceChildren(
                                    state.svg.cloneNode(true),
                                );
                            }}
                        />
                        <button
                            type="button"
                            className="mermaid-fullscreen-trigger"
                            aria-label={translate("Open Mermaid fullscreen")}
                            title={translate("Open Mermaid fullscreen")}
                            onClick={() => openMermaidFullscreen(state.svg)}
                        >
                            ⛶
                        </button>
                    </div>
                ) : null}
                {state.status === "error" ? (
                    <div
                        className="rounded-md p-3 text-[12px]"
                        style={{
                            border: "1px solid color-mix(in srgb, #ef4444 35%, var(--border))",
                            backgroundColor:
                                "color-mix(in srgb, #ef4444 10%, var(--bg-secondary))",
                            color: "var(--text-primary)",
                        }}
                        role="alert"
                    >
                        <div className="mb-2 font-medium">
                            {translate("Mermaid diagram error")}
                        </div>
                        <pre
                            className="m-0 whitespace-pre-wrap font-mono text-[11px]"
                            style={{ color: "var(--text-secondary)" }}
                        >
                            {translate(String(state.message))}
                        </pre>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function toPreviewState(result: MermaidRenderResult): MermaidFilePreviewState {
    if (result.status === "error") {
        return { status: "error", message: result.message };
    }

    const svg = parseMermaidSvg(result.svg);
    if (!svg) {
        return { status: "error", message: "Unable to read Mermaid SVG output." };
    }

    return { status: "rendered", svg };
}

function sanitizeIdPart(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function hashString(value: string) {
    let hash = 5381;
    for (let index = 0; index < value.length; index++) {
        hash = (hash * 33) ^ value.charCodeAt(index);
    }
    return (hash >>> 0).toString(36);
}
