import { spawn } from "child_process";

import { SPECIAL_INPUT_SEQUENCES, WORKSPACE_PATH } from "./constants";
import type { InputToken, TmuxResult } from "./types";

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function runTmux(args: string[]): Promise<TmuxResult> {
  return new Promise((resolve) => {
    const child = spawn("tmux", args, {
      cwd: WORKSPACE_PATH,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once("error", (err) => resolve({ code: 1, stdout, stderr: err.message }));
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

export function tokenizeTmuxInput(data: string): InputToken[] {
  const tokens: InputToken[] = [];
  let i = 0;

  while (i < data.length) {
    const seq = SPECIAL_INPUT_SEQUENCES.find(([sequence]) => data.startsWith(sequence, i));
    if (seq) {
      tokens.push({ key: seq[1] });
      i += seq[0].length;
      continue;
    }

    let j = i + 1;
    while (j < data.length && !SPECIAL_INPUT_SEQUENCES.some(([sequence]) => data.startsWith(sequence, j))) {
      j++;
    }
    tokens.push({ literal: data.slice(i, j) });
    i = j;
  }

  return tokens;
}
