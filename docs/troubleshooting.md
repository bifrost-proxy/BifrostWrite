# Troubleshooting

## Application does not start

Run the installed executable from Terminal to see Tauri and sidecar errors:

```bash
/Applications/BifrostWrite.app/Contents/MacOS/bifrostwrite
```

For development, build the sidecar before starting Tauri:

```bash
cargo build -p neverwrite-native-backend
cd apps/desktop
npm run dev
```

Use `BIFROSTWRITE_NATIVE_BACKEND_PATH=/absolute/path/to/neverwrite-native-backend`
to test a specific sidecar binary.

## AI runtime is not found

GUI applications receive a smaller `PATH` than interactive shells. The Tauri
shell adds common Homebrew and user binary directories, but explicit overrides
remain the most deterministic option:

```text
BIFROSTWRITE_CODEX_ACP_BIN
BIFROSTWRITE_CLAUDE_ACP_BIN
BIFROSTWRITE_GROK_ACP_BIN
BIFROSTWRITE_KILO_ACP_BIN
BIFROSTWRITE_OPENCODE_ACP_BIN
```

Then run `npm run tauri:ai-runtime:smoke` from `apps/desktop`.

## Deep links

Re-register a local packaged build and target it explicitly:

```bash
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f /Applications/BifrostWrite.app
open -a BifrostWrite 'bifrostwrite://open?path=notes/todo.md#L10'
```

## Web clipper

The desktop API listens on `127.0.0.1:32145`. Pairing state is stored in the
Tauri app-data directory as `web_clipper_auth.json`. Check that the desktop app
is running, a vault is fully open, and another process is not using the port.

## Homebrew installation

```bash
brew update
brew reinstall --cask bifrostwrite
brew info --cask bifrostwrite
```

If Gatekeeper reports a damaged app, verify the release DMG checksum and the
app signature before changing quarantine attributes.
