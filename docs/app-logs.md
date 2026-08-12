# App Diagnostics

The renderer writes warnings and errors to the webview developer console. The
Tauri shell and native sidecar write diagnostics to stderr, which macOS exposes
through Console.app for the `BifrostWrite` process.

For development, start the application from a terminal to capture all sources:

```bash
cd apps/desktop
npm run dev 2>&1 | tee /tmp/bifrostwrite-dev.log
```

The native backend prefixes sidecar stderr with `[bifrostwrite-native]`; the
web clipper server uses `[bifrostwrite-clipper]`. Logs may contain local paths,
provider identifiers, runtime errors, and usernames. Secret-like fields in
sidecar protocol messages should never be shared without review.

AI chat history is separate from diagnostics. See
[AI Session History and Crash Recovery](ai-session-history.md).
