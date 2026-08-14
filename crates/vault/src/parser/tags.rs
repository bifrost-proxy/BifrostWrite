use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

// A tag begins with a Unicode letter/number, underscore, or hyphen. Slashes
// are allowed after the first character so nested tags such as #work/project
// keep working. Punctuation and whitespace terminate the tag.
static TAG_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"#([\p{L}\p{N}_-][\p{L}\p{N}_/-]*)").unwrap());
static URL_HOST_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?][^\s]*)?$").unwrap());

pub fn extract_tags(text: &str) -> Vec<String> {
    let content = strip_frontmatter(text);
    let mut tags = Vec::new();
    let mut seen = HashSet::new();
    let mut fence: Option<(u8, usize)> = None;

    for raw_line in content.lines() {
        let line = raw_line.trim_end_matches('\r');

        if let Some(marker) = fence_marker(line) {
            match fence {
                Some((kind, minimum)) if marker.0 == kind && marker.1 >= minimum => {
                    fence = None;
                }
                None => fence = Some(marker),
                _ => {}
            }
            continue;
        }

        if fence.is_some() || line.starts_with("    ") || line.starts_with('\t') {
            continue;
        }

        let code_ranges = inline_code_ranges(line);
        for capture in TAG_RE.captures_iter(line) {
            let whole = capture.get(0).expect("tag match");
            let hash_index = whole.start();

            if code_ranges
                .iter()
                .any(|(from, to)| hash_index >= *from && hash_index < *to)
                || is_escaped(line, hash_index)
                || is_url_fragment(line, hash_index)
            {
                continue;
            }

            let tag = capture[1].to_string();
            if seen.insert(tag.clone()) {
                tags.push(tag);
            }
        }
    }

    tags
}

fn strip_frontmatter(text: &str) -> &str {
    let Some(first_newline) = text.find('\n') else {
        return text;
    };
    if text[..first_newline].trim_end_matches('\r') != "---" {
        return text;
    }

    let mut offset = first_newline + 1;
    for line in text[offset..].split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\r', '\n']);
        offset += line.len();
        if trimmed == "---" || trimmed == "..." {
            return &text[offset..];
        }
    }

    text
}

fn fence_marker(line: &str) -> Option<(u8, usize)> {
    let trimmed = line.trim_start_matches(' ');
    if line.len() - trimmed.len() > 3 {
        return None;
    }

    let marker = *trimmed.as_bytes().first()?;
    if marker != b'`' && marker != b'~' {
        return None;
    }
    let length = trimmed
        .as_bytes()
        .iter()
        .take_while(|byte| **byte == marker)
        .count();
    (length >= 3).then_some((marker, length))
}

fn inline_code_ranges(line: &str) -> Vec<(usize, usize)> {
    let bytes = line.as_bytes();
    let mut ranges = Vec::new();
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] != b'`' {
            index += 1;
            continue;
        }

        let opening = index;
        while index < bytes.len() && bytes[index] == b'`' {
            index += 1;
        }
        let marker_len = index - opening;
        let mut search = index;

        while search < bytes.len() {
            if bytes[search] != b'`' {
                search += 1;
                continue;
            }
            let closing = search;
            while search < bytes.len() && bytes[search] == b'`' {
                search += 1;
            }
            if search - closing == marker_len {
                ranges.push((opening, search));
                index = search;
                break;
            }
        }

        if search >= bytes.len() {
            index = opening + marker_len;
        }
    }

    ranges
}

fn is_escaped(line: &str, hash_index: usize) -> bool {
    let slash_count = line.as_bytes()[..hash_index]
        .iter()
        .rev()
        .take_while(|byte| **byte == b'\\')
        .count();
    slash_count % 2 == 1
}

fn is_url_fragment(line: &str, hash_index: usize) -> bool {
    let token_start = line[..hash_index]
        .rfind(|ch: char| {
            ch.is_whitespace() || matches!(ch, '<' | '>' | '(' | ')' | '[' | ']' | '"' | '\'')
        })
        .map_or(0, |index| index + 1);
    let prefix = &line[token_start..hash_index];
    let lower = prefix.to_ascii_lowercase();

    lower.contains("://")
        || lower.starts_with("www.")
        || lower.starts_with("mailto:")
        || prefix.starts_with('/')
        || prefix.starts_with("./")
        || prefix.starts_with("../")
        || URL_HOST_RE.is_match(prefix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_unicode_tags_anywhere_in_body_text() {
        assert_eq!(
            extract_tags("正文#项目 以及 #研发/编辑器 #release-1"),
            vec!["项目", "研发/编辑器", "release-1"]
        );
    }

    #[test]
    fn whitespace_and_punctuation_end_a_tag() {
        assert_eq!(
            extract_tags("#苹果笔记，下一项 #two words"),
            vec!["苹果笔记", "two"]
        );
    }

    #[test]
    fn preserves_order_and_deduplicates_tags() {
        assert_eq!(
            extract_tags("#rust #web-dev #rust #tools/cli"),
            vec!["rust", "web-dev", "tools/cli"]
        );
    }

    #[test]
    fn ignores_markdown_headings() {
        assert!(extract_tags("# Header\n## Subheader").is_empty());
    }

    #[test]
    fn ignores_frontmatter_tags_without_migrating_them() {
        let text = "---\ntags: [legacy, old]\ntag: archive\n---\n正文 #current";
        assert_eq!(extract_tags(text), vec!["current"]);
    }

    #[test]
    fn ignores_fenced_indented_and_inline_code() {
        let text = "`#inline` #visible\n```rust\n#fenced\n```\n    #indented";
        assert_eq!(extract_tags(text), vec!["visible"]);
    }

    #[test]
    fn ignores_escaped_tags_and_url_fragments() {
        let text = r"\#escaped https://example.com/page#anchor /docs/page#section #real";
        assert_eq!(extract_tags(text), vec!["real"]);
    }
}
