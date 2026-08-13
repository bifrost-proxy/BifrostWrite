import { syntaxTree } from "@codemirror/language";
import {
    EditorSelection,
    type Extension,
    type EditorState,
    RangeSetBuilder,
    StateField,
} from "@codemirror/state";
import {
    Decoration,
    type DecorationSet,
    EditorView,
    ViewPlugin,
    WidgetType,
} from "@codemirror/view";
import DOMPurify from "dompurify";
import { openUrl } from "@bifrostwrite/runtime";

import { translate } from "../../../app/i18n";
import { selectionTouchesRange } from "./selectionActivity";

const HTML_EDIT_EVENT = "cm-html-preview-edit";

const HTML_PREVIEW_TAGS = [
    "a",
    "abbr",
    "article",
    "aside",
    "b",
    "blockquote",
    "br",
    "caption",
    "cite",
    "code",
    "col",
    "colgroup",
    "dd",
    "del",
    "details",
    "div",
    "dl",
    "dt",
    "em",
    "figcaption",
    "figure",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "i",
    "ins",
    "kbd",
    "li",
    "main",
    "mark",
    "ol",
    "p",
    "pre",
    "q",
    "rp",
    "rt",
    "ruby",
    "s",
    "section",
    "small",
    "span",
    "strong",
    "sub",
    "summary",
    "sup",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "time",
    "tr",
    "u",
    "ul",
] as const;

const HTML_PREVIEW_ATTRIBUTES = [
    "cite",
    "colspan",
    "datetime",
    "href",
    "open",
    "rowspan",
    "scope",
    "title",
] as const;

function getSafeExternalHref(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    try {
        const parsed = new URL(trimmed);
        return parsed.protocol === "http:" ||
            parsed.protocol === "https:" ||
            parsed.protocol === "mailto:"
            ? parsed.href
            : null;
    } catch {
        return null;
    }
}

export function sanitizeMarkdownHtml(source: string): string {
    const sanitized = DOMPurify.sanitize(source, {
        ALLOWED_TAGS: [...HTML_PREVIEW_TAGS],
        ALLOWED_ATTR: [...HTML_PREVIEW_ATTRIBUTES],
        ALLOW_ARIA_ATTR: true,
        ALLOW_DATA_ATTR: false,
        FORBID_ATTR: ["class", "id", "style"],
        FORBID_TAGS: [
            "audio",
            "button",
            "embed",
            "form",
            "iframe",
            "img",
            "input",
            "link",
            "math",
            "meta",
            "object",
            "script",
            "style",
            "svg",
            "textarea",
            "video",
        ],
    });

    return typeof sanitized === "string" ? sanitized : String(sanitized);
}

function configurePreviewLinks(root: HTMLElement) {
    for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        const safeHref = getSafeExternalHref(anchor.getAttribute("href") ?? "");
        if (!safeHref) {
            anchor.removeAttribute("href");
            continue;
        }

        anchor.href = safeHref;
        anchor.rel = "noopener noreferrer";
        anchor.dataset.htmlPreviewLink = "true";
        anchor.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void openUrl(safeHref);
        });
    }
}

class HtmlBlockWidget extends WidgetType {
    private readonly html: string;
    private readonly from: number;

    constructor(html: string, from: number) {
        super();
        this.html = html;
        this.from = from;
    }

    eq(other: HtmlBlockWidget) {
        return other.html === this.html && other.from === this.from;
    }

    toDOM() {
        const root = document.createElement("div");
        root.className = "cm-lp-html-block";
        root.setAttribute("contenteditable", "false");
        root.innerHTML = this.html;
        configurePreviewLinks(root);

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "cm-lp-html-edit";
        editButton.textContent = "HTML";
        editButton.title = translate("Edit HTML source");
        editButton.setAttribute("aria-label", translate("Edit HTML source"));
        editButton.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            root.dispatchEvent(
                new CustomEvent(HTML_EDIT_EVENT, {
                    bubbles: true,
                    detail: { from: this.from },
                }),
            );
        });
        root.appendChild(editButton);
        return root;
    }

    ignoreEvent() {
        return true;
    }
}

function buildHtmlBlockDecorations(state: EditorState): DecorationSet {
    const decorations: Array<{
        from: number;
        to: number;
        decoration: Decoration;
    }> = [];

    syntaxTree(state).iterate({
        enter(node) {
            if (node.name !== "HTMLBlock") return;
            if (selectionTouchesRange(state, node.from, node.to)) return false;

            const sanitized = sanitizeMarkdownHtml(
                state.doc.sliceString(node.from, node.to),
            ).trim();
            if (!sanitized) return false;

            decorations.push({
                from: node.from,
                to: node.to,
                decoration: Decoration.replace({
                    widget: new HtmlBlockWidget(sanitized, node.from),
                    block: true,
                    inclusive: false,
                }),
            });
            return false;
        },
    });

    decorations.sort(
        (left, right) => left.from - right.from || left.to - right.to,
    );
    const builder = new RangeSetBuilder<Decoration>();
    for (const { from, to, decoration } of decorations) {
        builder.add(from, to, decoration);
    }
    return builder.finish();
}

function createHtmlEditInteractionExtension() {
    return ViewPlugin.define((view) => {
        const handleEdit = (event: Event) => {
            const from = (event as CustomEvent<{ from?: number }>).detail?.from;
            if (typeof from !== "number") return;

            view.dispatch({
                selection: EditorSelection.cursor(
                    Math.min(from + 1, view.state.doc.length),
                ),
                scrollIntoView: true,
            });
            view.focus();
        };

        view.dom.addEventListener(HTML_EDIT_EVENT, handleEdit);
        return {
            destroy() {
                view.dom.removeEventListener(HTML_EDIT_EVENT, handleEdit);
            },
        };
    });
}

export function createHtmlBlockLivePreviewExtension(): Extension {
    const decorationField = StateField.define<DecorationSet>({
        create: buildHtmlBlockDecorations,
        update(decorations, transaction) {
            if (
                !transaction.docChanged &&
                !transaction.selection &&
                syntaxTree(transaction.startState) ===
                    syntaxTree(transaction.state)
            ) {
                return decorations;
            }
            return buildHtmlBlockDecorations(transaction.state);
        },
        provide(field) {
            return EditorView.decorations.from(field);
        },
    });

    return [decorationField, createHtmlEditInteractionExtension()];
}
