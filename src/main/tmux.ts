import { execSync, spawn } from "child_process";
import { existsSync } from "fs";

import { SPECIAL_INPUT_SEQUENCES } from "./constants";
import type { InputToken, TmuxResult } from "./types";

const COMMON_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

export function ensureFullPath(): void {
  const currentPaths = new Set((process.env.PATH || "").split(":").filter(Boolean));
  for (const dir of COMMON_BIN_DIRS) currentPaths.add(dir);
  process.env.PATH = [...currentPaths].join(":");

  if (process.platform === "darwin" || process.platform === "linux") {
    try {
      const shell = process.platform === "darwin" ? "/bin/zsh" : (process.env.SHELL || "/bin/bash");
      const shellPath = execSync(`${shell} -lc 'echo "$PATH"'`, {
        encoding: "utf8",
        timeout: 5000,
      }).trim();
      if (shellPath && shellPath.includes("/")) {
        process.env.PATH = shellPath;
        for (const dir of COMMON_BIN_DIRS) {
          if (!process.env.PATH.includes(dir)) process.env.PATH += `:${dir}`;
        }
      }
    } catch { /* keep fallback PATH */ }
  }
}

let cachedTmuxPath: string | null = null;

export function resolveTmuxPath(): string {
  if (cachedTmuxPath) return cachedTmuxPath;

  try {
    const p = execSync("which tmux", { encoding: "utf8", timeout: 3000 }).trim();
    if (p && existsSync(p)) {
      cachedTmuxPath = p;
      return p;
    }
  } catch {}

  for (const dir of COMMON_BIN_DIRS) {
    const candidate = `${dir}/tmux`;
    if (existsSync(candidate)) {
      cachedTmuxPath = candidate;
      return candidate;
    }
  }

  cachedTmuxPath = "tmux";
  return "tmux";
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function runTmux(args: string[], cwd?: string): Promise<TmuxResult> {
  return new Promise((resolve) => {
    const child = spawn(resolveTmuxPath(), args, {
      cwd,
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
