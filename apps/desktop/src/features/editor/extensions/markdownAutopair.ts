import { Annotation, EditorSelection } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

export const activateWikilinkSuggesterAnnotation =
    Annotation.define<boolean>();

function dispatchAutopair(
    view: EditorView,
    from: number,
    to: number,
    insert: string,
    selectionFrom: number,
    selectionTo = selectionFrom,
    activateWikilinkSuggester = false,
) {
    view.dispatch({
        changes: { from, to, insert },
        selection: EditorSelection.single(selectionFrom, selectionTo),
        annotations: activateWikilinkSuggester
            ? activateWikilinkSuggesterAnnotation.of(true)
            : undefined,
        userEvent: "input",
    });
}

function wrapSelection(
    view: EditorView,
    from: number,
    to: number,
    prefix: string,
    suffix: string,
) {
    const text = view.state.sliceDoc(from, to);
    dispatchAutopair(
        view,
        from,
        to,
        `${prefix}${text}${suffix}`,
        from + prefix.length,
        from + prefix.length + text.length,
    );
    return true;
}

function pairAtCursor(view: EditorView, from: number, to: number, pair: string) {
    dispatchAutopair(view, from, to, pair, from + pair.length / 2);
    return true;
}

function getCharBefore(view: EditorView, pos: number) {
    if (pos <= 0) return "";
    return view.state.sliceDoc(pos - 1, pos);
}

function getCharAfter(view: EditorView, pos: number) {
    if (pos >= view.state.doc.length) return "";
    return view.state.sliceDoc(pos, pos + 1);
}

function skipOverClosing(view: EditorView, from: number, text: string) {
    const selection = view.state.selection.main;
    if (!selection.empty) return false;

    const nextChar = getCharAfter(view, from);
    if (nextChar !== text) return false;

    view.dispatch({
        selection: EditorSelection.cursor(from + 1),
        userEvent: "input",
    });
    return true;
}

function upgradeBracketPairToWikilink(
    view: EditorView,
    from: number,
    to: number,
) {
    const selection = view.state.selection.main;
    const nextChar = getCharAfter(view, from);

    if (
        selection.empty &&
        getCharBefore(view, from) === "[" &&
        nextChar === "]"
    ) {
        dispatchAutopair(view, from, to + 1, "[]]", from + 1, from + 1, true);
        return true;
    }

    if (
        !selection.empty &&
        getCharBefore(view, from) === "[" &&
        getCharAfter(view, to) === "]"
    ) {
        const text = view.state.sliceDoc(from, to);
        dispatchAutopair(
            view,
            from - 1,
            to + 1,
            `[[${text}]]`,
            from + 1,
            from + 1 + text.length,
            true,
        );
        return true;
    }

    return false;
}

function handleAsteriskPair(view: EditorView, from: number, to: number) {
    const selection = view.state.selection.main;
    if (!selection.empty) {
        return wrapSelection(view, from, to, "**", "**");
    }

    if (getCharBefore(view, from) !== "*") return false;
    dispatchAutopair(view, from - 1, from, "****", from + 1);
    return true;
}

function handleEqualsPair(view: EditorView, from: number, to: number) {
    const selection = view.state.selection.main;
    if (!selection.empty) {
        return wrapSelection(view, from, to, "==", "==");
    }

    if (getCharBefore(view, from) !== "=") return false;
    dispatchAutopair(view, from - 1, from, "====", from + 1);
    return true;
}

export function completeMarkdownCodeFence(view: EditorView): boolean {
    if (view.state.readOnly) return false;
    if (view.state.selection.ranges.length !== 1) return false;

    const selection = view.state.selection.main;
    if (!selection.empty) return false;

    const line = view.state.doc.lineAt(selection.head);
    if (selection.head !== line.to) return false;

    const match = /^( {0,3})(`{3,})([^`]*)$/.exec(line.text);
    if (!match) return false;

    let fencedCode: SyntaxNode | null = syntaxTree(view.state).resolveInner(
        selection.head,
        -1,
    );
    while (fencedCode && fencedCode.name !== "FencedCode") {
        fencedCode = fencedCode.parent;
    }
    if (!fencedCode) return false;

    const cursor = fencedCode.cursor();
    let codeMarkCount = 0;
    let openingMarkFrom = -1;
    if (cursor.firstChild()) {
        do {
            if (cursor.name !== "CodeMark") continue;
            codeMarkCount += 1;
            if (openingMarkFrom < 0) openingMarkFrom = cursor.from;
        } while (cursor.nextSibling());
    }

    // Only complete a newly opened, still-unclosed fence. Pressing Enter on
    // an existing closing fence must retain the normal newline behavior.
    if (
        codeMarkCount !== 1 ||
        openingMarkFrom < line.from ||
        openingMarkFrom > line.to
    ) {
        return false;
    }

    const indentation = match[1];
    const marker = match[2];
    view.dispatch({
        changes: {
            from: selection.head,
            insert: `\n\n${indentation}${marker}`,
        },
        selection: EditorSelection.cursor(selection.head + 1),
        scrollIntoView: true,
        userEvent: "input",
    });
    return true;
}

export function handleMarkdownAutopairInput(
    view: EditorView,
    from: number,
    to: number,
    text: string,
): boolean {
    if (view.state.readOnly) return false;
    if (view.state.selection.ranges.length !== 1) return false;
    if (text.length !== 1) return false;

    if (text === "]" || text === ")") {
        if (skipOverClosing(view, from, text)) return true;
    }

    if (text === "[") {
        if (upgradeBracketPairToWikilink(view, from, to)) return true;

        if (!view.state.selection.main.empty) {
            return wrapSelection(view, from, to, "[", "]");
        }

        return pairAtCursor(view, from, to, "[]");
    }

    if (text === "(") {
        if (!view.state.selection.main.empty) {
            return wrapSelection(view, from, to, "(", ")");
        }

        return pairAtCursor(view, from, to, "()");
    }

    // Backticks intentionally stay literal. Automatically inserting the
    // closing mark makes it difficult to type a three-backtick code fence.
    if (text === "`") return false;

    if (text === "*") {
        return handleAsteriskPair(view, from, to);
    }

    if (text === "=") {
        return handleEqualsPair(view, from, to);
    }

    return false;
}

export const markdownAutopairExtension = EditorView.inputHandler.of(
    handleMarkdownAutopairInput,
);
