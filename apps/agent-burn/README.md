# Agent Burn

Desktop apps for macOS and Windows, plus a local CLI for coding-agent usage, limits, and subscription value.

Original project site: [agent-burn.melvynx.dev](https://agent-burn.melvynx.dev). Windows port: [Anth-off/agent-burn-windows](https://github.com/Anth-off/agent-burn-windows).

`summary` is the all-up local spend view. `harness <claude|codex>` is the weekly subscription-limit view. The npm package also installs `burn` as a short alias.

## Install

**Mac app:** [Download](https://agent-burn.melvynx.dev/download), unzip, move to Applications. macOS 14+, Apple Silicon and Intel. The app bundles the CLI.

**Windows app:** Windows 10/11 x64 desktop port with a bundled CLI, dashboard, tray icon, and local history. Build the NSIS installer from source using the [Windows setup guide](https://github.com/Anth-off/agent-burn-windows/tree/main/apps/windows). Successful **Windows app** workflow runs attach installer artifacts; no Windows release is linked here yet.

**CLI:**

```bash
npx agent-burn@latest summary --value
pnpm dlx agent-burn@latest harness claude --value
bunx agent-burn@latest harness codex --value
```

## Commands

```bash
agent-burn
agent-burn summary
agent-burn summary today
agent-burn summary week --value
agent-burn harness claude --value
agent-burn harness codex --value
agent-burn summary --json
```

macOS app: menu-bar quota for Codex, Claude, and Cursor, plus a dashboard across detected harnesses. Build locally with `just macos::run`. Details: [apps/macos](https://github.com/Melvynx/agent-burn/tree/main/apps/macos).

Windows app: French dashboard for spend, tokens, models, and available provider quotas. Build locally with `just windows::build` after installing its prerequisites. Closing the window keeps collection running in the tray by default; quitting stops it. Automatic updates are not implemented. Details: [apps/windows](https://github.com/Anth-off/agent-burn-windows/tree/main/apps/windows).

## Subscription Value

`--value` compares local API-equivalent usage with known or supplied monthly plan prices.

```bash
agent-burn summary --value
agent-burn summary --value --claude-plan max-20x --codex-plan pro
agent-burn harness claude --value --claude-plan 200
agent-burn harness codex --value --codex-plan plus
```

Plan overrides:

- Claude: `pro`, `max-5x`, `max-20x`, or a monthly price
- Codex: `plus`, `pro`, or a monthly price
- Cursor: `pro`, `pro+`, `ultra`, or a monthly price

## Shared Options

```bash
--since <YYYYMMDD>       Start date
--until <YYYYMMDD>       End date
--json                   JSON output
--jq <filter>            Apply a jq filter to JSON output
--mode <auto|calculate|display>
--breakdown              Include model breakdowns
--offline                Use embedded pricing and skip live requests
--no-cost                Hide cost fields
--timezone <tz>          Date grouping timezone
--compact                Force compact table layout
--config <path>          Load a config file
```

## Data Sources

Reads local logs. Nothing is uploaded.

| Source      | Default location                                            |
| ----------- | ----------------------------------------------------------- |
| Claude Code | `~/.claude`, `~/.config/claude/projects`                    |
| Codex       | `${CODEX_HOME:-~/.codex}`                                   |
| Cursor      | Cursor `state.vscdb` plus the signed-in dashboard usage API |

## Acknowledgments

Agent Burn started from [ccusage](https://github.com/ccusage/ccusage) by [ryoppippi](https://github.com/ryoppippi). The original local log readers, cost aggregation, and CLI report patterns are the prior work this project builds on.

## License

MIT. Copyright (c) 2025 ryoppippi and 2026 Melvynx.
