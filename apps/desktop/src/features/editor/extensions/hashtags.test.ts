/**
 * @vitest-environment jsdom
 */
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView, type Decoration } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { hashtagDecorationExtension } from "./hashtags";

function createView(doc: string) {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const state = EditorState.create({
        doc,
        extensions: [
            markdown({ base: markdownLanguage }),
            hashtagDecorationExtension,
        ],
    });
    return { parent, view: new EditorView({ state, parent }) };
}

function collectHashtags(view: EditorView, doc: string) {
    const plugin = view.plugin(hashtagDecorationExtension);
    const tags: string[] = [];
    plugin?.decorations.between(
        0,
        view.state.doc.length,
        (from: number, to: number, decoration: Decoration) => {
            if (decoration.spec.class === "cm-hashtag") {
                tags.push(doc.slice(from, to));
            }
        },
    );
    return tags;
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("hashtagDecorationExtension", () => {
    it("keeps Unicode hashtags styled independently of editor mode", () => {
        const doc = "正文#项目 #研发/编辑器 #release-1";
        const { parent, view } = createView(doc);

        expect(collectHashtags(view, doc)).toEqual([
            "#项目",
            "#研发/编辑器",
            "#release-1",
        ]);

        view.destroy();
        parent.remove();
    });

    it("ignores code, URLs, escaped text, and legacy frontmatter tags", () => {
        const doc =
            "---\ntags: [legacy]\n---\n`#inline` https://example.com/page#anchor \\#escaped #visible\n```\n#fenced\n```";
        const { parent, view } = createView(doc);

        expect(collectHashtags(view, doc)).toEqual(["#visible"]);

        view.destroy();
        parent.remove();
    });
});
