# Project Architecture

BifrostWrite is a local-first React application packaged with Tauri 2. The
desktop shell uses the operating system webview instead of bundling Chromium.

## Runtime path

```text
React/Vite renderer
  -> @bifrostwrite/runtime
  -> Tauri commands, plugins, windows, and events
  -> Rust Tauri shell (apps/desktop/src-tauri)
  -> JSON-lines native sidecar (neverwrite-native-backend)
  -> vault files, search/index, terminals, spellcheck, and ACP runtimes
```

The renderer has no direct filesystem or process access. Native dialogs,
opening paths, window management, deep links, and cross-window events use
Tauri APIs. Domain commands are sent through `backend_invoke`; the shell keeps
one sidecar process alive, correlates request IDs, and broadcasts sidecar
events to every webview window.

## Main directories

```text
apps/desktop/src/                 React renderer and runtime facade
apps/desktop/src-tauri/           Tauri shell, preview protocol, clipper API
apps/desktop/native-backend/      Rust domain sidecar
apps/desktop/scripts/             Runtime staging and smoke tests
apps/web-clipper/                 Browser extension
crates/                           Shared Rust domain crates
vendor/                           Bundled ACP runtimes and compatibility code
```

The Tauri shell owns:

- sidecar startup, shutdown, environment, and RPC;
- `bifrostwrite://` deep links and single-instance routing;
- `bifrostwrite-file://` vault/attachment preview requests;
- native windows, dialogs, opener actions, and event delivery;
- the authenticated loopback web-clipper API on `127.0.0.1:32145`;
- GitHub Release update discovery, verified DMG download, atomic app-bundle
  replacement, rollback, and restart handoff.

The native backend owns vault CRUD, search/indexing, filesystem watching, AI
runtime/session/history management, terminal sessions, spellcheck, grammar,
and web-clipper save commands. Hidden `.neverwrite` vault directories remain
for data compatibility with existing installations.

## Distribution

macOS release tags build separate Apple Silicon and Intel DMGs. GitHub Release
publishes both assets and their checksums. The in-app updater verifies the
architecture-specific DMG checksum and app signature before an atomic
replacement with rollback. Stable releases are also published through
`bifrost-proxy/homebrew-bifrost` as `Casks/bifrostwrite.rb`.

```bash
brew tap bifrost-proxy/bifrost
brew install --cask bifrostwrite
```

See [Testing and Validation](testing.md), [Deep Links](deep-links.md), and
[Data and Privacy](data-and-privacy.md).
