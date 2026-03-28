import { ACTIVE_AGENT_SESSION_WINDOW_SECONDS } from "./constants";
import type { OrderedPane, RawTmuxPane, TmuxSessionMeta } from "./types";

export function comparePaneOrder(a: OrderedPane, b: OrderedPane): number {
  return a.windowIndex !== b.windowIndex
    ? +a.windowIndex - +b.windowIndex
    : +a.paneIndex - +b.paneIndex;
}

export function parseTmuxPanes(stdout: string): RawTmuxPane[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sessionName, windowId, windowIndex, windowName, paneId, paneIndex, paneTitle, currentCommand] = line.split("\t");
      return {
        paneId,
        sessionName,
        windowId,
        windowIndex,
        windowName,
        paneIndex,
        paneTitle,
        currentCommand,
        detectedAt: Date.now(),
      };
    })
    .filter((pane) => pane.paneId);
}

export function parseTmuxSessionMeta(stdout: string): TmuxSessionMeta[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sessionName, sessionActivity] = line.split("\t");
      return { sessionName, sessionActivity: +sessionActivity || 0 };
    })
    .filter((session) => session.sessionName);
}

export function sortRawPanes(panes: RawTmuxPane[]): RawTmuxPane[] {
  return [...panes].sort(comparePaneOrder);
}

export function getActiveSecondarySessions(
  mainSessionName: string,
  allRawPanes: RawTmuxPane[],
  sessionMeta: TmuxSessionMeta[],
): Set<string> {
  const sessionCounts = new Map<string, number>();
  for (const { sessionName } of allRawPanes) {
    if (sessionName === mainSessionName) continue;
    sessionCounts.set(sessionName, (sessionCounts.get(sessionName) ?? 0) + 1);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  return new Set(
    sessionMeta
      .filter(({ sessionName, sessionActivity }) =>
        sessionCounts.has(sessionName) &&
        nowSec - sessionActivity <= ACTIVE_AGENT_SESSION_WINDOW_SECONDS)
      .map(({ sessionName }) => sessionName),
  );
}

const AGENT_NAME_PATTERN = /─\s*@([\w-]+)\s*─/;

export function extractAgentName(capturedContent: string): string | null {
  const plainText = capturedContent.replace(/\x1b\[[0-9;]*m/g, "");
  const match = plainText.match(AGENT_NAME_PATTERN);
  return match ? match[1] : null;
}

export function getNextMainPaneId(
  currentMainPaneId: string | null,
  mainSessionPanes: RawTmuxPane[],
): string | null {
  if (currentMainPaneId && mainSessionPanes.some((pane) => pane.paneId === currentMainPaneId)) {
    return currentMainPaneId;
  }
  return mainSessionPanes[0]?.paneId ?? null;
}
