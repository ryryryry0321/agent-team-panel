/* eslint-disable @typescript-eslint/no-explicit-any */
declare const Terminal: any;
declare const FitAddon: { FitAddon: new () => { fit(): void } };

interface ClaudeSession {
  sessionName: string;
  status: "starting" | "running" | "stopped";
  mainPaneId: string | null;
}

interface ClaudePane {
  paneId: string;
  sessionName: string;
  windowIndex: string;
  windowName: string;
  paneIndex: string;
  paneTitle: string;
  currentCommand: string;
  isMain: boolean;
  agentName: string | null;
}

interface SideView {
  el: HTMLElement;
  titleEl: HTMLElement;
  metaEl: HTMLElement;
  term: any;
  fit: { fit(): void };
  paneId: string;
  lastCols: number;
  lastRows: number;
}

const api = (window as any).electronAPI;
const THEMES = {
  dark: { background: "#11111b", foreground: "#cdd6f4", cursor: "#89b4fa", selectionBackground: "#45475a" },
  light: { background: "#ffffff", foreground: "#4c4f69", cursor: "#1e66f5", selectionBackground: "#ccd0da" },
};
const theme = () => THEMES[document.documentElement.dataset.theme === "light" ? "light" : "dark"];
const termOpts = (size: number) => ({
  cursorBlink: true, disableStdin: false,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace', fontSize: size, theme: theme(),
});
const label = (p: ClaudePane) =>
  p.agentName ? `@${p.agentName}` : p.paneTitle || `${p.windowName || "window"}:${p.paneIndex}`;
const meta = (p: ClaudePane) => {
  const task = p.paneTitle ? ` / ${p.paneTitle}` : "";
  return `${p.sessionName} / pane ${p.paneIndex}${task}`;
};
const comparePanes = (a: ClaudePane, b: ClaudePane) =>
  a.sessionName !== b.sessionName
    ? a.sessionName.localeCompare(b.sessionName)
    : a.windowIndex !== b.windowIndex
      ? +a.windowIndex - +b.windowIndex
      : +a.paneIndex - +b.paneIndex;

// ---- State ----
let session: ClaudeSession | null = null;
const panes = new Map<string, ClaudePane>();
const views = new Map<string, SideView>();
const paneOrder: string[] = [];
let dragSrcId: string | null = null;

// ---- DOM ----
const $status = document.getElementById("status")!;
const $sessionName = document.getElementById("sessionName")!;
const $mainTitle = document.getElementById("mainPaneTitle")!;
const $mainMeta = document.getElementById("mainPaneMeta")!;
const $mainEmpty = document.getElementById("mainEmpty") as HTMLElement;
const $mainTerm = document.getElementById("mainTerminal") as HTMLElement;
const $sideEmpty = document.getElementById("sideEmpty") as HTMLElement;
const $sidePanels = document.getElementById("sidePanels")!;
const $stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
const $restartBtn = document.getElementById("restartBtn") as HTMLButtonElement;

// ---- Main terminal (PTY stream, interactive) ----
const mainTerm = new Terminal(termOpts(13));
const mainFit = new FitAddon.FitAddon();
mainTerm.loadAddon(mainFit);
mainTerm.open($mainTerm);
mainTerm.onData((d: string) => api.sendMainInput(d));
$mainTerm.addEventListener("click", () => mainTerm.focus());

// ---- Side view lifecycle (PTY live stream) ----
function createView(pane: ClaudePane): SideView {
  const el = document.createElement("article");
  el.className = "side-pane";
  el.draggable = true;
  el.dataset.paneId = pane.paneId;
  el.innerHTML = `<header class="pane-header"><strong class="pane-title"></strong><span class="pane-meta"></span></header><div class="pane-terminal"></div>`;

  el.addEventListener("dragstart", (e) => {
    dragSrcId = pane.paneId;
    el.classList.add("dragging");
    e.dataTransfer!.effectAllowed = "move";
  });
  el.addEventListener("dragend", () => {
    dragSrcId = null;
    el.classList.remove("dragging");
  });
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    if (!dragSrcId || dragSrcId === pane.paneId) return;
    const srcIdx = paneOrder.indexOf(dragSrcId);
    const dstIdx = paneOrder.indexOf(pane.paneId);
    if (srcIdx === -1 || dstIdx === -1 || srcIdx === dstIdx) return;
    paneOrder.splice(srcIdx, 1);
    paneOrder.splice(dstIdx, 0, dragSrcId);
    reorderViewDom();
  });
  el.addEventListener("drop", (e) => e.preventDefault());

  $sidePanels.append(el);

  const term = new Terminal(termOpts(11));
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(el.querySelector(".pane-terminal")!);
  term.onData((d: string) => api.sendPaneInput(pane.paneId, d));
  el.addEventListener("click", () => term.focus());
  requestAnimationFrame(() => fit.fit());

  return {
    el, term, fit,
    titleEl: el.querySelector(".pane-title")!,
    metaEl: el.querySelector(".pane-meta")!,
    paneId: pane.paneId,
    lastCols: 0,
    lastRows: 0,
  };
}

function reorderViewDom(): void {
  for (const id of paneOrder) {
    const v = views.get(id);
    if (v) $sidePanels.append(v.el);
  }
}

function removeView(id: string) {
  const v = views.get(id);
  if (!v) return;
  v.term.dispose();
  v.el.remove();
  views.delete(id);
}

// ---- Render (metadata only; content arrives via PTY stream) ----
function render() {
  $sessionName.textContent = session?.sessionName ?? "";
  const isRunning = session?.status === "running";
  $stopBtn.disabled = !isRunning;
  $restartBtn.disabled = isRunning || session?.status === "starting";
  $status.textContent = !session ? "Claude Code を起動しています..."
    : session.status === "starting" ? "Claude Code 起動中"
    : session.status === "stopped" ? "Claude Code が停止しています"
    : `${panes.size} pane を表示中`;

  const sorted = [...panes.values()].sort(comparePanes);
  const mainPane = sorted.find(p => p.isMain);

  if (mainPane) {
    $mainTitle.textContent = label(mainPane);
    $mainMeta.textContent = meta(mainPane);
    $mainEmpty.hidden = true;
    $mainTerm.hidden = false;
  } else {
    $mainTitle.textContent = "Main Claude";
    $mainMeta.textContent = session?.status === "stopped"
      ? "Claude Code の起動に失敗したか、tmux session が見つかりません。"
      : "メイン pane の起動を待っています。";
    $mainEmpty.hidden = false;
    $mainTerm.hidden = true;
  }

  const active = new Set<string>();
  for (const pane of sorted.filter(p => !p.isMain)) {
    active.add(pane.paneId);
    if (!views.has(pane.paneId)) {
      views.set(pane.paneId, createView(pane));
      if (!paneOrder.includes(pane.paneId)) paneOrder.push(pane.paneId);
    }
    const v = views.get(pane.paneId)!;
    v.titleEl.textContent = label(pane);
    v.metaEl.textContent = meta(pane);
  }
  for (const id of [...views.keys()]) {
    if (!active.has(id)) {
      removeView(id);
      const idx = paneOrder.indexOf(id);
      if (idx !== -1) paneOrder.splice(idx, 1);
    }
  }
  $sideEmpty.hidden = active.size > 0;

  requestAnimationFrame(() => {
    mainFit.fit();
    api.resizeMainTerminal(mainTerm.cols, mainTerm.rows);
    for (const v of views.values()) {
      v.fit.fit();
      const cols = v.term.cols as number;
      const rows = v.term.rows as number;
      if (cols !== v.lastCols || rows !== v.lastRows) {
        v.lastCols = cols;
        v.lastRows = rows;
        api.resizeSidePane(v.paneId, cols, rows);
      }
    }
  });
}

// ---- Events ----
api.onClaudeMainData((d: string) => mainTerm.write(d));

api.onSidePaneData(({ paneId, data }: { paneId: string; data: string }) => {
  const v = views.get(paneId);
  if (v) v.term.write(data);
});

api.onClaudeSessionUpdated((s: ClaudeSession) => { session = s; render(); });
api.onClaudePaneUpdated((p: ClaudePane) => { panes.set(p.paneId, p); render(); });
api.onClaudePaneRemoved(({ paneId }: { paneId: string }) => { panes.delete(paneId); render(); });
api.onAppLog((m: string) => console.debug(m));
window.addEventListener("resize", render);

// ---- Init ----
(async () => {
  const [s, ps] = await Promise.all([api.getClaudeSession(), api.listClaudePanes()]);
  session = s;
  for (const p of ps) panes.set(p.paneId, p);
  render();
})();

// ---- Stop / Restart ----
$stopBtn.addEventListener("click", async () => {
  $stopBtn.disabled = true;
  await api.stopSession();
});
$restartBtn.addEventListener("click", async () => {
  $restartBtn.disabled = true;
  await api.restartSession();
});

// ---- Theme toggle ----
document.documentElement.dataset.theme = document.documentElement.dataset.theme || "dark";
document.getElementById("themeToggle")?.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("claude-team-panel-theme", next);
  const t = theme();
  mainTerm.options.theme = t;
  for (const v of views.values()) v.term.options.theme = t;
  document.getElementById("themeToggle")!.textContent = next === "light" ? "\u263E" : "\u2600\uFE0E";
});
