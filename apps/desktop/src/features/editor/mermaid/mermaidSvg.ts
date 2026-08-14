const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Mermaid SVG output may contain HTML labels inside foreignObject elements.
 * Parse it as HTML so named entities and HTML-style void elements remain
 * compatible with the browser/WebView, then require an SVG document root.
 */
export function parseMermaidSvg(svg: string): SVGSVGElement | null {
    const parsed = new DOMParser().parseFromString(svg, "text/html");
    const root = parsed.body.firstElementChild;

    if (root?.localName !== "svg" || root.namespaceURI !== SVG_NAMESPACE) {
        return null;
    }

    return document.importNode(root, true) as SVGSVGElement;
}
