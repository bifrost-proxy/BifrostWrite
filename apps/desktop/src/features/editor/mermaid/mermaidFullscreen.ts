import { translate } from "../../../app/i18n";

export const OPEN_MERMAID_FULLSCREEN_EVENT =
    "bifrostwrite:open-mermaid-fullscreen";

export interface OpenMermaidFullscreenPayload {
    svg: string;
}

export function openMermaidFullscreen(svg: string | SVGElement) {
    const source = typeof svg === "string" ? svg : svg.outerHTML;
    if (!source.trim()) return;

    window.dispatchEvent(
        new CustomEvent<OpenMermaidFullscreenPayload>(
            OPEN_MERMAID_FULLSCREEN_EVENT,
            { detail: { svg: source } },
        ),
    );
}

export function createMermaidFullscreenButton(svg: string) {
    const button = document.createElement("button");
    const label = translate("Open Mermaid fullscreen");
    button.type = "button";
    button.className = "mermaid-fullscreen-trigger";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = "⛶";
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openMermaidFullscreen(svg);
    });
    return button;
}
