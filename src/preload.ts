import { contextBridge, ipcRenderer } from "electron";

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("electronAPI", {
  getClaudeSession: () => ipcRenderer.invoke("claude:get-session"),
  listClaudePanes: () => ipcRenderer.invoke("claude:list-panes"),
  sendMainInput: (data: string) => ipcRenderer.send("claude:main-input", data),
  resizeMainTerminal: (cols: number, rows: number) =>
    ipcRenderer.send("claude:main-resize", { cols, rows }),
  sendPaneInput: (paneId: string, data: string) =>
    ipcRenderer.send("claude:send-pane-input", { paneId, data }),
  resizeSidePane: (paneId: string, cols: number, rows: number) =>
    ipcRenderer.send("claude:pane-resize", { paneId, cols, rows }),
  onClaudeMainData: (cb: (data: string) => void) => on("claude:main-data", cb),
  onSidePaneData: (cb: (payload: { paneId: string; data: string }) => void) =>
    on("claude:side-pane-data", cb),
  onClaudeSessionUpdated: (cb: (payload: unknown) => void) =>
    on("claude:session-updated", cb),
  onClaudePaneUpdated: (cb: (payload: unknown) => void) =>
    on("claude:pane-updated", cb),
  onClaudePaneRemoved: (cb: (payload: { paneId: string }) => void) =>
    on("claude:pane-removed", cb),
  onAppLog: (cb: (message: string) => void) => on("app:log", cb),
});
