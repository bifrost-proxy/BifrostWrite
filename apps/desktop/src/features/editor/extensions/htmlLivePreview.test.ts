/**
 * @vitest-environment jsdom
 */
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import {
    sanitizeMarkdownHtml,
} from "./htmlLivePreview";
import { livePreviewExtension } from "./livePreview";

function createView(doc: string, cursor = doc.length) {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const state = EditorState.create({
        doc,
        selection: EditorSelection.cursor(cursor),
        extensions: [
            markdown({ base: markdownLanguage }),
            livePreviewExtension(null, {
                resolveWikilink: () => false,
                navigateWikilink: () => {},
                getNoteLinkTarget: () => null,
                openLinkContextMenu: () => {},
            }),
        ],
    });
    return { parent, view: new EditorView({ state, parent }) };
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("HTML live preview", () => {
    it("sanitizes executable and theme-breaking HTML", () => {
        const sanitized = sanitizeMarkdownHtml(
            '<div class="custom" style="color:red" onclick="alert(1)">' +
                '<script>alert(2)</script><strong>Safe</strong>' +
                '<iframe src="https://example.com"></iframe></div>',
        );

        expect(sanitized).toContain("<strong>Safe</strong>");
        expect(sanitized).not.toContain("script");
        expect(sanitized).not.toContain("iframe");
        expect(sanitized).not.toContain("onclick");
        expect(sanitized).not.toContain("style=");
        expect(sanitized).not.toContain("class=");
    });

    it("renders supported block HTML with a themed wrapper", () => {
        const doc = [
            "<details open>",
            "<summary>Release notes</summary>",
            "<table><tr><th>Version</th><td>1.2</td></tr></table>",
            "</details>",
            "",
            "After",
        ].join("\n");
        const { parent, view } = createView(doc);

        const preview = parent.querySelector<HTMLElement>(
            ".cm-lp-html-block",
        );
        expect(preview).not.toBeNull();
        expect(preview?.querySelector("details")?.hasAttribute("open")).toBe(
            true,
        );
        expect(preview?.textContent).toContain("Release notes");
        expect(preview?.textContent).toContain("Version1.2");

        view.destroy();
    });

    it("reveals the raw HTML source when the cursor enters the block", () => {
        const doc = "<div><strong>Editable</strong></div>\n\nAfter";
        const { parent, view } = createView(doc);

        expect(parent.querySelector(".cm-lp-html-block")).not.toBeNull();

        view.dispatch({ selection: EditorSelection.cursor(8) });

        expect(parent.querySelector(".cm-lp-html-block")).toBeNull();
        expect(parent.textContent).toContain("<div>");
        expect(parent.textContent).toContain("Editable");

        view.destroy();
    });

    it("opens the block source from the HTML edit affordance", () => {
        const doc = "<div><strong>Editable</strong></div>\n\nAfter";
        const { parent, view } = createView(doc);
        const editButton = parent.querySelector<HTMLButtonElement>(
            ".cm-lp-html-edit",
        );
        expect(editButton).not.toBeNull();

        editButton?.dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
        );

        expect(parent.querySelector(".cm-lp-html-block")).toBeNull();
        expect(view.state.selection.main.head).toBe(1);
        expect(parent.textContent).toContain("<div>");

        view.destroy();
    });

    it("keeps unsupported-only HTML visible as editable source", () => {
        const doc = '<iframe src="https://example.com"></iframe>\n\nAfter';
        const { parent, view } = createView(doc);

        expect(parent.querySelector(".cm-lp-html-block")).toBeNull();
        expect(parent.textContent).toContain("iframe");

        view.destroy();
    });
});
