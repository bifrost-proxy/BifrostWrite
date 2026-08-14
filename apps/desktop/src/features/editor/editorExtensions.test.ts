/**
 * @vitest-environment jsdom
 */
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { baseTheme } from "./editorExtensions";

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
});
