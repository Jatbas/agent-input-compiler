// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";

// Cursor reads hooks from .cursor/hooks.json (project root), not .cursor/hooks/hooks.json.
type HooksParsed = {
  hooks?: {
    sessionStart?: readonly { command?: string }[];
    preToolUse?: readonly { command?: string }[];
  };
};

type ClaudeSettingsParsed = {
  hooks?: Record<string, readonly { hooks?: readonly { command?: string }[] }[]>;
};

function commandIncludes(entry: { command?: string }, name: string): boolean {
  return String(entry.command ?? "").includes(name);
}

function readGlobalClaudeSettings(): ClaudeSettingsParsed | null {
  const globalPath = path.join(os.homedir(), ".claude", "settings.json");
  if (!fs.existsSync(globalPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(globalPath, "utf8")) as ClaudeSettingsParsed;
  } catch {
    return null;
  }
}

function settingsHaveAicHook(parsed: ClaudeSettingsParsed): boolean {
  const hooks = parsed.hooks;
  if (hooks === undefined) return false;
  return Object.values(hooks).some((wrappers) => {
    const list = wrappers;
    return list.some((w) => {
      const arr = w.hooks ?? [];
      return arr.some((h) => String(h.command ?? "").includes("aic-"));
    });
  });
}

function getClaudeNote(parsed: ClaudeSettingsParsed | null): string | null {
  if (parsed === null) return null;
  if (settingsHaveAicHook(parsed)) return "Claude Code: OK";
  return "Claude Code: settings missing AIC hooks";
}

function buildCursorNotes(
  triggerExists: boolean,
  hooksExist: boolean,
  sessionStartHasCompile: boolean,
  compileScriptExists: boolean,
  preToolUseHasRequire: boolean,
  requireScriptExists: boolean,
  preToolUseHasInjectConversationId: boolean,
  injectScriptExists: boolean,
): string[] {
  const n1 = triggerExists ? null : "trigger rule not found — run aic init";
  const n2 = hooksExist && sessionStartHasCompile ? null : "session hook not configured";
  const n3 = compileScriptExists ? null : "hook script missing";
  const n4 =
    hooksExist && (!preToolUseHasRequire || !requireScriptExists)
      ? "preToolUse require hook not configured"
      : null;
  const n5 =
    hooksExist && (!preToolUseHasInjectConversationId || !injectScriptExists)
      ? "preToolUse inject conversation_id hook not configured"
      : null;
  return [n1, n2, n3, n4, n5].filter((n): n is string => n !== null);
}

export function runStartupSelfCheck(projectRoot: AbsolutePath): {
  installationOk: boolean;
  installationNotes: string;
} {
  const triggerPath = path.join(projectRoot, ".cursor", "rules", "AIC.mdc");
  const triggerExists = fs.existsSync(triggerPath);

  const hooksPath = path.join(projectRoot, ".cursor", "hooks.json");
  const hooksExist = fs.existsSync(hooksPath);
  let sessionStartHasCompile = false;
  let preToolUseHasRequire = false;
  let preToolUseHasInjectConversationId = false;
  if (hooksExist) {
    const parsed = JSON.parse(fs.readFileSync(hooksPath, "utf8")) as HooksParsed;
    const sessionStart: readonly { command?: string }[] =
      parsed.hooks?.sessionStart ?? [];
    const preToolUse: readonly { command?: string }[] = parsed.hooks?.preToolUse ?? [];
    sessionStartHasCompile = sessionStart.some((e) =>
      commandIncludes(e, "AIC-compile-context.cjs"),
    );
    preToolUseHasRequire = preToolUse.some((e) =>
      commandIncludes(e, "AIC-require-aic-compile.cjs"),
    );
    preToolUseHasInjectConversationId = preToolUse.some((e) =>
      commandIncludes(e, "AIC-inject-conversation-id.cjs"),
    );
  }

  const hooksDir = path.join(projectRoot, ".cursor", "hooks");
  const compileScriptPath = path.join(hooksDir, "AIC-compile-context.cjs");
  const requireScriptPath = path.join(hooksDir, "AIC-require-aic-compile.cjs");
  const injectScriptPath = path.join(hooksDir, "AIC-inject-conversation-id.cjs");
  const compileScriptExists = fs.existsSync(compileScriptPath);
  const requireScriptExists = fs.existsSync(requireScriptPath);
  const injectScriptExists = fs.existsSync(injectScriptPath);

  const cursorDirExists = fs.existsSync(path.join(projectRoot, ".cursor"));
  const cursorNotes: string[] = cursorDirExists
    ? buildCursorNotes(
        triggerExists,
        hooksExist,
        sessionStartHasCompile,
        compileScriptExists,
        preToolUseHasRequire,
        requireScriptExists,
        preToolUseHasInjectConversationId,
        injectScriptExists,
      )
    : [];

  const parsed = readGlobalClaudeSettings();
  const claudeNote = getClaudeNote(parsed);
  const claudeNotes = claudeNote !== null ? [claudeNote] : [];

  const notes = [...cursorNotes, ...claudeNotes];
  const installationOk = notes.filter((n) => n !== "Claude Code: OK").length === 0;
  const installationNotes = notes.length > 0 ? notes.join("; ") : "";
  return { installationOk, installationNotes };
}
