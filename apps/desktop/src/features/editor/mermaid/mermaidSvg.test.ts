import { describe, expect, it } from "vitest";
import { parseMermaidSvg } from "./mermaidSvg";

describe("parseMermaidSvg", () => {
    it("accepts Mermaid HTML labels that are not strict XML", () => {
        const svg = parseMermaidSvg(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">
                <foreignObject width="100" height="40">
                    <div xmlns="http://www.w3.org/1999/xhtml">README&nbsp;flow<br>ready</div>
                </foreignObject>
            </svg>
        `);

        expect(svg).not.toBeNull();
        expect(svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
        expect(svg?.textContent).toContain("README\u00a0flow");
        expect(svg?.textContent).toContain("ready");
    });

    it("rejects output without an SVG root", () => {
        expect(parseMermaidSvg("<div>not an SVG</div>")).toBeNull();
        expect(parseMermaidSvg("<parsererror>bad SVG</parsererror>")).toBeNull();
    });
});
