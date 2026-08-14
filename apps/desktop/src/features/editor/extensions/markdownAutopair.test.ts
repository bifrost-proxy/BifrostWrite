import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";

import {
    completeMarkdownCodeFence,
    handleMarkdownAutopairInput,
} from "./markdownAutopair";

function createMarkdownView(
    doc: string,
    selection: EditorSelection | { anchor: number; head?: number } = {
        anchor: doc.length,
    },
) {
    return new EditorView({
        state: EditorState.create({
            doc,
            selection,
            extensions: [
                markdown({
                    base: markdownLanguage,
                }),
            ],
        }),
    });
}

describe("markdownAutopair", () => {
    it("leaves a typed backtick literal instead of inserting a pair", () => {
        const view = createMarkdownView("");

        expect(handleMarkdownAutopairInput(view, 0, 0, "`")).toBe(false);
        expect(view.state.doc.toString()).toBe("");

        view.destroy();
    });

    it("does not wrap selected text in backticks automatically", () => {
        const view = createMarkdownView("value", {
            anchor: 0,
            head: 5,
        });

        expect(handleMarkdownAutopairInput(view, 0, 5, "`")).toBe(false);
        expect(view.state.doc.toString()).toBe("value");

        view.destroy();
    });

    it("completes a three-backtick code fence when Enter is pressed", () => {
        const opening = "```ts";
        const view = createMarkdownView(opening);

        expect(completeMarkdownCodeFence(view)).toBe(true);
        expect(view.state.doc.toString()).toBe("```ts\n\n```");
        expect(view.state.selection.main.head).toBe(opening.length + 1);

        view.destroy();
    });

    it("preserves indentation and the opening fence length", () => {
        const opening = "  ````javascript";
        const view = createMarkdownView(opening);

        expect(completeMarkdownCodeFence(view)).toBe(true);
        expect(view.state.doc.toString()).toBe(
            "  ````javascript\n\n  ````",
        );
        expect(view.state.selection.main.head).toBe(opening.length + 1);

        view.destroy();
    });

    it("does not complete fewer than three backticks", () => {
        const view = createMarkdownView("``");

        expect(completeMarkdownCodeFence(view)).toBe(false);
        expect(view.state.doc.toString()).toBe("``");

        view.destroy();
    });

    it("does not add another fence after an existing closing marker", () => {
        const doc = "```\ncode\n```";
        const view = createMarkdownView(doc);

        expect(completeMarkdownCodeFence(view)).toBe(false);
        expect(view.state.doc.toString()).toBe(doc);

        view.destroy();
    });
});
