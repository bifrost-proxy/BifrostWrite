# Contributing to BifrostWrite

Thanks for your interest in contributing to BifrostWrite. This guide covers everything you need to get started.

## Prerequisites

| Tool | Version | Notes |
| ------ | --------- | ------- |
| **Node.js** | 22+ | Required for desktop app and CI |
| **npm** | 11+ | Package manager for `apps/desktop` |
| **pnpm** | 10.33+ | Package manager for `apps/web-clipper` |
| **Rust** | 1.96.0 | Pinned by `rust-toolchain.toml`; Edition 2021 across all crates |

### Platform-specific

- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: MSVC Build Tools, WebView2
- **Linux**: Tauri 2 system WebView and Rust build dependencies (`build-essential`, `pkg-config`, `curl`, `wget`, WebKitGTK)

## Repository structure

```text
apps/
  desktop/            Tauri 2 + React desktop app (npm)
  web-clipper/        WXT browser extension (pnpm)
crates/
  types/              Shared DTOs and domain models
  vault/              Vault scanning, parsing, filesystem watching
  index/              Search, link resolution, indexing
  diff/               Diff engine + WASM bindings
  ai/                 Shared AI domain types
vendor/               Vendored ACP runtimes
scripts/              Automation utilities
```

## Getting started

### Desktop app

```bash
cd apps/desktop
npm install

# Frontend only (Vite dev server)
npm run renderer:dev

# Full Tauri app with Rust sidecar
npm run dev
```

### Web clipper

```bash
cd apps/web-clipper
pnpm install
pnpm dev
```

### Rust workspace

```bash
# From the repo root
cargo build
cargo test
```

## Development workflow

### 1. Fork and clone

```bash
git clone <your-fork-url>
cd <your-clone-directory>
```

### 2. Create a branch

```bash
git checkout -b my-change
```

### 3. Make your changes

Follow the code style guidelines below, then verify:

```bash
# Desktop
cd apps/desktop
npm run lint          # ESLint
npm run build         # TypeScript check (tsc -b) + Vite build
npm test              # Vitest

# Web clipper
cd apps/web-clipper
pnpm run check        # TypeScript + tests + build (all-in-one)

# Rust
cargo test
```

### 4. Commit and push

```bash
git add <files>
git commit -m "fix(editor): resolve cursor jump on live preview toggle"
git push origin my-change
```

### 5. Open a pull request

Open a PR against `main`. Describe what changed and why. Link related issues if applicable.

## Commit messages

We use a lightweight conventional format:

```text
type(scope): short description
```

**Types**: `fix`, `feat`, `refactor`, `chore`, `docs`, `test`, `perf`

**Scope** is optional but encouraged for targeted changes (e.g., `editor`, `vault`, `clipper`, `ai`).

**Examples**:

```text
fix(editor): resolve cursor jump on live preview toggle
feat(clipper): add selection-only clipping mode
refactor: simplify change rail review projection
chore: clean up pdf tab view zoom handling
```

Keep messages descriptive and action-focused. Write in lowercase unless starting with a proper noun.

## Code style

### TypeScript

- **Strict mode** is enabled (`strict: true`, `noUnusedLocals`, `noUnusedParameters`)
- Use `import type` for type-only imports (`verbatimModuleSyntax` is enforced)
- Prefix unused parameters with `_`
- ESLint with TypeScript strict rules — run `npm run lint` before committing

### React

- Functional components only
- Zustand for state management — stores live in `app/store/`
- Feature code goes in `features/<feature-name>/`
- Shared components go in `components/`

### Rust

- Default `rustfmt` formatting
- Edition 2021
- Use `cargo clippy` for additional lint checks

### General principles

- **Simplicity first** — the simplest solution that works
- **Fix root causes** — don't patch around broken abstractions
- **Bounded refactors** — if a fix requires restructuring, keep it scoped to the affected module
- **No speculative cleanup** — don't refactor code that your change doesn't touch

## Testing

### Frontend (Vitest + Testing Library)

```bash
# Desktop
cd apps/desktop
npm test              # Run once
npm run test:watch    # Watch mode

# Web clipper
cd apps/web-clipper
pnpm test             # Watch mode
pnpm test:run         # Run once
```

- Test files live next to the code they test: `MyComponent.test.tsx`
- Use `describe()`, `it()`, `expect()` from Vitest
- Use Testing Library for component tests (`@testing-library/react`)
- Mock desktop runtime APIs through `@neverwrite/runtime` helpers and `vi.mocked()`

### Rust (cargo)

```bash
cargo test                          # All workspace tests
cargo test -p neverwrite-vault      # Single crate
```

## Architecture notes

### Frontend stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS 4** — utility-first styling with CSS variables for theming
- **CodeMirror 6** — markdown editor with custom extensions (live preview, change tracking)
- **Zustand** — lightweight state management with per-feature stores

### Backend

- **Tauri 2** — Rust desktop shell, system WebView, commands, deep links, and window lifecycle
- **Rust native sidecar** — JSON-lines backend for vault, AI, terminal, preview, and Web Clipper operations
- **Tokio** — async runtime
- **notify** — filesystem watching
- **Node HTTP server** — local desktop API for web clipper communication (`127.0.0.1:32145`)

### Key patterns

- **Feature modules**: each feature in `features/` owns its components, hooks, and store slices
- **ActionLog**: patch-based change tracking with author attribution (user vs AI)
- **Live preview**: CodeMirror ViewPlugin that hides markdown syntax when the cursor is elsewhere
- **Wikilinks**: parsed from markdown, resolved against the vault index for navigation and backlinks

## Environment variables

For development, these optional variables can override default runtime paths:

| Variable | Purpose |
| ---------- | --------- |
| `BIFROSTWRITE_CODEX_ACP_BIN` | Override Codex ACP runtime binary |
| `BIFROSTWRITE_CLAUDE_ACP_BIN` | Override Claude ACP runtime binary |
| `BIFROSTWRITE_KILO_ACP_BIN` | Override Kilo ACP runtime binary |
| `BIFROSTWRITE_WEB_CLIPPER_DEV_ORIGINS` | Allow unpacked extension origins |

## Versioning

We follow [Semantic Versioning](https://semver.org/). Stable releases start at `1.0.0`; prereleases use suffixes such as `-beta.1`.

Versions are kept in sync across:

- `apps/desktop/package.json`
- `apps/desktop/package-lock.json`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/native-backend/Cargo.toml`
- `CHANGELOG.md`

Use `node scripts/sync-tauri-version.mjs X.Y.Z` to update the desktop package,
Tauri shell, and native backend version files together, then add the matching
`CHANGELOG.md` release entry.
Before creating a release tag, run:

```bash
node scripts/sync-tauri-version.mjs --check X.Y.Z
```

## Release automation

Desktop releases are maintainer-driven and run through the Tauri release workflow in GitHub Actions.
The workflow builds architecture-specific Apple Silicon and Intel DMGs, mounts
and verifies the final packages, exercises the packaged native runtimes, and
publishes checksums with the GitHub Release.

Before triggering [`.github/workflows/release-desktop.yml`](.github/workflows/release-desktop.yml):

- Bump the desktop version sources with `node scripts/sync-tauri-version.mjs X.Y.Z`
- Add or update the matching `CHANGELOG.md` entry
- Run `node scripts/sync-tauri-version.mjs --check X.Y.Z`
- Create and push the release tag, for example `v1.0.0`
- Confirm `.github/workflows/release-desktop.yml` succeeds for both macOS architectures
- Install the GitHub Release DMG and verify the application before updating the Homebrew Cask

## Reporting issues

- Search the existing issue tracker before opening a new one
- Include steps to reproduce, expected behavior, and actual behavior
- For crashes, include the OS version and any relevant logs

## License

By contributing, you agree that your contributions will be licensed under the [Apache-2.0 License](LICENSE).
