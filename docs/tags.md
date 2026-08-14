# Tags

BifrostWrite uses inline hashtags in Markdown body text. Add a tag by typing
`#` followed immediately by its name:

```markdown
Plan the release#project review with #研发/编辑器 #release-1
```

The `#` may appear at the beginning of a line, after whitespace, or directly
after ordinary prose. A preceding space is not required.

## Naming Rules

- The first character may be a Unicode letter, number, `_`, or `-`.
- Later characters may also include `/`, enabling names such as
  `#研发/编辑器` or `#work/project`.
- Whitespace and punctuation end the tag.
- Separate adjacent tags with spaces: `#项目 #本周 #重要`.
- Tags are deduplicated per document while preserving their first-seen order.

## Editor Display

Tags are special semantic elements. They keep the same theme-colored rounded
border and translucent fill in both live preview and source editing mode.
Switching editor modes does not turn them back into ordinary unstyled text.

## Indexing And Filtering

The vault index scans every Markdown document body and aggregates its inline
tags automatically. No separate save or metadata form is required.

- Open the left **Tags** panel to browse tags and their documents.
- Use `tag:项目` in Search to filter by an exact tag.
- Graph filters and graph groups accept the same `tag:` operator.
- Nested-looking names such as `#work/project` are indexed as one complete tag.

When entering a filter, omit the leading `#`: a document containing
`#研发/编辑器` is found with `tag:研发/编辑器`, not `tag:#研发/编辑器`.

## Web Clipper

The Web Clipper's Tags field accepts names with or without a leading `#`.
Press Space, Enter, or comma to finish one tag. Saved tags are written into the
Markdown body as inline hashtags, so they use the same editor rendering and
vault index as tags typed by hand. The clipper does not create a frontmatter
`tag` or `tags` property.

## Content That Is Not A Tag

The following text is deliberately excluded from the Tag index and editor
decoration:

````markdown
`#inline-code`

```text
#fenced-code
```

\#escaped
https://example.com/page#anchor
````

Markdown headings such as `# Heading` are also not tags because whitespace
appears immediately after the `#`.

## Frontmatter Is Not Supported

Do not declare tags in document frontmatter:

```yaml
---
tags: [project, planning]
tag: archive
---
```

Those keys are treated only as ordinary frontmatter properties. They are not
read as tags, are not migrated, and do not enter the Tag index. Move the desired
values into the Markdown body instead:

```markdown
#project #planning #archive
```
