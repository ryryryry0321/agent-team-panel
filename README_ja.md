# Agent Teams Panel

[![CI](https://github.com/ryryryry0321/agent-team-panel/actions/workflows/ci.yml/badge.svg)](https://github.com/ryryryry0321/agent-team-panel/actions/workflows/ci.yml)
[![Release](https://github.com/ryryryry0321/agent-team-panel/actions/workflows/release.yml/badge.svg)](https://github.com/ryryryry0321/agent-team-panel/actions/workflows/release.yml)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

[English](README.md) | 日本語

Claude Code のエージェントチームをリアルタイムで監視するデスクトップアプリ。Electron + tmux + xterm.js で構築。

Claude Code が並列エージェントを起動すると、各エージェントは tmux ペインで動作します。Agent Teams Panel はこれらのペインを**自動検出**し、すべてのエージェントのターミナル出力を1つのウィンドウにリアルタイム表示します。手動設定は不要です。

> **対応 OS:** macOS のみ動作保証。Linux はビルドは通りますが、テスト・動作保証の対象外です。

## 特徴

- **エージェント自動検出** — tmux ポーリングで新しいエージェントペインを自動発見。設定不要
- **リアルタイムターミナルストリーミング** — スナップショットではなく PTY ベースの出力（node-pty + xterm.js）
- **統合ビュー** — メインの Claude Code ターミナルと全エージェントターミナルを1画面に集約
- **ドラッグ＆ドロップ並べ替え** — エージェントパネルを自由に配置
- **ダーク / ライトテーマ** — Catppuccin Mocha・Latte カラースキーム
- **ワンラインインストーラー** — `curl | bash` ですぐに使える

## 前提条件

| ツール | バージョン | インストール (macOS) |
|--------|-----------|---------------------|
| **tmux** | 任意 | `brew install tmux` |
| **Node.js** | >= 18 | `brew install node` |
| **npm** | (Node に同梱) | — |
| **git** | 任意 | `brew install git` |

> **tmux は必須です。** アプリは Claude Code セッションを tmux で管理し、エージェント出力を tmux ペインからストリーミングします。

## クイックスタート

> `.app` での配布はまだ準備が整っていません。下記のインストールスクリプトまたはローカルセットアップを使用してください。

### インストールスクリプト

```bash
curl -fsSL https://raw.githubusercontent.com/ryryryry0321/agent-team-panel/main/install.sh | bash
```

リポジトリを `~/.agent-team-panel` にクローンし、依存関係のインストール・ビルドを行い、`/usr/local/bin` に `agent-team-panel` コマンドを作成します。

```bash
agent-team-panel                    # 起動
agent-team-panel /path/to/project   # ワークスペースを指定して起動
```

### アンインストール

```bash
rm -rf ~/.agent-team-panel && rm -f /usr/local/bin/agent-team-panel
```

## ローカル開発セットアップ

```bash
git clone https://github.com/ryryryry0321/agent-team-panel.git
cd agent-team-panel
npm ci                # 依存関係インストール + ネイティブモジュールリビルド
npm run dev           # ホットリロード付きで起動（TypeScript watch + asset watch + electronmon）
```

その他のスクリプト:

| スクリプト | 説明 |
|-----------|------|
| `npm start` | ビルド後に1回実行 |
| `npm run build` | TypeScript コンパイル + アセットコピー |
| `npm run package` | ポータブルディレクトリパッケージを作成 |
| `npm run package:mac` | macOS `.dmg` をビルド (arm64 + x64) |

## 使い方

1. アプリを起動（`agent-team-panel` または `npm start`）
2. プロンプトが表示されたらワークスペースディレクトリを選択（引数で指定も可）
3. アプリが tmux セッションを作成し、その中で Claude Code を起動
4. Claude Code がエージェントを生成すると、ターミナルが自動的にパネルに表示される
5. 各ターミナルペインに直接入力して操作可能

## アーキテクチャ

```
┌──────────────────────────────────────┐
│  Electron ウィンドウ (xterm.js UI)    │
│  メインターミナル + エージェントターミナル │
└──────────────┬───────────────────────┘
               │ IPC
┌──────────────┴───────────────────────┐
│  メインプロセス                        │
│  - tmux セッションライフサイクル管理      │
│  - ペイン検出 (1.5秒ポーリング)         │
│  - エージェント名抽出                   │
│  - PTY ストリーム管理 (node-pty)       │
└──────────────┬───────────────────────┘
               │ 子プロセス
┌──────────────┴───────────────────────┐
│  tmux                                │
│  ctp-main-<hash>  → Claude Code CLI  │
│  ctp-side-<id>    → エージェントペイン   │
└──────────────────────────────────────┘
```

## ステータス

本プロジェクトは初期開発段階です。まだ潜在的なバグが隠れている可能性があり、コードベースの修正・リファクタリングに伴い破壊的な変更が入る可能性があります。

## ライセンス

[GPL-3.0-or-later](LICENSE)
