# Testing and Validation

## Standard checks

From the repository root:

```bash
cargo test
cargo test -p neverwrite-native-backend
```

From `apps/desktop`:

```bash
npm run lint
npm test
npm run renderer:build
npm run tauri:sidecar:build
npm run tauri:vault-editor:smoke
npm run tauri:ai-runtime:smoke
```

The Tauri shell has its own Cargo workspace:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Browser E2E harness

Install the Playwright browser once, then run the renderer harness:

```bash
cd apps/desktop
npx playwright install chromium
npm run test:e2e -- --project=chromium
```

The harness provides a minimal `window.__TAURI_INTERNALS__` mock; it does not
start the native application.

## Packaged macOS build

```bash
cd apps/desktop
node scripts/stage-tauri-sidecar.mjs --target aarch64-apple-darwin
npx tauri build --config src-tauri/tauri.conf.json \
  --target aarch64-apple-darwin --bundles dmg
BIFROSTWRITE_TAURI_RELEASE_TARGET=aarch64-apple-darwin \
  npm run tauri:sidecar:smoke:packaged
```

Verify the `.app` contains the native sidecar and no Electron Framework, mount
the DMG, copy the app to `/Applications`, and exercise vault open/save, AI,
multiple windows, file previews, deep links, and the web clipper loopback API.

## Version and release contract

```bash
node scripts/sync-tauri-version.mjs --check 0.7.1
```

The release workflow validates matching versions in the desktop package,
Tauri config, Tauri crate, and native backend crate. Tags are `vX.Y.Z`.
