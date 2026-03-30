# Agent Teams Panel

English | [日本語](README_ja.md)

[![CI](https://github.com/ryryryry0321/agent-team-panel/actions/workflows/ci.yml/badge.svg)](https://github.com/ryryryry0321/agent-team-panel/actions/workflows/ci.yml)
[![Release](https://github.com/ryryryry0321/agent-team-panel/actions/workflows/release.yml/badge.svg)](https://github.com/ryryryry0321/agent-team-panel/actions/workflows/release.yml)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

A desktop IDE for monitoring Claude Code agent teams in real time. Built with Electron, tmux, and xterm.js.

When Claude Code spawns parallel agents, each one runs in its own tmux pane. Agent Teams Panel **automatically detects** these panes and renders every agent's live terminal output in a single window — no manual setup required.

> **Platform support:** macOS only. Linux builds compile but are not tested or guaranteed.

## Features

- **Automatic agent detection** — discovers new agent panes via tmux polling; no configuration needed
- **Real-time terminal streaming** — PTY-based output (not snapshots), powered by node-pty + xterm.js
- **Unified view** — main Claude Code terminal and all agent terminals in one window
- **Drag-and-drop reordering** — rearrange agent panels to your liking
- **Dark / Light theme** — Catppuccin Mocha and Latte color schemes
- **One-line installer** — `curl | bash` to get up and running

## Prerequisites

| Tool | Version | Install (macOS) |
|------|---------|-----------------|
| **tmux** | any | `brew install tmux` |
| **Node.js** | >= 18 | `brew install node` |
| **npm** | (bundled with Node) | — |
| **git** | any | `brew install git` |

> **tmux is required.** The app manages Claude Code sessions through tmux and streams agent output from tmux panes.

## Quick Start

> `.app` distribution is not yet available. Use the install script or local setup below.

### Install script

```bash
curl -fsSL https://raw.githubusercontent.com/ryryryry0321/agent-team-panel/main/install.sh | bash
```

This clones the repo to `~/.agent-team-panel`, installs dependencies, builds, and creates an `agent-team-panel` command in `/usr/local/bin`.

```bash
agent-team-panel                    # launch
agent-team-panel /path/to/project   # launch with workspace
```

### Uninstall

```bash
rm -rf ~/.agent-team-panel && rm -f /usr/local/bin/agent-team-panel
```

## Local Development Setup

```bash
git clone https://github.com/ryryryry0321/agent-team-panel.git
cd agent-team-panel
npm ci                # install dependencies + rebuild native modules
npm run dev           # start with hot-reload (TypeScript watch + asset watch + electronmon)
```

Other useful scripts:

| Script | Description |
|--------|-------------|
| `npm start` | One-shot build and run |
| `npm run build` | Compile TypeScript and copy assets |
| `npm run package` | Build a portable directory package |
| `npm run package:mac` | Build macOS `.dmg` (arm64 + x64) |

## Usage

1. Launch the app (via `agent-team-panel` or `npm start`)
2. Select a workspace directory when prompted (or pass it as an argument)
3. The app creates a tmux session and starts Claude Code inside it
4. When Claude Code spawns agents, their terminals appear automatically in the panel
5. Type in any terminal pane to interact directly

## Architecture

```
┌──────────────────────────────────────┐
│  Electron Window (xterm.js UI)       │
│  Main terminal  +  Agent terminals   │
└──────────────┬───────────────────────┘
               │ IPC
┌──────────────┴───────────────────────┐
│  Main Process                        │
│  - tmux session lifecycle            │
│  - Pane detection (1.5s polling)     │
│  - Agent name extraction             │
│  - PTY stream management (node-pty)  │
└──────────────┬───────────────────────┘
               │ child processes
┌──────────────┴───────────────────────┐
│  tmux                                │
│  ctp-main-<hash>  → Claude Code CLI  │
│  ctp-side-<id>    → agent panes      │
└──────────────────────────────────────┘
```

## Status

This project is in early development. There may be undiscovered bugs, and breaking changes are likely as the codebase is actively being revised and refactored.

## License

[GPL-3.0-or-later](LICENSE)
