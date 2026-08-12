## BifrostWrite app icons

- `sources/BifrostWrite-macos26.icon` is the macOS 26 Icon Composer source.
- `sources/BifrostWrite-symbol-1024.png` is the original symbol extracted from that package.
- `sources/BifrostWrite-macos15-1024.png` is the legacy 1024x1024 render used to generate the current desktop bundle icons for macOS 15, Windows, and other classic targets.

The generated classic assets (`icon.icns`, `icon.ico`, PNG sizes) now live under
`apps/desktop/build/icons/` and are consumed by the Tauri release pipeline.
The `.icon` source is kept in the repo so the macOS 26 version stays aligned with
the exported desktop assets.
