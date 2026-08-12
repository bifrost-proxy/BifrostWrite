use reqwest::blocking::{Client, Response};
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::env;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::AppHandle;
use uuid::Uuid;

const RELEASES_API_URL: &str =
    "https://api.github.com/repos/bifrost-proxy/BifrostWrite/releases?per_page=100";
const USER_AGENT: &str = "BifrostWrite-Updater";

const MACOS_INSTALL_HELPER: &str = r#"#!/bin/sh
set -eu

old_pid="$1"
dmg="$2"
target="$3"
expected_version="$4"
work_dir="$5"
mount_dir="$work_dir/mount"
parent=$(dirname "$target")
name=$(basename "$target")
staging="$parent/.$name.upgrade-$old_pid"
backup="$parent/.$name.backup"
log_dir="$HOME/Library/Logs/BifrostWrite"
log_file="$log_dir/updater.log"
mkdir -p "$log_dir" "$mount_dir"
exec >>"$log_file" 2>&1

mounted=0
cleanup() {
  if [ "$mounted" -eq 1 ]; then
    hdiutil detach "$mount_dir" -quiet || true
  fi
  rm -rf "$mount_dir" "$dmg" "$work_dir" || true
}
fail() {
  echo "BifrostWrite update failed: $1"
  if [ -d "$target" ]; then
    open "$target" || true
  fi
  exit 1
}
trap cleanup EXIT

echo "Waiting for BifrostWrite process $old_pid to exit"
count=0
while kill -0 "$old_pid" 2>/dev/null; do
  count=$((count + 1))
  [ "$count" -le 120 ] || fail "old process did not exit"
  sleep 0.5
done

if [ ! -d "$target" ] && [ -d "$backup" ]; then
  mv "$backup" "$target" || fail "could not restore interrupted backup"
fi
rm -rf "$staging"
if [ -d "$target" ]; then
  rm -rf "$backup"
fi

hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg" -quiet || fail "could not mount DMG"
mounted=1
source_app="$mount_dir/BifrostWrite.app"
[ -d "$source_app" ] || fail "DMG does not contain BifrostWrite.app"
codesign --verify --deep --strict "$source_app" || fail "source app signature verification failed"
source_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$source_app/Contents/Info.plist")
[ "$source_version" = "$expected_version" ] || fail "source app version is $source_version, expected $expected_version"

ditto "$source_app" "$staging" || fail "could not stage new app"
codesign --verify --deep --strict "$staging" || fail "staged app signature verification failed"
staged_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$staging/Contents/Info.plist")
[ "$staged_version" = "$expected_version" ] || fail "staged app version is $staged_version, expected $expected_version"

if [ -d "$target" ]; then
  mv "$target" "$backup" || fail "could not back up current app"
fi
if ! mv "$staging" "$target"; then
  if [ -d "$backup" ]; then
    mv "$backup" "$target" || true
  fi
  fail "could not activate new app"
fi
rm -rf "$backup"
xattr -cr "$target" || true
echo "BifrostWrite $expected_version installed successfully"
open "$target" || fail "could not restart updated app"
"#;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UpdateChannel {
    Stable,
    Beta,
}

impl UpdateChannel {
    fn as_str(self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::Beta => "beta",
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: Option<String>,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<GitHubAsset>,
}

fn current_version(app: &AppHandle) -> Result<Version, String> {
    Version::parse(&app.package_info().version.to_string())
        .map_err(|error| format!("Invalid installed version: {error}"))
}

fn update_channel(version: &Version) -> UpdateChannel {
    match env::var("BIFROSTWRITE_UPDATE_CHANNEL")
        .ok()
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("beta") | Some("prerelease") => UpdateChannel::Beta,
        Some("stable") => UpdateChannel::Stable,
        _ if !version.pre.is_empty() => UpdateChannel::Beta,
        _ => UpdateChannel::Stable,
    }
}

fn current_target() -> Option<&'static str> {
    match (env::consts::OS, env::consts::ARCH) {
        ("macos", "aarch64") => Some("aarch64-apple-darwin"),
        ("macos", "x86_64") => Some("x86_64-apple-darwin"),
        _ => None,
    }
}

fn release_version(tag: &str) -> Option<Version> {
    Version::parse(tag.strip_prefix('v').unwrap_or(tag)).ok()
}

fn channel_allows_release(
    channel: UpdateChannel,
    release: &GitHubRelease,
    version: &Version,
) -> bool {
    if release.draft {
        return false;
    }
    match channel {
        UpdateChannel::Stable => !release.prerelease && version.pre.is_empty(),
        UpdateChannel::Beta => true,
    }
}

fn asset_name(version: &Version, target: &str) -> String {
    format!("BifrostWrite-v{version}-{target}.dmg")
}

fn find_asset<'a>(release: &'a GitHubRelease, name: &str) -> Option<&'a GitHubAsset> {
    release.assets.iter().find(|asset| asset.name == name)
}

fn pick_update<'a>(
    releases: &'a [GitHubRelease],
    current: &Version,
    channel: UpdateChannel,
    target: &str,
) -> Option<(&'a GitHubRelease, Version, &'a GitHubAsset)> {
    releases
        .iter()
        .filter_map(|release| {
            let version = release_version(&release.tag_name)?;
            if version <= *current || !channel_allows_release(channel, release, &version) {
                return None;
            }
            let asset = find_asset(release, &asset_name(&version, target))?;
            Some((release, version, asset))
        })
        .max_by(|(_, left, _), (_, right, _)| left.cmp(right))
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(15 * 60))
        .build()
        .map_err(|error| format!("Failed to create updater HTTP client: {error}"))
}

fn successful(response: Response, description: &str) -> Result<Response, String> {
    if response.status().is_success() {
        Ok(response)
    } else {
        Err(format!(
            "Failed to {description}: GitHub returned HTTP {}",
            response.status()
        ))
    }
}

fn fetch_releases(client: &Client) -> Result<Vec<GitHubRelease>, String> {
    successful(
        client
            .get(RELEASES_API_URL)
            .send()
            .map_err(|error| format!("Failed to query BifrostWrite releases: {error}"))?,
        "query BifrostWrite releases",
    )?
    .json::<Vec<GitHubRelease>>()
    .map_err(|error| format!("Failed to parse BifrostWrite releases: {error}"))
}

fn base_status(app: &AppHandle, message: Option<String>, update: Value) -> Value {
    let version = app.package_info().version.to_string();
    let parsed = Version::parse(&version).unwrap_or_else(|_| Version::new(0, 0, 0));
    json!({
        "enabled": current_target().is_some(),
        "currentVersion": version,
        "channel": update_channel(&parsed).as_str(),
        "endpoint": RELEASES_API_URL,
        "message": message,
        "update": update,
    })
}

pub fn configuration(app: &AppHandle) -> Value {
    let message = if current_target().is_some() {
        "BifrostWrite automatically checks GitHub Releases. Installation starts only after confirmation."
    } else {
        "In-app updates are currently available on macOS only."
    };
    base_status(app, Some(message.to_string()), Value::Null)
}

pub fn check_for_update(app: &AppHandle) -> Result<Value, String> {
    let target = current_target()
        .ok_or_else(|| "In-app updates are currently available on macOS only.".to_string())?;
    let current = current_version(app)?;
    let channel = update_channel(&current);
    let releases = fetch_releases(&http_client()?)?;
    let Some((release, version, asset)) = pick_update(&releases, &current, channel, target) else {
        return Ok(base_status(
            app,
            Some(format!("BifrostWrite {current} is up to date.")),
            Value::Null,
        ));
    };

    let raw_json = serde_json::to_value(release).unwrap_or(Value::Null);
    Ok(base_status(
        app,
        Some(format!("BifrostWrite {version} is available.")),
        json!({
            "body": release.body,
            "currentVersion": current.to_string(),
            "version": version.to_string(),
            "date": release.published_at,
            "rawJson": raw_json,
            "target": target,
            "downloadUrl": asset.browser_download_url,
        }),
    ))
}

fn parse_checksum(value: &str) -> Result<String, String> {
    let checksum = value
        .split_whitespace()
        .next()
        .filter(|value| value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit()))
        .ok_or_else(|| "Release checksum file is invalid.".to_string())?;
    Ok(checksum.to_ascii_lowercase())
}

fn download_file(client: &Client, url: &str, destination: &Path) -> Result<String, String> {
    let mut response = successful(
        client
            .get(url)
            .send()
            .map_err(|error| format!("Failed to download {url}: {error}"))?,
        "download update asset",
    )?;
    let mut output = File::create(destination)
        .map_err(|error| format!("Failed to create {}: {error}", destination.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|error| format!("Failed while downloading {url}: {error}"))?;
        if read == 0 {
            break;
        }
        output
            .write_all(&buffer[..read])
            .map_err(|error| format!("Failed to write {}: {error}", destination.display()))?;
        hasher.update(&buffer[..read]);
    }
    output
        .sync_all()
        .map_err(|error| format!("Failed to flush {}: {error}", destination.display()))?;
    Ok(format!("{:x}", hasher.finalize()))
}

fn current_app_bundle() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        if let Some(path) = env::var_os("BIFROSTWRITE_UPDATE_TEST_APP_PATH") {
            return Ok(PathBuf::from(path));
        }
    }
    let executable =
        env::current_exe().map_err(|error| format!("Failed to locate the running app: {error}"))?;
    executable
        .ancestors()
        .find(|path| path.extension().and_then(|value| value.to_str()) == Some("app"))
        .map(Path::to_path_buf)
        .ok_or_else(|| "The running executable is not inside a macOS app bundle.".to_string())
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)
        .map_err(|error| format!("Failed to read updater helper permissions: {error}"))?
        .permissions();
    permissions.set_mode(0o700);
    fs::set_permissions(path, permissions)
        .map_err(|error| format!("Failed to set updater helper permissions: {error}"))
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn spawn_macos_install_helper(
    package: &Path,
    target_app: &Path,
    version: &Version,
    work_dir: &Path,
) -> Result<(), String> {
    let helper = work_dir.join("install-update.sh");
    fs::write(&helper, MACOS_INSTALL_HELPER)
        .map_err(|error| format!("Failed to create updater helper: {error}"))?;
    make_executable(&helper)?;
    Command::new("/bin/sh")
        .arg(&helper)
        .arg(std::process::id().to_string())
        .arg(package)
        .arg(target_app)
        .arg(version.to_string())
        .arg(work_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Failed to start updater helper: {error}"))?;
    Ok(())
}

pub fn download_and_prepare_install(app: &AppHandle, args: &Value) -> Result<Value, String> {
    let target = args
        .get("target")
        .and_then(Value::as_str)
        .ok_or_else(|| "Update target is missing.".to_string())?;
    let expected_target = current_target()
        .ok_or_else(|| "In-app updates are currently available on macOS only.".to_string())?;
    if target != expected_target {
        return Err(format!("Update target {target} does not match this Mac."));
    }
    let version_text = args
        .get("version")
        .and_then(Value::as_str)
        .ok_or_else(|| "Update version is missing.".to_string())?;
    let version = Version::parse(version_text)
        .map_err(|error| format!("Update version is invalid: {error}"))?;
    let current = current_version(app)?;
    if version <= current {
        return Err(format!(
            "Update version {version} is not newer than installed version {current}."
        ));
    }

    let channel = update_channel(&current);
    let client = http_client()?;
    let releases = fetch_releases(&client)?;
    let release = releases
        .iter()
        .find(|release| release_version(&release.tag_name).as_ref() == Some(&version))
        .filter(|release| channel_allows_release(channel, release, &version))
        .ok_or_else(|| {
            format!("BifrostWrite {version} is not published on this update channel.")
        })?;
    let package_name = asset_name(&version, target);
    let package_asset = find_asset(release, &package_name)
        .ok_or_else(|| format!("Release asset {package_name} is missing."))?;
    let checksum_name = format!("{package_name}.sha256");
    let checksum_asset = find_asset(release, &checksum_name)
        .ok_or_else(|| format!("Release checksum {checksum_name} is missing."))?;

    let expected_checksum = parse_checksum(
        &successful(
            client
                .get(&checksum_asset.browser_download_url)
                .send()
                .map_err(|error| format!("Failed to download update checksum: {error}"))?,
            "download update checksum",
        )?
        .text()
        .map_err(|error| format!("Failed to read update checksum: {error}"))?,
    )?;
    let work_dir = env::temp_dir().join(format!("bifrostwrite-update-{}", Uuid::new_v4()));
    fs::create_dir_all(&work_dir)
        .map_err(|error| format!("Failed to create updater directory: {error}"))?;
    let package = work_dir.join(&package_name);
    let actual_checksum = download_file(&client, &package_asset.browser_download_url, &package)
        .inspect_err(|_| {
            let _ = fs::remove_dir_all(&work_dir);
        })?;
    if actual_checksum != expected_checksum {
        let _ = fs::remove_dir_all(&work_dir);
        return Err(format!(
            "Update checksum mismatch: expected {expected_checksum}, received {actual_checksum}."
        ));
    }

    let target_app = current_app_bundle()?;
    spawn_macos_install_helper(&package, &target_app, &version, &work_dir).inspect_err(|_| {
        let _ = fs::remove_dir_all(&work_dir);
    })?;
    Ok(json!({ "scheduled": true, "version": version.to_string() }))
}

pub fn schedule_exit(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(500));
        app.exit(0);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release(tag: &str, prerelease: bool, assets: &[&str]) -> GitHubRelease {
        GitHubRelease {
            tag_name: tag.to_string(),
            html_url: format!("https://example.test/{tag}"),
            body: Some(format!("notes for {tag}")),
            published_at: Some("2026-08-13T00:00:00Z".to_string()),
            draft: false,
            prerelease,
            assets: assets
                .iter()
                .map(|name| GitHubAsset {
                    name: (*name).to_string(),
                    browser_download_url: format!("https://example.test/{name}"),
                })
                .collect(),
        }
    }

    #[test]
    fn stable_channel_ignores_prereleases() {
        let releases = vec![
            release(
                "v1.1.0-beta.1",
                true,
                &["BifrostWrite-v1.1.0-beta.1-aarch64-apple-darwin.dmg"],
            ),
            release(
                "v1.0.0",
                false,
                &["BifrostWrite-v1.0.0-aarch64-apple-darwin.dmg"],
            ),
        ];
        let picked = pick_update(
            &releases,
            &Version::parse("0.9.0").unwrap(),
            UpdateChannel::Stable,
            "aarch64-apple-darwin",
        )
        .unwrap();
        assert_eq!(picked.1, Version::parse("1.0.0").unwrap());
    }

    #[test]
    fn beta_channel_selects_highest_published_version_with_matching_asset() {
        let releases = vec![
            release(
                "v1.0.0-beta.2",
                true,
                &["BifrostWrite-v1.0.0-beta.2-aarch64-apple-darwin.dmg"],
            ),
            release(
                "v1.0.0-beta.3",
                true,
                &["BifrostWrite-v1.0.0-beta.3-x86_64-apple-darwin.dmg"],
            ),
        ];
        let picked = pick_update(
            &releases,
            &Version::parse("1.0.0-beta.1").unwrap(),
            UpdateChannel::Beta,
            "aarch64-apple-darwin",
        )
        .unwrap();
        assert_eq!(picked.1, Version::parse("1.0.0-beta.2").unwrap());
    }

    #[test]
    fn checksum_parser_rejects_untrusted_content() {
        assert_eq!(
            parse_checksum(&format!("{}  app.dmg\n", "a".repeat(64))).unwrap(),
            "a".repeat(64)
        );
        assert!(parse_checksum("not-a-checksum app.dmg").is_err());
    }

    #[test]
    fn install_helper_contains_verification_backup_and_rollback_steps() {
        assert!(MACOS_INSTALL_HELPER.contains("codesign --verify --deep --strict"));
        assert!(MACOS_INSTALL_HELPER.contains("CFBundleShortVersionString"));
        assert!(MACOS_INSTALL_HELPER.contains(".$name.backup"));
        assert!(MACOS_INSTALL_HELPER.contains("mv \"$backup\" \"$target\""));
        assert!(MACOS_INSTALL_HELPER.contains("open \"$target\""));
    }
}
