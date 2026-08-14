/**
 * @vitest-environment jsdom
 */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { afterEach, describe, expect, it } from "vitest";

import {
    baseTheme,
    getSyntaxExtension,
} from "./editorExtensions";

afterEach(() => {
    document.body.innerHTML = "";
});

describe("editor base theme", () => {
    it("leaves scroll anchoring to CodeMirror during live-preview layout changes", () => {
        const parent = document.createElement("div");
        document.body.appendChild(parent);
        const view = new EditorView({
            state: EditorState.create({
                doc: "1. ",
                extensions: [baseTheme],
            }),
            parent,
        });

        expect(window.getComputedStyle(view.scrollDOM).overflowAnchor).toBe(
            "none",
        );

        view.destroy();
    });

    it("keeps Setext-like text visually plain instead of treating it as a heading", () => {
        const parent = document.createElement("div");
        document.body.appendChild(parent);
        const view = new EditorView({
            state: EditorState.create({
                doc: "Plain text\n-",
                extensions: [
                    markdown({ base: markdownLanguage }),
                    baseTheme,
                    getSyntaxExtension(),
                ],
            }),
            parent,
        });

        expect(view.dom.querySelector(".cm-source-setext-plain")).not.toBeNull();
        expect(view.dom.querySelector(".cm-source-heading")).toBeNull();

        view.destroy();
    });
});
