use crate::BackendBridge;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use url::Url;

const PORT: u16 = 32145;
const AUTH_FILE: &str = "web_clipper_auth.json";
const TOKEN_HEADER: &str = "x-bifrostwrite-clipper-token";
const EXTENSION_ID_HEADER: &str = "x-bifrostwrite-extension-id";
const CHROME_EXTENSION_ID: &str = "pogmjgibofkooljfgaandhoinmenfhao";
const FIREFOX_EXTENSION_ID: &str = "web-clipper@bifrostwrite.app";
const CLIP_SAVED_EVENT: &str = "bifrostwrite:web-clipper/clip-saved";
const ROUTE_CLIP_EVENT: &str = "bifrostwrite:web-clipper/route-clip";

#[derive(Clone, Copy, PartialEq, Eq)]
enum IdentityKind {
    Chrome,
    Firefox,
    Development,
}

struct Identity {
    origin: String,
    kind: IdentityKind,
}

#[derive(Serialize, Deserialize)]
struct AuthState {
    token: String,
    #[serde(default)]
    firefox_origin: Option<String>,
}

pub fn start_server(app: AppHandle, bridge: Arc<BackendBridge>) -> Result<(), String> {
    let auth_path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(AUTH_FILE);
    let bridge = Arc::downgrade(&bridge);
    std::thread::spawn(move || {
        let address = format!("127.0.0.1:{PORT}");
        let server = match Server::http(&address) {
            Ok(server) => server,
            Err(error) => {
                eprintln!("[bifrostwrite-clipper] failed to listen on {address}: {error}");
                return;
            }
        };
        for request in server.incoming_requests() {
            let Some(bridge) = bridge.upgrade() else {
                let _ = respond(
                    request,
                    503,
                    None,
                    json!({"ok": false, "message": "BifrostWrite is shutting down."}),
                );
                break;
            };
            if let Err(error) = handle_request(request, &app, &bridge, &auth_path) {
                eprintln!("[bifrostwrite-clipper] request failed: {error}");
            }
        }
    });
    Ok(())
}

pub fn handle_deep_link(app: AppHandle, bridge: Arc<BackendBridge>, url: Url) {
    std::thread::spawn(move || {
        let result = (|| -> Result<(), String> {
            let query = url
                .query_pairs()
                .collect::<std::collections::HashMap<_, _>>();
            let required = |key: &str| {
                query
                    .get(key)
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| format!("Missing web clipper deep link parameter: {key}"))
            };
            let mode = required("mode")?;
            let content = if mode == "clipboard" {
                arboard::Clipboard::new()
                    .and_then(|mut clipboard| clipboard.get_text())
                    .map_err(|error| error.to_string())?
            } else if mode == "inline" {
                required("content")?
            } else {
                return Err("Unsupported web clipper deep link mode.".to_string());
            };
            if content.trim().is_empty() {
                return Err("Clip content is empty.".to_string());
            }
            let vault = query.get("vault").map(|value| value.trim().to_string());
            let args = json!({
                "requestId": required("requestId")?,
                "title": required("title")?,
                "folder": required("folder")?,
                "content": content,
                "vaultPathHint": query.get("vaultPathHint").map(|value| value.as_ref()).or_else(|| vault.as_deref().filter(|value| Path::new(value).is_absolute())),
                "vaultNameHint": query.get("vaultNameHint").map(|value| value.as_ref()).or_else(|| vault.as_deref().filter(|value| !Path::new(value).is_absolute())),
            });
            let payload = bridge.invoke("web_clipper_save_note".to_string(), args)?;
            emit_saved(&app, &payload);
            Ok(())
        })();
        if let Err(error) = result {
            eprintln!("[bifrostwrite-clipper] deep link failed: {error}");
        }
    });
}

fn handle_request(
    mut request: Request,
    app: &AppHandle,
    bridge: &BackendBridge,
    auth_path: &Path,
) -> Result<(), String> {
    let origin = header_value(&request, "origin");
    let extension_id = header_value(&request, EXTENSION_ID_HEADER);
    let identity = resolve_identity(origin.as_deref(), extension_id.as_deref());

    if request.method() == &Method::Options {
        return match identity {
            Ok(identity) => respond(request, 204, Some(&identity.origin), json!({"ok": true})),
            Err((status, message)) => auth_error(request, status, &message),
        };
    }

    let path = request.url().split('?').next().unwrap_or(request.url());
    if path == "/api/web-clipper/pair" {
        return match identity {
            Ok(identity) => {
                let state = pair(auth_path, &identity)?;
                respond(
                    request,
                    200,
                    Some(&identity.origin),
                    json!({"ok": true, "token": state.token}),
                )
            }
            Err((status, message)) => auth_error(request, status, &message),
        };
    }

    let identity = match identity {
        Ok(identity) => identity,
        Err((status, message)) => return auth_error(request, status, &message),
    };
    if let Err((status, message)) = authorize(&request, auth_path, &identity) {
        return auth_error(request, status, &message);
    }

    let route = format!("{} {}", request.method(), path);
    match route.as_str() {
        "GET /api/web-clipper/health" => {
            let vaults = bridge.invoke("web_clipper_ready_vaults".to_string(), json!({}))?;
            let count = vaults.as_array().map(Vec::len).unwrap_or_default();
            respond(
                request,
                200,
                Some(&identity.origin),
                json!({
                    "ok": true,
                    "message": if count == 0 { "BifrostWrite is running, but no vault is ready." } else { "BifrostWrite desktop API is ready." },
                    "vaults": vaults,
                }),
            )
        }
        "GET /api/web-clipper/themes" => respond(
            request,
            200,
            Some(&identity.origin),
            json!({"themes": themes()}),
        ),
        "POST /api/web-clipper/folders" | "POST /api/web-clipper/tags" => {
            let args = read_json(&mut request)?;
            let (command, folders) = if route.ends_with("/folders") {
                ("web_clipper_list_folders", true)
            } else {
                ("web_clipper_list_tags", false)
            };
            let values = bridge.invoke(command.to_string(), args)?;
            let payload = if folders {
                json!({"folders": values})
            } else {
                json!({"tags": values})
            };
            respond(request, 200, Some(&identity.origin), payload)
        }
        "POST /api/web-clipper/clips" => {
            let args = read_json(&mut request)?;
            if args
                .get("content")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or_default()
                .is_empty()
            {
                return respond(
                    request,
                    400,
                    Some(&identity.origin),
                    json!({"ok": false, "status": "error", "message": "Clip content is empty."}),
                );
            }
            match bridge.invoke("web_clipper_save_note".to_string(), args) {
                Ok(payload) => {
                    emit_saved(app, &payload);
                    respond(
                        request,
                        200,
                        Some(&identity.origin),
                        json!({
                            "ok": true,
                            "status": "saved",
                            "message": format!("Saved clip to {}.", payload.get("relativePath").and_then(Value::as_str).unwrap_or("the selected vault")),
                            "noteId": payload.get("noteId").cloned().unwrap_or(Value::Null),
                            "relativePath": payload.get("relativePath").cloned().unwrap_or(Value::Null),
                        }),
                    )
                }
                Err(error) => respond(
                    request,
                    400,
                    Some(&identity.origin),
                    json!({"ok": false, "status": "error", "message": "Unable to save clip. Please try again from BifrostWrite.", "detail": error}),
                ),
            }
        }
        _ => respond(
            request,
            404,
            Some(&identity.origin),
            json!({"ok": false, "message": "Not found."}),
        ),
    }
}

fn emit_saved(app: &AppHandle, payload: &Value) {
    let event = if payload
        .get("targetWindowLabel")
        .and_then(Value::as_str)
        .is_some()
    {
        CLIP_SAVED_EVENT
    } else {
        ROUTE_CLIP_EVENT
    };
    let _ = app.emit(event, payload.clone());
}

fn resolve_identity(
    origin: Option<&str>,
    extension_id: Option<&str>,
) -> Result<Identity, (u16, String)> {
    let extension_id = extension_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            (
                401,
                "Web clipper extension identity is required.".to_string(),
            )
        })?;
    let chrome_origin = format!("chrome-extension://{CHROME_EXTENSION_ID}");
    let origin = origin
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| (extension_id == CHROME_EXTENSION_ID).then(|| chrome_origin.clone()))
        .ok_or_else(|| (401, "Web clipper origin is required.".to_string()))?;

    if extension_id == CHROME_EXTENSION_ID && origin == chrome_origin {
        return Ok(Identity {
            origin,
            kind: IdentityKind::Chrome,
        });
    }
    if extension_id == FIREFOX_EXTENSION_ID && origin.starts_with("moz-extension://") {
        return Ok(Identity {
            origin,
            kind: IdentityKind::Firefox,
        });
    }
    if dev_origins().contains(&origin)
        && (origin.starts_with("chrome-extension://") || origin.starts_with("moz-extension://"))
    {
        return Ok(Identity {
            origin,
            kind: IdentityKind::Development,
        });
    }
    Err((403, "Web clipper extension is not allowed.".to_string()))
}

fn dev_origins() -> HashSet<String> {
    [
        "BIFROSTWRITE_WEB_CLIPPER_DEV_ORIGINS",
        "WEB_CLIPPER_DEV_ORIGINS",
    ]
    .into_iter()
    .filter_map(|key| std::env::var(key).ok())
    .flat_map(|value| {
        value
            .split([',', ';', '\n'])
            .map(str::trim)
            .map(str::to_string)
            .collect::<Vec<_>>()
    })
    .filter(|value| {
        value.starts_with("chrome-extension://") || value.starts_with("moz-extension://")
    })
    .collect()
}

fn authorize(
    request: &Request,
    auth_path: &Path,
    identity: &Identity,
) -> Result<(), (u16, String)> {
    let token = header_value(request, TOKEN_HEADER)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| (401, "Web clipper pairing is required.".to_string()))?;
    let state = load_or_create_auth(auth_path).map_err(|error| (500, error))?;
    if token != state.token {
        return Err((403, "Web clipper token is invalid.".to_string()));
    }
    if identity.kind == IdentityKind::Firefox
        && state.firefox_origin.as_deref() != Some(&identity.origin)
    {
        return Err((401, "Web clipper pairing is required.".to_string()));
    }
    Ok(())
}

fn pair(path: &Path, identity: &Identity) -> Result<AuthState, String> {
    let mut state = load_or_create_auth(path)?;
    if identity.kind == IdentityKind::Firefox
        && state.firefox_origin.as_deref() != Some(&identity.origin)
    {
        state.token = uuid::Uuid::new_v4().to_string();
        state.firefox_origin = Some(identity.origin.clone());
        write_auth(path, &state)?;
    }
    Ok(state)
}

fn load_or_create_auth(path: &Path) -> Result<AuthState, String> {
    if let Ok(value) = fs::read_to_string(path) {
        if let Ok(state) = serde_json::from_str::<AuthState>(&value) {
            if !state.token.is_empty() {
                return Ok(state);
            }
        }
    }
    let state = AuthState {
        token: uuid::Uuid::new_v4().to_string(),
        firefox_origin: None,
    };
    write_auth(path, &state)?;
    Ok(state)
}

fn write_auth(path: &Path, state: &AuthState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(
        path,
        serde_json::to_vec(state).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

fn read_json(request: &mut Request) -> Result<Value, String> {
    let mut body = String::new();
    request
        .as_reader()
        .read_to_string(&mut body)
        .map_err(|error| error.to_string())?;
    if body.trim().is_empty() {
        Ok(json!({}))
    } else {
        serde_json::from_str(&body).map_err(|error| error.to_string())
    }
}

fn header_value(request: &Request, name: &str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|header| header.field.to_string().eq_ignore_ascii_case(name))
        .map(|header| header.value.as_str().trim().to_string())
}

fn auth_error(request: Request, status: u16, message: &str) -> Result<(), String> {
    respond(
        request,
        status,
        None,
        json!({"ok": false, "status": "unauthorized", "message": message}),
    )
}

fn respond(request: Request, status: u16, origin: Option<&str>, body: Value) -> Result<(), String> {
    let content = if status == 204 {
        String::new()
    } else {
        body.to_string()
    };
    let mut response = Response::from_string(content).with_status_code(StatusCode(status));
    response.add_header(Header::from_bytes("content-type", "application/json").unwrap());
    if let Some(origin) = origin {
        response.add_header(Header::from_bytes("access-control-allow-origin", origin).unwrap());
        response.add_header(Header::from_bytes("vary", "Origin").unwrap());
        response.add_header(
            Header::from_bytes(
                "access-control-allow-headers",
                format!("{TOKEN_HEADER}, {EXTENSION_ID_HEADER}, content-type"),
            )
            .unwrap(),
        );
        response.add_header(
            Header::from_bytes("access-control-allow-methods", "GET,POST,OPTIONS").unwrap(),
        );
    }
    request.respond(response).map_err(|error| error.to_string())
}

fn themes() -> Vec<Value> {
    [
        ("default", "Default"),
        ("ocean", "Ocean"),
        ("forest", "Forest"),
        ("rose", "Rose"),
        ("amber", "Amber"),
        ("lavender", "Lavender"),
        ("nord", "Nord"),
        ("sunset", "Sunset"),
        ("catppuccin", "Catppuccin"),
        ("solarized", "Solarized"),
        ("tokyoNight", "Tokyo Night"),
        ("gruvbox", "Gruvbox"),
        ("ayu", "Ayu"),
        ("nightOwl", "Night Owl"),
        ("vesper", "Vesper"),
        ("rosePine", "Rose Pine"),
        ("kanagawa", "Kanagawa"),
        ("everforest", "Everforest"),
        ("synthwave84", "Synthwave 84"),
        ("claude", "Claude"),
        ("codex", "Codex"),
    ]
    .into_iter()
    .map(|(id, label)| json!({"id": id, "label": label}))
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_official_extension_id_origin_pairs() {
        assert!(resolve_identity(
            Some("chrome-extension://pogmjgibofkooljfgaandhoinmenfhao"),
            Some(CHROME_EXTENSION_ID),
        )
        .is_ok());
        assert!(resolve_identity(
            Some("chrome-extension://attacker"),
            Some(CHROME_EXTENSION_ID),
        )
        .is_err());
        assert!(resolve_identity(
            Some("moz-extension://runtime-generated-origin"),
            Some(FIREFOX_EXTENSION_ID),
        )
        .is_ok());
    }

    #[test]
    fn firefox_pairing_binds_and_rotates_the_token() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(AUTH_FILE);
        let first = Identity {
            origin: "moz-extension://first".to_string(),
            kind: IdentityKind::Firefox,
        };
        let second = Identity {
            origin: "moz-extension://second".to_string(),
            kind: IdentityKind::Firefox,
        };
        let first_state = pair(&path, &first).unwrap();
        let repeated_state = pair(&path, &first).unwrap();
        let second_state = pair(&path, &second).unwrap();

        assert_eq!(first_state.token, repeated_state.token);
        assert_ne!(first_state.token, second_state.token);
        assert_eq!(
            second_state.firefox_origin.as_deref(),
            Some("moz-extension://second")
        );
    }
}
