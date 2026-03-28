export type ClaudeStatus = "starting" | "running" | "stopped";

export type ClaudeSession = {
  sessionName: string;
  workspacePath: string;
  status: ClaudeStatus;
  mainPaneId: string | null;
  createdAt: number;
};

export type ClaudePane = {
  paneId: string;
  sessionName: string;
  windowId: string;
  windowIndex: string;
  windowName: string;
  paneIndex: string;
  paneTitle: string;
  currentCommand: string;
  content: string;
  isMain: boolean;
  agentName: string | null;
  detectedAt: number;
  updatedAt: number;
};

export type RawTmuxPane = Omit<ClaudePane, "content" | "isMain" | "agentName" | "updatedAt">;
export type InputToken = { literal: string } | { key: string };
export type TmuxSessionMeta = { sessionName: string; sessionActivity: number };
export type OrderedPane = Pick<RawTmuxPane, "windowIndex" | "paneIndex">;
export type TmuxResult = { code: number | null; stdout: string; stderr: string };
