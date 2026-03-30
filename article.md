# ClaudeCodeのAgentTeamをGUI風に確認するアプリを作った上でのハマりポイント共有
この記事はClaudeCodeで骨組みを書き、少々の手直しを加えてます。
## TL;DR

Electronアプリでtmuxの各pane内容をリアルタイム表示したい場合、`capture-pane`ではなく`pty.spawn("tmux", ["attach-session", ...])` でlinked sessionにattachし、xterm.jsにストリームで流すのが正解。ただしnode-ptyのネイティブバイナリ(`spawn-helper`)がElectronのasarアーカイブに閉じ込められる問題があり、electron-builderの`asarUnpack`で回避する必要がある。

## 背景 — 何を作ったか

Claude Codeのマルチエージェントセッションをビジュアル管理するElectronデスクトップアプリを作った。AgentTeamsを起動することで自動的にAgentのpaneがそれぞれ検出され、出力をGUI上にリアルタイムで表示する。詳しくはREADMEを参照。

https://github.com/ryryryry0321/agent-team-panel

```
┌─────────────────────────┬──────────────┬──────────────┐
│   Main Claude Code      │  Agent A     │  Agent B     │
│   (xterm.js)            │  (xterm.js)  │  (xterm.js)  │
│                         │              │              │
│   リアルタイム描画       │  リアルタイム │  リアルタイム │
└─────────────────────────┴──────────────┴──────────────┘
         ↑                       ↑              ↑
    tmux session            tmux pane       tmux pane
```

## ハマりポイント: capture-pane vs PTYストリーム

> **これが最大の設計判断だった。** tmux paneの中身をElectron上に表示する方法は2つあるが、片方は完全に行き止まりだった。

### capture-pane: 最初に試して失敗した方法

```typescript
// ポーリングでpane内容を取得（これはダメだった）
const result = await runTmux([
  "capture-pane", "-t", paneId, "-p", "-e"
]);
// → resultをrendererに送ってxterm.jsに描画
```

直感的にはこれで良さそうに見える。tmuxが公式に提供しているpane内容の取得APIだし、実際に中身は取れる。**しかし、リアルタイム表示には根本的に向いていない。**

#### なぜダメだったか

1. **スナップショットでしかない** — capture-paneはその瞬間の画面の静止画。ポーリング間隔の間の出力はすべて欠落する。AIエージェントが高速にログを流すとカクカクする
2. **ANSIエスケープが壊れる** — `-e`オプションでエスケープを保持できるが、途中で切れたシーケンスやカーソル移動の状態が壊れる。色がおかしくなる、レイアウトが崩れる
3. **xterm.jsとの相性が最悪** — xterm.jsはストリーム入力を前提に設計されている。スナップショットを毎回丸ごと`write()`すると、スクロールバック、選択状態、カーソル位置がすべてリセットされる。ユーザーがスクロールして読んでいる最中に画面が飛ぶ

**一言で言うと、capture-paneは「今の画面を写真に撮る」、やりたいのは「画面を動画で中継する」だった。**

### PTYストリーム: 正解の方法

解決策は、tmuxの「linked session」にnode-pty経由でattachし、出力をストリームとしてxterm.jsに流す方法。

```typescript
// 1. 元のセッションにリンクしたセッションを作る
await runTmux([
  "new-session", "-d", "-s", linkedName, "-t", mainSessionName,
]);

// 2. 対象のwindowを選択
await runTmux([
  "select-window", "-t", `${linkedName}:${windowId}`,
]);

// 3. node-ptyでattachしてストリームを取得
const p = pty.spawn("tmux", ["attach-session", "-t", linkedName], {
  name: "xterm-256color",
  cols: 80,
  rows: 24,
  env: { ...process.env, TERM: "xterm-256color" },
});

// 4. データをそのままxterm.jsに流す
p.onData((data) => {
  // IPC経由でrendererのxterm.jsインスタンスにwrite
  emitToRenderer("side-pane-data", { paneId, data });
});
```

#### なぜこれが正解か

| | capture-pane | PTYストリーム |
|---|---|---|
| 例えるなら | 写真を定期的に撮る | ライブ中継 |
| データ | スナップショット（静止画） | リアルタイムストリーム（動画） |
| ANSIエスケープ | 途中で切れる | 完全に保持 |
| xterm.jsとの相性 | 毎回全画面書き換え | 差分writeで自然に描画 |
| カーソル/スクロール | リセットされる | 保持される |
| CPU負荷 | ポーリング頻度に比例 | イベント駆動、必要な時だけ |

### linked sessionを使う理由

ここにもハマりポイントがある。直接 `attach-session -t mainSession` すると、**メインのターミナルサイズがattach側に引きずられる。** GUIのpaneが小さいと、メインのClaude Codeの表示まで縮んでしまう。

`new-session -t mainSession` でlinked sessionを作ることで、独立したウィンドウサイズを維持できる。tmuxの `aggressive-resize on` と組み合わせると、各ビューが完全に独立してリサイズできる。

```typescript
// これも忘れると各paneのサイズが連動してしまう
await runTmux(["set-option", "-g", "aggressive-resize", "on"]);
```

## もう一つの罠: electron-builderでないと.appが壊れる

ここまでの実装でdev環境では完璧に動いた。しかし `.app` にパッケージングした途端、ターミナルビューが真っ白になった。

```
[main] posix_spawnp failed.
```

### 原因

node-ptyはPTYを作る際に `spawn-helper` という**拡張子なしのネイティブバイナリ**を内部でforkする。Electronのasarアーカイブ（アプリのソースを1ファイルにまとめる仕組み）がこのバイナリを中に閉じ込めてしまい、OSから実行できなくなっていた。

```
node_modules/node-pty/prebuilds/darwin-arm64/
├── pty.node          ← .nodeファイル → unpackされる ✅
└── spawn-helper      ← 拡張子なし    → asar内に閉じ込め ❌
```

### electron-packager vs electron-builder

- **electron-packager**: `asar.unpackDir` を指定しても、`.node` ファイルしかunpackしない。拡張子なしバイナリは通常ファイルと判断してasar内に圧縮する
- **electron-builder**: `asarUnpack: "**/node-pty/**"` でディレクトリごとすべてunpackする。拡張子を問わない

```yaml
# electron-builder.yml
asarUnpack:
  - "**/node-pty/**"
```

これだけで解決する。

### 紛らわしかった点

paneの検出（`tmux list-panes`）は `child_process.spawn` で動いており、node-ptyを使わない。だからpaneは認識できるのにビューだけ映らないという中途半端な状態になり、原因特定に時間がかかった。

## まとめ

1. **tmux paneのリアルタイム描画には `capture-pane` ではなくPTYストリームを使う** — linked sessionにattachしてxterm.jsに流す
2. **node-ptyを使うなら `spawn-helper` のasar問題に注意** — electron-builderの `asarUnpack` で解決
3. **pane検出とビュー描画は別のAPI** — `child_process.spawn`（検出）は動くのに `pty.spawn`（描画）だけ壊れるケースがある

Electron + tmux + node-ptyの組み合わせはニッチだが、AIエージェントの可視化ツールを作る際には避けて通れない構成。この記事がその助けになれば幸いです。

---

**リポジトリ:** https://github.com/ryryryry0321/agent-team-panel
