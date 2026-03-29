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
  term: InstanceType<typeof Terminal>;
  fit: { fit(): void };
  paneId: string;
  lastCols: number;
  lastRows: number;
}

interface ElectronAPI {
  getClaudeSession(): Promise<ClaudeSession>;
  listClaudePanes(): Promise<ClaudePane[]>;
  stopSession(): Promise<void>;
  restartSession(): Promise<void>;
  sendMainInput(data: string): void;
  resizeMainTerminal(cols: number, rows: number): void;
  sendPaneInput(paneId: string, data: string): void;
  resizeSidePane(paneId: string, cols: number, rows: number): void;
  onClaudeMainData(cb: (data: string) => void): () => void;
  onSidePaneData(cb: (payload: { paneId: string; data: string }) => void): () => void;
  onClaudeSessionUpdated(cb: (payload: ClaudeSession) => void): () => void;
  onClaudePaneUpdated(cb: (payload: ClaudePane) => void): () => void;
  onClaudePaneRemoved(cb: (payload: { paneId: string }) => void): () => void;
  onAppLog(cb: (message: string) => void): () => void;
}
