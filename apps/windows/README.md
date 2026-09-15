# Agent Burn for Windows

Windows desktop port of [Agent Burn](https://github.com/Melvynx/agent-burn), built with Tauri 2, React, and the existing Rust CLI. This version targets Windows 10 and 11 on x64 and uses a French interface.

[Windows source and issues](https://github.com/Anth-off/agent-burn-windows)

## Features

- A dashboard for local API-equivalent spend, tokens, daily activity, and model breakdowns.
- Codex, Claude, and Cursor views using the bundled CLI's available usage and quota data.
- A notification-area icon, optional launch at login, and configurable collection every 1–60 minutes.
- System, light, and dark themes, with a choice of provider for the tray quota.
- Saved reports and local history with backup recovery when a source is temporarily unavailable.
- Custom source folders and an offline mode that uses embedded pricing and skips live requests.

Closing the window keeps collection running in the notification area by default. Reopen it from the tray icon. Choose **Quitter** to stop the application and collection; there is no separate Windows background service. **Réglages** lets you disable close-to-tray or enable launch at login.

Saved reports appear while fresh data is collected in the background, keeping their original timestamp visible. Previously visited views also remain available when switching tabs. The first report for a new source or period still needs to read the logs and contact any enabled providers, which can take several seconds.

Live quotas depend on the providers and locally available account data. Unavailable readings and refresh failures are shown explicitly. Offline mode cannot fetch fresh provider quotas. Windows does not yet have every macOS feature or an automatic updater.

## Build an installer

Install these development prerequisites:

- Windows 10 or 11 x64.
- Node.js 22.21.1 and pnpm 11.1.1.
- Rust 1.96.0 through rustup, using the MSVC toolchain selected by `rust-toolchain.toml`.
- Visual Studio 2022 Build Tools with **Desktop development with C++**, the MSVC x64 toolset, and a Windows SDK.
- Microsoft Edge WebView2 Runtime.

See the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) for the compiler and WebView2 setup. Use a Windows terminal with the compiler toolchain available. The repository's Nix environment remains the standard environment for other repository-wide tasks; the commands below provide the native Windows build path.

From the repository root:

```powershell
pnpm install --filter @agent-burn/windows... --frozen-lockfile
pnpm --dir apps/windows desktop:build
```

If `just` is installed, the equivalent commands are `just windows::install` and `just windows::build`.

The build first compiles the Rust CLI, stages its target-specific executable for Tauri, builds the dashboard, and creates the NSIS `.exe` installer in:

```text
apps/windows/src-tauri/target/release/bundle/nsis/
```

The installed application bundles the CLI; end users do not need Node.js, pnpm, Rust, or a separate `agent-burn` installation. WebView2 is required to display the dashboard. The current installer is unsigned, and Windows may show an unrecognized-publisher prompt. There is no published Windows release linked here yet.

The **Windows app** GitHub Actions workflow tests the CLI and desktop app, builds the installer, and attaches an `agent-burn-windows-x64` artifact with SHA-256 checksums to successful runs. It does not create tags or publish releases. To check a downloaded installer in PowerShell, compare this result with its accompanying `.exe.sha256` file:

```powershell
Get-FileHash -LiteralPath .\Agent-Burn-setup.exe -Algorithm SHA256
```

Replace the example filename with the downloaded installer's name.

## Data and settings

The app reads the same local sources as the CLI. Leave source folder fields blank to use normal detection, including `CODEX_HOME` when set. Configure absolute paths in **Réglages** when your logs live elsewhere:

- **Codex:** one or more Codex home folders, separated by commas.
- **Claude:** one or more Claude configuration folders, separated by commas.
- **Cursor:** one Cursor data folder.

Claude quota authentication follows the configured Claude folders. When an override is set, the CLI does not fall back to credentials from the default profile.

For WSL, you can supply a Windows-accessible path such as `\\wsl.localhost\Ubuntu\home\example\.codex` if the distribution and files are accessible to the app. WSL distributions are not detected automatically; Windows account integration and provider requests may still differ from running the CLI inside WSL.

Settings, report caches, and collected history stay in the application's local data folder. Backups allow recovery from a damaged cache. Cached results show their timestamp and any refresh error. Quit the app before copying its data folder for backup. Cached and historical aggregates do not recreate deleted source logs or missing provider measurements.

Usage totals are API-equivalent estimates, rather than invoices. The app does not upload your logs; online mode allows the CLI's existing pricing and provider-usage requests.

## Validate changes

From the repository root:

```powershell
pnpm --dir apps/windows test
pnpm --dir apps/windows typecheck
pnpm --dir apps/windows lint
pnpm --dir apps/windows format:check
pnpm --dir apps/windows build
pnpm --dir apps/windows native:prepare
cargo test --manifest-path rust/Cargo.toml --workspace --locked
cargo test --manifest-path apps/windows/src-tauri/Cargo.toml --locked
cargo fmt --manifest-path apps/windows/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path apps/windows/src-tauri/Cargo.toml --locked --all-targets -- -D warnings
```

`native:prepare` must run before desktop Rust checks because Tauri embeds the staged CLI in the app. The `windows` just module also exposes the individual build, test, lint, and formatting tasks.

## License and credits

MIT; the original copyright notices are preserved in [LICENSE](../agent-burn/LICENSE). Agent Burn builds on the work of [Melvynx](https://github.com/Melvynx/agent-burn) and [ryoppippi](https://github.com/ryoppippi), including the original ccusage local log readers, cost aggregation, and reporting patterns. The Windows port is maintained in [Anth-off/agent-burn-windows](https://github.com/Anth-off/agent-burn-windows).
