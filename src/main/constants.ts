import { createHash } from "crypto";

import type { ClaudeSession } from "./types";

export const CLAUDE_LAUNCH_COMMAND = "claude";
export const WORKSPACE_PATH = process.cwd();
export const WORKSPACE_HASH = createHash("sha1").update(WORKSPACE_PATH).digest("hex").slice(0, 6);
export const CLAUDE_SESSION_NAME = `ctp-main-${WORKSPACE_HASH}`;
export const ACTIVE_AGENT_SESSION_WINDOW_SECONDS = 120;

export const SPECIAL_INPUT_SEQUENCES: Array<[string, string]> = [
  ["\u001b[A", "Up"], ["\u001b[B", "Down"], ["\u001b[C", "Right"], ["\u001b[D", "Left"],
  ["\u001b[3~", "Delete"], ["\u001b[H", "Home"], ["\u001b[F", "End"],
  ["\u001bOH", "Home"], ["\u001bOF", "End"],
  ["\r", "Enter"], ["\n", "Enter"], ["\t", "Tab"], ["\u007f", "BSpace"],
  ["\u001b", "Escape"], ["\u0003", "C-c"], ["\u0004", "C-d"],
  ["\u0015", "C-u"], ["\u000c", "C-l"], ["\u001a", "C-z"],
];

export function createInitialClaudeSession(): ClaudeSession {
  return {
    sessionName: CLAUDE_SESSION_NAME,
    workspacePath: WORKSPACE_PATH,
    status: "starting",
    mainPaneId: null,
    createdAt: Date.now(),
  };
}
