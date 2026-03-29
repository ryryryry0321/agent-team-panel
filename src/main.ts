import { app, BrowserWindow, ipcMain } from "electron";
import * as pty from "node-pty";
import path from "path";

import {
  CLAUDE_LAUNCH_COMMAND,
  createInitialClaudeSession,
} from "./main/constants";
import { IPC } from "./main/ipc-channels";
import {
  extractAgentName,
  getActiveSecondarySessions,
  getNextMainPaneId,
  parseTmuxPanes,
  parseTmuxSessionMeta,
  sortRawPanes,
} from "./main/panes";
import { runTmux, shellEscape, tokenizeTmuxInput } from "./main/tmux";
import type { ClaudePane, ClaudeSession, RawTmuxPane } from "./main/types";

let mainWindow: BrowserWindow | null = null;
let tmuxRefreshTimer: NodeJS.Timeout | null = null;
let mainTerminalPty: pty.IPty | null = null;
let aggressiveResizeSet = false;

const claudePanes = new Map<string, ClaudePane>();
const claudeSession: ClaudeSession = createInitialClaudeSession();
const brokenOutPanes = new Set<string>();

type AgentPtyEntry = { pty: pty.IPty; windowId: string; dataBuf: string; linkedSessionName: string };
const agentPtys = new Map<string, AgentPtyEntry>();
const DATA_BUF_MAX = 8192;
const SIDE_SESSION_PREFIX = "ctp-side-";

// todo: メンテナンス性をあげるためのリファクタ

function sidePtySessionName(paneId: string): string {
  return `${SIDE_SESSION_PREFIX}${paneId.replace("%", "")}`;
}

function emitToRenderer(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

function sendLog(message: string): void {
  const formatted = `[main] ${message}`;
  console.log(formatted);
  emitToRenderer(IPC.APP_LOG, formatted);
}

function updateClaudeSession(patch: Partial<ClaudeSession>): void {
  Object.assign(claudeSession, patch);
  emitToRenderer(IPC.SESSION_UPDATED, { ...claudeSession });
}

function removeClaudePane(paneId: string): void {
  if (!claudePanes.delete(paneId)) return;
  detachAgentPty(paneId);
  emitToRenderer(IPC.PANE_REMOVED, { paneId });
}

function clearClaudePanes(): void {
  for (const paneId of [...claudePanes.keys()]) removeClaudePane(paneId);
}

function destroyMainTerminalPty(): void {
  if (!mainTerminalPty) return;
  mainTerminalPty.kill();
  mainTerminalPty = null;
}

async function attachAgentPty(paneId: string, windowId: string): Promise<void> {
  if (agentPtys.has(paneId)) return;

  const linkedName = sidePtySessionName(paneId);

  await runTmux(["kill-session", "-t", linkedName]);

  const createResult = await runTmux([
    "new-session", "-d", "-s", linkedName, "-t", claudeSession.sessionName,
  ]);
  if (createResult.code !== 0) {
    sendLog(`failed to create linked session ${linkedName}: ${createResult.stderr.trim()}`);
    return;
  }

  await runTmux(["select-window", "-t", `${linkedName}:${windowId}`]);

  const p = pty.spawn("tmux", ["attach-session", "-t", linkedName], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: claudeSession.workspacePath,
    env: { ...process.env, TERM: "xterm-256color" },
  });

  const entry: AgentPtyEntry = { pty: p, windowId, dataBuf: "", linkedSessionName: linkedName };
  agentPtys.set(paneId, entry);

  p.onData((data) => {
    emitToRenderer(IPC.SIDE_PANE_DATA, { paneId, data });
    entry.dataBuf = (entry.dataBuf + data).slice(-DATA_BUF_MAX);
  });

  p.onExit(() => {
    sendLog(`agent pty for ${paneId} exited`);
    agentPtys.delete(paneId);
    void runTmux(["kill-session", "-t", linkedName]);
  });

  sendLog(`attached agent pty for ${paneId} (window ${windowId}, session ${linkedName})`);
}

function detachAgentPty(paneId: string): void {
  const entry = agentPtys.get(paneId);
  if (!entry) return;
  entry.pty.kill();
  agentPtys.delete(paneId);
  void runTmux(["kill-session", "-t", entry.linkedSessionName]);
}

function detachAllAgentPtys(): void {
  for (const paneId of [...agentPtys.keys()]) detachAgentPty(paneId);
}

async function ensureClaudeSession(): Promise<void> {
  updateClaudeSession({ status: "starting" });

  const hasSession = await runTmux(["has-session", "-t", claudeSession.sessionName]);
  if (hasSession.code === 0) {
    sendLog(`reusing session ${claudeSession.sessionName}`);
    updateClaudeSession({ status: "running" });
    return;
  }

  sendLog(`creating session ${claudeSession.sessionName}`);
  const result = await runTmux([
    "new-session", "-d", "-s", claudeSession.sessionName,
    "-c", claudeSession.workspacePath,
    `zsh -lc ${shellEscape(CLAUDE_LAUNCH_COMMAND)}`,
  ]);

  if (result.code !== 0) {
    updateClaudeSession({ status: "stopped" });
    throw new Error(result.stderr.trim() || "Claude Code の起動に失敗しました");
  }
  updateClaudeSession({ status: "running" });
}

function attachMainTerminalStream(): void {
  destroyMainTerminalPty();

  sendLog(`attaching pty to session ${claudeSession.sessionName}`);
  mainTerminalPty = pty.spawn("tmux", ["attach-session", "-t", claudeSession.sessionName], {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd: claudeSession.workspacePath,
    env: { ...process.env, TERM: "xterm-256color" },
  });

  mainTerminalPty.onData((data) => emitToRenderer(IPC.MAIN_DATA, data));
  mainTerminalPty.onExit(() => {
    sendLog("main terminal pty exited");
    mainTerminalPty = null;
  });
}

async function ensureAggressiveResize(): Promise<void> {
  if (aggressiveResizeSet) return;
  const result = await runTmux(["set-option", "-g", "aggressive-resize", "on"]);
  if (result.code === 0) {
    aggressiveResizeSet = true;
    sendLog("set aggressive-resize on");
  }
}

async function breakOutAgentPanes(mainPaneId: string | null, mainSessionPanes: RawTmuxPane[]): Promise<void> {
  if (!mainPaneId) return;
  const mainPane = mainSessionPanes.find((p) => p.paneId === mainPaneId);
  if (!mainPane) return;

  let didBreak = false;
  for (const pane of mainSessionPanes) {
    if (pane.paneId === mainPaneId || brokenOutPanes.has(pane.paneId)) continue;
    if (pane.windowId !== mainPane.windowId) {
      brokenOutPanes.add(pane.paneId);
      continue;
    }
    const result = await runTmux(["break-pane", "-d", "-s", pane.paneId]);
    if (result.code === 0) {
      sendLog(`broke out pane ${pane.paneId} to its own window`);
      brokenOutPanes.add(pane.paneId);
      didBreak = true;
    }
  }

  if (didBreak) {
    await ensureAggressiveResize();
  }
}

function syncPane(rawPane: RawTmuxPane, mainPaneId: string | null): void {
  const prevPane = claudePanes.get(rawPane.paneId);
  const ptyEntry = agentPtys.get(rawPane.paneId);

  let agentName = prevPane?.agentName ?? null;
  if (!agentName && ptyEntry) {
    agentName = extractAgentName(ptyEntry.dataBuf);
  }

  const nextPane: ClaudePane = {
    ...rawPane,
    content: "",
    isMain: rawPane.sessionName === claudeSession.sessionName && rawPane.paneId === mainPaneId,
    agentName,
    updatedAt: Date.now(),
    detectedAt: prevPane?.detectedAt ?? rawPane.detectedAt,
  };
  claudePanes.set(rawPane.paneId, nextPane);

  if (
    !prevPane ||
    prevPane.paneTitle !== nextPane.paneTitle ||
    prevPane.currentCommand !== nextPane.currentCommand ||
    prevPane.isMain !== nextPane.isMain ||
    prevPane.agentName !== nextPane.agentName
  ) {
    emitToRenderer(IPC.PANE_UPDATED, nextPane);
  }
}

function pruneInactivePanes(activePaneIds: Set<string>): void {
  for (const paneId of [...claudePanes.keys()]) {
    if (activePaneIds.has(paneId)) continue;
    removeClaudePane(paneId);
  }
}

async function refreshTmuxState(): Promise<void> {
  const [paneResult, metaResult] = await Promise.all([
    runTmux([
      "list-panes", "-a", "-F",
      "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_title}\t#{pane_current_command}",
    ]),
    runTmux(["list-sessions", "-F", "#{session_name}\t#{session_activity}"]),
  ]);

  if (paneResult.code !== 0) {
    if (paneResult.stderr.trim() && !paneResult.stderr.includes("can't find session")) {
      sendLog(`tmux refresh failed: ${paneResult.stderr.trim()}`);
    }
    updateClaudeSession({ status: "stopped", mainPaneId: null });
    clearClaudePanes();
    return;
  }

  const sessionMeta = metaResult.code === 0 ? parseTmuxSessionMeta(metaResult.stdout) : [];
  let allRawPanes = sortRawPanes(
    parseTmuxPanes(paneResult.stdout).filter((p) => !p.sessionName.startsWith(SIDE_SESSION_PREFIX)),
  );
  let mainSessionPanes = allRawPanes.filter(({ sessionName }) => sessionName === claudeSession.sessionName);
  const nextMainPaneId = getNextMainPaneId(claudeSession.mainPaneId, mainSessionPanes);

  await breakOutAgentPanes(nextMainPaneId, mainSessionPanes);

  const refreshAfterBreak = await runTmux([
    "list-panes", "-a", "-F",
    "#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_index}\t#{pane_title}\t#{pane_current_command}",
  ]);
  if (refreshAfterBreak.code === 0) {
    allRawPanes = sortRawPanes(
      parseTmuxPanes(refreshAfterBreak.stdout).filter((p) => !p.sessionName.startsWith(SIDE_SESSION_PREFIX)),
    );
    mainSessionPanes = allRawPanes.filter(({ sessionName }) => sessionName === claudeSession.sessionName);
  }

  const activeSecondarySessions = getActiveSecondarySessions(
    claudeSession.sessionName, allRawPanes, sessionMeta,
  );
  const sidePanes = sortRawPanes(
    allRawPanes.filter(({ sessionName }) => activeSecondarySessions.has(sessionName)),
  );
  const visiblePanes = [...mainSessionPanes, ...sidePanes];

  if (claudeSession.status !== "running" || claudeSession.mainPaneId !== nextMainPaneId) {
    updateClaudeSession({ status: "running", mainPaneId: nextMainPaneId });
    if (nextMainPaneId) {
      const mainPaneRaw = mainSessionPanes.find((p) => p.paneId === nextMainPaneId);
      if (mainPaneRaw) {
        await runTmux(["select-window", "-t", `${claudeSession.sessionName}:${mainPaneRaw.windowId}`]);
        await runTmux(["select-pane", "-t", nextMainPaneId]);
      }
    }
  }

  const activePaneIds = new Set(visiblePanes.map(({ paneId }) => paneId));

  for (const rawPane of visiblePanes) {
    syncPane(rawPane, nextMainPaneId);
  }
  pruneInactivePanes(activePaneIds);

  for (const rawPane of mainSessionPanes) {
    if (rawPane.paneId === nextMainPaneId) continue;
    if (agentPtys.has(rawPane.paneId)) continue;
    if (!brokenOutPanes.has(rawPane.paneId)) continue;
    await attachAgentPty(rawPane.paneId, rawPane.windowId);
  }

  for (const paneId of [...agentPtys.keys()]) {
    if (!activePaneIds.has(paneId)) detachAgentPty(paneId);
  }
}

async function stopClaudeSession(): Promise<void> {
  sendLog("stopping claude session");
  if (tmuxRefreshTimer) {
    clearInterval(tmuxRefreshTimer);
    tmuxRefreshTimer = null;
  }
  detachAllAgentPtys();
  destroyMainTerminalPty();
  brokenOutPanes.clear();
  aggressiveResizeSet = false;

  await runTmux(["kill-session", "-t", claudeSession.sessionName]);
  clearClaudePanes();
  updateClaudeSession({ status: "stopped", mainPaneId: null });
  sendLog("claude session stopped");
}

async function restartClaudeSession(): Promise<void> {
  await stopClaudeSession();
  try {
    await ensureClaudeSession();
    attachMainTerminalStream();
  } catch (err) {
    sendLog(err instanceof Error ? err.message : "Claude Code の再起動に失敗しました");
    return;
  }
  await refreshTmuxState();
  tmuxRefreshTimer = setInterval(() => { void refreshTmuxState(); }, 1500);
  sendLog("claude session restarted");
}

async function sendPaneInput(paneId: string, data: string): Promise<void> {
  const entry = agentPtys.get(paneId);
  if (entry) {
    entry.pty.write(data);
    return;
  }
  if (!claudePanes.has(paneId)) return;
  for (const token of tokenizeTmuxInput(data)) {
    if ("literal" in token) {
      await runTmux(["send-keys", "-t", paneId, "-l", token.literal]);
      continue;
    }
    await runTmux(["send-keys", "-t", paneId, token.key]);
  }
  void refreshTmuxState();
}

ipcMain.handle(IPC.GET_SESSION, async () => ({ ...claudeSession }));
ipcMain.handle(IPC.LIST_PANES, async () => [...claudePanes.values()]);
ipcMain.handle(IPC.STOP_SESSION, async () => { await stopClaudeSession(); });
ipcMain.handle(IPC.RESTART_SESSION, async () => { await restartClaudeSession(); });
ipcMain.on(IPC.SEND_PANE_INPUT, (_event, payload: { paneId: string; data: string }) => {
  void sendPaneInput(payload.paneId, payload.data);
});
ipcMain.on(IPC.MAIN_INPUT, (_event, data: string) => {
  mainTerminalPty?.write(data);
});
ipcMain.on(IPC.MAIN_RESIZE, (_event, payload: { cols: number; rows: number }) => {
  if (mainTerminalPty && payload.cols > 0 && payload.rows > 0) {
    mainTerminalPty.resize(payload.cols, payload.rows);
  }
});
ipcMain.on(IPC.PANE_RESIZE, (_event, payload: { paneId: string; cols: number; rows: number }) => {
  if (payload.cols <= 0 || payload.rows <= 0) return;
  const entry = agentPtys.get(payload.paneId);
  if (entry) {
    entry.pty.resize(payload.cols, payload.rows);
    return;
  }
});

app.whenReady().then(async () => {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  void mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.webContents.on("did-finish-load", () => {
    sendLog("renderer loaded");
    emitToRenderer(IPC.SESSION_UPDATED, { ...claudeSession });
  });
  mainWindow.on("closed", () => { mainWindow = null; });

  try {
    await ensureClaudeSession();
    attachMainTerminalStream();
  } catch (err) {
    sendLog(err instanceof Error ? err.message : "Claude Code の起動に失敗しました");
  }

  await refreshTmuxState();
  tmuxRefreshTimer = setInterval(() => { void refreshTmuxState(); }, 1500);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = null;
  });
});

app.on("before-quit", (e) => {
  if (claudeSession.status === "stopped") return;
  e.preventDefault();
  void stopClaudeSession().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
