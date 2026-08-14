# HTML In Markdown

BifrostWrite renders a safe, theme-aware subset of HTML inside Markdown notes
when Live Preview is enabled. The source remains ordinary Markdown text and is
never converted into a separate document format.

## Editing Model

- When the cursor is outside a block HTML fragment, the fragment is rendered.
- Hover the rendered block and choose **HTML**, or move the cursor into the
  fragment with the keyboard, to reveal and edit its original source.
- Source mode always shows the original HTML.
- Theme changes repaint the rendered result through BifrostWrite's existing
  color and typography variables.

This is the same source-first interaction used by tables, Mermaid diagrams,
math blocks, and other Live Preview elements.

## Inline HTML

Common semantic inline tags are rendered directly in the editor while keeping
Markdown formatting inside them editable. Supported tags include:

```markdown
<mark>highlight</mark>
<u>underline</u>
<kbd>Command</kbd> + <kbd>K</kbd>
H<sub>2</sub>O and x<sup>2</sup>
<small>secondary text</small>
<ruby>漢<rt>かん</rt></ruby>
```

The inline set also includes `strong`, `b`, `em`, `i`, `cite`, `code`, `del`,
`s`, `ins`, `abbr`, `q`, `span`, `time`, `rp`, and `br`.

## Block HTML

Block fragments such as the following render in a restrained surface that
inherits the active BifrostWrite theme:

```html
<details open>
  <summary>Release checklist</summary>
  <table>
    <tr><th>Item</th><th>Status</th></tr>
    <tr><td>Tests</td><td>Ready</td></tr>
  </table>
</details>
```

Supported structural elements include headings, paragraphs, `div`, `section`,
`article`, `aside`, `header`, `footer`, lists, definition lists, blockquotes,
`details`/`summary`, tables, figures, `pre`/`code`, and horizontal rules.

## Safety And Theme Compatibility

HTML is sanitized before it reaches the preview DOM:

- scripts, iframes, forms, embedded objects, SVG, media, and form controls are
  not rendered;
- event handlers, inline styles, IDs, custom classes, and data attributes are
  removed;
- only `http`, `https`, and `mailto` links are interactive;
- unsafe or unsupported-only fragments remain visible as source so they can be
  edited rather than silently executed.

Author-provided CSS is intentionally not applied. This keeps light/dark themes,
custom palettes, editor typography, focus behavior, and layout predictable.
Use normal Markdown image syntax and links when vault-relative asset resolution
or BifrostWrite navigation is required.
