mod preview;
mod updater;
mod web_clipper;

use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::ffi::OsString;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    window::{Effect, EffectState, EffectsBuilder},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

const PRODUCT_NAME: &str = "BifrostWrite";
const OPEN_SETTINGS_MENU_ID: &str = "app:open-settings";
const MENU_ACTION_EVENT: &str = "menu-action";
const PREVIEW_SCHEME: &str = "bifrostwrite-file";
const BACKEND_BINARY: &str = if cfg!(windows) {
    "neverwrite-native-backend.exe"
} else {
    "neverwrite-native-backend"
};

type BackendResult = Result<Value, String>;

struct BackendBridge {
    child: Mutex<Child>,
    stdin: Mutex<ChildStdin>,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<BackendResult>>>>,
    next_id: AtomicU64,
}

impl BackendBridge {
    fn start(app: &AppHandle) -> Result<Arc<Self>, String> {
        let executable = resolve_backend_path(app)?;
        let mut command = Command::new(&executable);
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        configure_backend_environment(app, &executable, &mut command)?;

        let mut child = command.spawn().map_err(|error| {
            format!(
                "Failed to start native backend at {}: {error}",
                executable.display()
            )
        })?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Native backend stdin is unavailable.".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Native backend stdout is unavailable.".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Native backend stderr is unavailable.".to_string())?;

        let pending = Arc::new(Mutex::new(
            HashMap::<u64, mpsc::Sender<BackendResult>>::new(),
        ));
        let bridge = Arc::new(Self {
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            pending: pending.clone(),
            next_id: AtomicU64::new(1),
        });

        let event_app = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                let Ok(message) = serde_json::from_str::<Value>(&line) else {
                    eprintln!("[bifrostwrite-native] invalid JSON output: {line}");
                    continue;
                };

                match message.get("type").and_then(Value::as_str) {
                    Some("event") => {
                        if let Some(event_name) = message
                            .get("eventName")
                            .or_else(|| message.get("event_name"))
                            .and_then(Value::as_str)
                        {
                            let payload = message.get("payload").cloned().unwrap_or(Value::Null);
                            let _ = event_app.emit(event_name, payload);
                        }
                    }
                    Some("response") => {
                        let Some(id) = message.get("id").and_then(Value::as_u64) else {
                            continue;
                        };
                        let sender = pending
                            .lock()
                            .ok()
                            .and_then(|mut entries| entries.remove(&id));
                        if let Some(sender) = sender {
                            let result = if message.get("ok").and_then(Value::as_bool) == Some(true)
                            {
                                Ok(message.get("result").cloned().unwrap_or(Value::Null))
                            } else {
                                Err(message
                                    .get("error")
                                    .and_then(Value::as_str)
                                    .unwrap_or("Native backend command failed.")
                                    .to_string())
                            };
                            let _ = sender.send(result);
                        }
                    }
                    _ => {}
                }
            }

            if let Ok(mut entries) = pending.lock() {
                for (_, sender) in entries.drain() {
                    let _ = sender.send(Err("Native backend stopped unexpectedly.".to_string()));
                }
            }
        });

        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                eprintln!("[bifrostwrite-native] {line}");
            }
        });

        Ok(bridge)
    }

    fn invoke(&self, command: String, args: Value) -> BackendResult {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = mpsc::channel();
        self.pending
            .lock()
            .map_err(|error| error.to_string())?
            .insert(id, sender);

        let payload = serde_json::to_string(&json!({
            "id": id,
            "command": command,
            "args": args,
        }))
        .map_err(|error| error.to_string())?;

        let write_result = self
            .stdin
            .lock()
            .map_err(|error| error.to_string())?
            .write_all(format!("{payload}\n").as_bytes());
        if let Err(error) = write_result {
            if let Ok(mut pending) = self.pending.lock() {
                pending.remove(&id);
            }
            return Err(format!("Failed to send native backend command: {error}"));
        }

        receiver
            .recv()
            .map_err(|_| "Native backend response channel closed.".to_string())?
    }
}

impl Drop for BackendBridge {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..")
}

fn resolve_backend_path(app: &AppHandle) -> Result<PathBuf, String> {
    for key in ["BIFROSTWRITE_NATIVE_BACKEND_PATH"] {
        if let Some(path) = env::var_os(key).map(PathBuf::from) {
            if path.is_file() {
                return Ok(path);
            }
            return Err(format!(
                "Configured native backend does not exist: {}",
                path.display()
            ));
        }
    }

    if !cfg!(debug_assertions) {
        let path = app
            .path()
            .resource_dir()
            .map_err(|error| error.to_string())?
            .join("native-backend")
            .join(BACKEND_BINARY);
        if path.is_file() {
            return Ok(path);
        }
        return Err(format!(
            "Packaged native backend is missing: {}",
            path.display()
        ));
    }

    let root = workspace_root();
    for profile in ["debug", "release"] {
        let path = root.join("target").join(profile).join(BACKEND_BINARY);
        if path.is_file() {
            return Ok(path);
        }
    }
    Err(format!(
        "Native backend is not built. Run `cargo build -p neverwrite-native-backend` from {}.",
        root.display()
    ))
}

fn configure_backend_environment(
    app: &AppHandle,
    executable: &Path,
    command: &mut Command,
) -> Result<(), String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&app_data).map_err(|error| error.to_string())?;
    command.env("BIFROSTWRITE_APP_DATA_DIR", &app_data).env(
        "BIFROSTWRITE_AI_SECRET_SERVICE",
        "com.bifrostwrite.desktop.ai",
    );

    if let Some(path) = backend_path_environment() {
        command.env("PATH", path);
    }

    if cfg!(debug_assertions) {
        command.env("BIFROSTWRITE_WORKSPACE_ROOT", workspace_root());
    }

    if let Some(resource_root) = executable.parent() {
        command
            .env("BIFROSTWRITE_ACP_RESOURCE_DIR", resource_root)
            .env("BIFROSTWRITE_TAURI_ACP_RESOURCE_DIR", resource_root);
    }

    Ok(())
}

fn backend_path_environment() -> Option<OsString> {
    let mut paths = env::split_paths(&env::var_os("PATH").unwrap_or_default()).collect::<Vec<_>>();
    for path in [
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/opt/homebrew/sbin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/local/sbin"),
    ] {
        if !paths.contains(&path) {
            paths.push(path);
        }
    }
    if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
        for relative in [".local/bin", ".cargo/bin", ".bun/bin", ".grok/bin"] {
            let path = home.join(relative);
            if !paths.contains(&path) {
                paths.push(path);
            }
        }
    }
    env::join_paths(paths).ok()
}

fn system_username() -> Option<String> {
    ["USER", "USERNAME"]
        .into_iter()
        .find_map(|key| env::var(key).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[tauri::command]
async fn backend_invoke(
    app: AppHandle,
    bridge: tauri::State<'_, Arc<BackendBridge>>,
    command: String,
    args: Option<Value>,
) -> BackendResult {
    match command.as_str() {
        "get_system_username" => return Ok(json!(system_username())),
        "sync_native_menu_shortcuts" | "set_native_menu_shortcut_capture" => {
            return Ok(json!(true));
        }
        "get_app_update_configuration" => {
            return Ok(updater::configuration(&app));
        }
        "check_for_app_update" => {
            let updater_app = app.clone();
            return tauri::async_runtime::spawn_blocking(move || {
                updater::check_for_update(&updater_app)
            })
            .await
            .map_err(|error| error.to_string())?;
        }
        "download_and_install_app_update" => {
            let updater_app = app.clone();
            let updater_args = args.unwrap_or_else(|| json!({}));
            let result = tauri::async_runtime::spawn_blocking(move || {
                updater::download_and_prepare_install(&updater_app, &updater_args)
            })
            .await
            .map_err(|error| error.to_string())??;
            updater::schedule_exit(app);
            return Ok(result);
        }
        "ai_resolve_managed_attachment_path" => {
            return Err("Private backend command.".to_string());
        }
        "ai_reveal_managed_attachment" => {
            let bridge = bridge.inner().clone();
            let result = tauri::async_runtime::spawn_blocking(move || {
                bridge.invoke(
                    "ai_resolve_managed_attachment_path".to_string(),
                    args.unwrap_or_else(|| json!({})),
                )
            })
            .await
            .map_err(|error| error.to_string())??;
            let path = result
                .get("path")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "Managed attachment path was not resolved.".to_string())?;
            app.opener()
                .reveal_item_in_dir(path)
                .map_err(|error| error.to_string())?;
            return Ok(Value::Null);
        }
        _ => {}
    }

    let bridge = bridge.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        bridge.invoke(command, args.unwrap_or_else(|| json!({})))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn emit_deep_links(app: &AppHandle, urls: &[url::Url]) {
    for url in urls {
        if url.scheme() != "bifrostwrite" {
            continue;
        }
        let action = url
            .host_str()
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| url.path().trim_start_matches('/'));
        if action == "open" {
            if let Some(path) = url
                .query_pairs()
                .find_map(|(key, value)| (key == "path").then(|| value.into_owned()))
                .filter(|value| !value.trim().is_empty())
            {
                let (line, end_line) = parse_line_fragment(url.fragment());
                let _ = app.emit(
                    "bifrostwrite:deep-link/open-file",
                    json!({ "path": path, "line": line, "endLine": end_line }),
                );
            }
        } else if action == "clip" {
            if let Some(bridge) = app.try_state::<Arc<BackendBridge>>() {
                web_clipper::handle_deep_link(app.clone(), bridge.inner().clone(), url.clone());
            }
        }
    }
}

fn parse_line_fragment(fragment: Option<&str>) -> (Option<u64>, Option<u64>) {
    let Some(fragment) = fragment.and_then(|value| value.strip_prefix('L')) else {
        return (None, None);
    };
    let mut parts = fragment.splitn(2, '-');
    let line = parts.next().and_then(|value| value.parse::<u64>().ok());
    let end_line = parts
        .next()
        .map(|value| value.trim_start_matches('L'))
        .and_then(|value| value.parse::<u64>().ok());
    (
        line.filter(|value| *value > 0),
        end_line.filter(|value| *value > 0),
    )
}

pub fn run() {
    tauri::Builder::default()
        .menu(|app| {
            let menu = Menu::default(app)?;

            #[cfg(target_os = "macos")]
            if let Some(app_submenu) = menu
                .items()?
                .into_iter()
                .next()
                .and_then(|item| item.as_submenu().cloned())
            {
                let settings = MenuItem::with_id(
                    app,
                    OPEN_SETTINGS_MENU_ID,
                    "Settings…",
                    true,
                    Some("Command+,"),
                )?;
                app_submenu.insert(&settings, 1)?;
            }

            Ok(menu)
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == OPEN_SETTINGS_MENU_ID {
                let _ = app.emit(MENU_ACTION_EVENT, OPEN_SETTINGS_MENU_ID);
            }
        })
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            let urls = argv
                .iter()
                .filter_map(|value| url::Url::parse(value).ok())
                .collect::<Vec<_>>();
            emit_deep_links(app, &urls);
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol(PREVIEW_SCHEME, preview::handle_request)
        .setup(|app| {
            let bridge = BackendBridge::start(app.handle())?;
            app.manage(bridge.clone());

            web_clipper::start_server(app.handle().clone(), bridge)?;

            let handle = app.handle().clone();
            if let Some(urls) = app.deep_link().get_current()? {
                emit_deep_links(&handle, &urls);
            }
            app.deep_link().on_open_url(move |event| {
                emit_deep_links(&handle, &event.urls());
            });

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(PRODUCT_NAME);
                let _ = window.set_effects(
                    EffectsBuilder::new()
                        .effects([
                            Effect::UnderWindowBackground,
                            Effect::Mica,
                            Effect::Acrylic,
                        ])
                        .state(EffectState::FollowsWindowActiveState)
                        .radius(12.0)
                        .build(),
                );
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![backend_invoke])
        .run(tauri::generate_context!())
        .expect("failed to run BifrostWrite");
}

#[cfg(test)]
mod tests {
    use super::parse_line_fragment;

    #[test]
    fn parses_deep_link_line_fragments() {
        assert_eq!(parse_line_fragment(Some("L10")), (Some(10), None));
        assert_eq!(parse_line_fragment(Some("L10-L20")), (Some(10), Some(20)));
        assert_eq!(parse_line_fragment(Some("invalid")), (None, None));
    }
}
