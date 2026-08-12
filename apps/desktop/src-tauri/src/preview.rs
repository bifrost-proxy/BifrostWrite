use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::http;

pub fn handle_request<R: tauri::Runtime>(
    _context: tauri::UriSchemeContext<'_, R>,
    request: http::Request<Vec<u8>>,
) -> http::Response<Vec<u8>> {
    match resolve_request_path(request.uri()) {
        Ok((path, content_type)) => file_response(&request, &path, &content_type),
        Err((status, message)) => error_response(status, &message),
    }
}

fn resolve_request_path(uri: &http::Uri) -> Result<(PathBuf, String), (http::StatusCode, String)> {
    let segments = uri
        .path()
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    let scope = segments.first().copied().unwrap_or_default();

    match scope {
        "vault" if segments.len() == 3 => {
            let vault = decode(segments[1])?;
            let relative = decode(segments[2])?;
            let path = resolve_vault_path(Path::new(&vault), Path::new(&relative))?;
            Ok((path.clone(), mime_type(&path)))
        }
        "assets" if segments.len() >= 3 => {
            let vault = decode(segments[1])?;
            let relative = segments[2..]
                .iter()
                .map(|segment| urlencoding::decode(segment).map(|value| value.into_owned()))
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| bad_request("Invalid asset path."))?
                .join("/");
            let path = resolve_vault_path(Path::new(&vault), Path::new(&relative))?;
            Ok((path.clone(), mime_type(&path)))
        }
        "ai-attachment" if segments.len() == 3 => {
            let vault = decode(segments[1])?;
            let id = urlencoding::decode(segments[2])
                .map_err(|_| bad_request("Invalid attachment id."))?
                .into_owned();
            if !is_managed_attachment_id(&id) {
                return Err(bad_request("Invalid attachment id."));
            }
            let root = canonical_directory(Path::new(&vault))?;
            let path = root
                .join("assets/chat/.neverwrite-managed/v1/blobs")
                .join(&id)
                .join("blob");
            let path = fs::canonicalize(path).map_err(|_| not_found())?;
            if !path.starts_with(&root) || !path.is_file() {
                return Err(not_found());
            }
            let metadata_path = path.parent().unwrap_or(&path).join("metadata.json");
            let content_type = fs::read_to_string(metadata_path)
                .ok()
                .and_then(|value| serde_json::from_str::<serde_json::Value>(&value).ok())
                .and_then(|value| {
                    value
                        .get("mime_type")
                        .and_then(|v| v.as_str())
                        .map(str::to_string)
                })
                .unwrap_or_else(|| "application/octet-stream".to_string());
            Ok((path, content_type))
        }
        "codex-image" if segments.len() == 2 => {
            let requested = PathBuf::from(decode(segments[1])?);
            let path = fs::canonicalize(&requested).map_err(|_| not_found())?;
            if !allowed_codex_image(&path) {
                return Err(not_found());
            }
            let content_type = mime_type(&path);
            if !content_type.starts_with("image/") {
                return Err((
                    http::StatusCode::UNSUPPORTED_MEDIA_TYPE,
                    "Unsupported image type.".into(),
                ));
            }
            Ok((path, content_type))
        }
        _ => Err(not_found()),
    }
}

fn resolve_vault_path(
    vault: &Path,
    relative: &Path,
) -> Result<PathBuf, (http::StatusCode, String)> {
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
        || relative.components().any(|component| {
            component
                .as_os_str()
                .to_string_lossy()
                .eq_ignore_ascii_case(".neverwrite-managed")
        })
    {
        return Err(bad_request("Invalid vault path."));
    }
    let root = canonical_directory(vault)?;
    let path = fs::canonicalize(root.join(relative)).map_err(|_| not_found())?;
    if !path.starts_with(&root) || !path.is_file() {
        return Err(not_found());
    }
    Ok(path)
}

fn canonical_directory(path: &Path) -> Result<PathBuf, (http::StatusCode, String)> {
    let path = fs::canonicalize(path).map_err(|_| not_found())?;
    if !path.is_dir() {
        return Err(not_found());
    }
    Ok(path)
}

fn decode(value: &str) -> Result<String, (http::StatusCode, String)> {
    let bytes = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| bad_request("Invalid preview token."))?;
    String::from_utf8(bytes).map_err(|_| bad_request("Invalid preview token."))
}

fn is_managed_attachment_id(value: &str) -> bool {
    value.len() == 35
        && value.starts_with("ma_")
        && value[3..]
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}

fn allowed_codex_image(path: &Path) -> bool {
    let mut roots = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(home).join(".codex/generated_images"));
    }
    if let Some(home) = std::env::var_os("CODEX_HOME") {
        roots.push(PathBuf::from(home).join("generated_images"));
    }
    roots.into_iter().any(|root| {
        fs::canonicalize(root)
            .map(|root| path.starts_with(root))
            .unwrap_or(false)
    })
}

fn file_response(
    request: &http::Request<Vec<u8>>,
    path: &Path,
    content_type: &str,
) -> http::Response<Vec<u8>> {
    let mut builder = http::Response::builder()
        .header(http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(http::header::CACHE_CONTROL, "no-store")
        .header(http::header::CONTENT_TYPE, content_type);
    if content_type.starts_with("text/html") {
        builder = builder.header(
            http::header::CONTENT_SECURITY_POLICY,
            "default-src 'self' 'unsafe-inline' 'unsafe-eval' bifrostwrite-file: data: blob:; connect-src 'self' bifrostwrite-file:; img-src 'self' bifrostwrite-file: data: blob:; media-src 'self' bifrostwrite-file: data: blob:; frame-src 'self' bifrostwrite-file:; form-action 'none'",
        );
    }
    if request.method() == http::Method::HEAD {
        return builder.body(Vec::new()).unwrap();
    }
    match fs::read(path) {
        Ok(bytes) => builder.body(bytes).unwrap(),
        Err(_) => error_response(http::StatusCode::NOT_FOUND, "Not found"),
    }
}

fn error_response(status: http::StatusCode, message: &str) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header(http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(http::header::CACHE_CONTROL, "no-store")
        .header(http::header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap()
}

fn mime_type(path: &Path) -> String {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "html" | "htm" => "text/html; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "md" => "text/markdown; charset=utf-8",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn bad_request(message: &str) -> (http::StatusCode, String) {
    (http::StatusCode::BAD_REQUEST, message.to_string())
}

fn not_found() -> (http::StatusCode, String) {
    (http::StatusCode::NOT_FOUND, "Not found".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn managed_attachment_ids_reject_paths() {
        assert!(is_managed_attachment_id(
            "ma_0123456789abcdef0123456789abcdef"
        ));
        assert!(!is_managed_attachment_id(
            "../0123456789abcdef0123456789abcdef"
        ));
    }

    #[test]
    fn vault_preview_rejects_parent_components() {
        let directory = tempfile::tempdir().unwrap();
        assert!(resolve_vault_path(directory.path(), Path::new("../secret")).is_err());
    }
}
