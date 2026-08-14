import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
    Decoration,
    EditorView,
    ViewPlugin,
    type ViewUpdate,
} from "@codemirror/view";

import { FRONTMATTER_RE } from "../noteTitleHelpers";

const HASHTAG_RE = /#[\p{L}\p{N}_-][\p{L}\p{N}_/-]*/gu;
const URL_HOST_PREFIX_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?][^\s]*)?$/i;
const hashtagMark = Decoration.mark({ class: "cm-hashtag" });

type ExcludedRange = { from: number; to: number };

function rangeOverlaps(
    ranges: ExcludedRange[],
    from: number,
    to: number,
) {
    return ranges.some((range) => to > range.from && from < range.to);
}

function collectExcludedRanges(view: EditorView) {
    const ranges: ExcludedRange[] = [];
    const docText = view.state.doc.toString();
    const frontmatter = docText.match(FRONTMATTER_RE);
    if (frontmatter) {
        ranges.push({ from: 0, to: frontmatter[0].length });
    }

    syntaxTree(view.state).iterate({
        enter(node) {
            if (
                node.name === "InlineCode" ||
                node.name === "FencedCode" ||
                node.name === "CodeBlock"
            ) {
                ranges.push({ from: node.from, to: node.to });
                return false;
            }
        },
    });

    return ranges;
}

function isEscaped(view: EditorView, hashFrom: number) {
    const line = view.state.doc.lineAt(hashFrom);
    const before = view.state.doc.sliceString(line.from, hashFrom);
    let slashCount = 0;
    for (let index = before.length - 1; index >= 0; index--) {
        if (before[index] !== "\\") break;
        slashCount++;
    }
    return slashCount % 2 === 1;
}

function isUrlFragment(view: EditorView, hashFrom: number) {
    const line = view.state.doc.lineAt(hashFrom);
    const before = view.state.doc.sliceString(line.from, hashFrom);
    const prefix = before.match(/[^\s<>()[\]"']*$/)?.[0] ?? "";
    const lower = prefix.toLowerCase();

    return (
        lower.includes("://") ||
        lower.startsWith("www.") ||
        lower.startsWith("mailto:") ||
        prefix.startsWith("/") ||
        prefix.startsWith("./") ||
        prefix.startsWith("../") ||
        URL_HOST_PREFIX_RE.test(prefix)
    );
}

function buildHashtagDecorations(view: EditorView) {
    const builder = new RangeSetBuilder<Decoration>();
    const excludedRanges = collectExcludedRanges(view);

    for (const visibleRange of view.visibleRanges) {
        const text = view.state.doc.sliceString(
            visibleRange.from,
            visibleRange.to,
        );
        HASHTAG_RE.lastIndex = 0;

        let match: RegExpExecArray | null;
        while ((match = HASHTAG_RE.exec(text)) !== null) {
            const from = visibleRange.from + match.index;
            const to = from + match[0].length;
            if (
                rangeOverlaps(excludedRanges, from, to) ||
                isEscaped(view, from) ||
                isUrlFragment(view, from)
            ) {
                continue;
            }
            builder.add(from, to, hashtagMark);
        }
    }

    return builder.finish();
}

export const hashtagDecorationExtension = ViewPlugin.fromClass(
    class {
        decorations;

        constructor(view: EditorView) {
            this.decorations = buildHashtagDecorations(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.viewportChanged) {
                this.decorations = buildHashtagDecorations(update.view);
            }
        }
    },
    {
        decorations: (plugin) => plugin.decorations,
    },
);

export const hashtagTheme = EditorView.baseTheme({
    ".cm-hashtag": {
        color: "var(--accent)",
        backgroundColor: "color-mix(in srgb, var(--accent) 12%, transparent)",
        border: "1px solid color-mix(in srgb, var(--accent) 38%, transparent)",
        borderRadius: "999px",
        padding: "0 0.32em",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
    },
});
