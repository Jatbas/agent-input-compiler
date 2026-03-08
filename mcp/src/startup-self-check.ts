// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";
import * as fs from "node:fs";
import type { AbsolutePath } from "@aic/shared/core/types/paths.js";

// Cursor reads hooks from .cursor/hooks.json (project root), not .cursor/hooks/hooks.json.
type HooksParsed = {
  hooks?: {
    sessionStart?: readonly { command?: string }[];
    preToolUse?: readonly { command?: string }[];
  };
};

function commandIncludes(entry: { command?: string }, name: string): boolean {
  return String(entry.command ?? "").includes(name);
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

  const notes = [
    ...(!triggerExists ? ["trigger rule not found — run aic init"] : []),
    ...(!hooksExist || !sessionStartHasCompile ? ["session hook not configured"] : []),
    ...(!compileScriptExists ? ["hook script missing"] : []),
    ...(hooksExist && (!preToolUseHasRequire || !requireScriptExists)
      ? ["preToolUse require hook not configured"]
      : []),
    ...(hooksExist && (!preToolUseHasInjectConversationId || !injectScriptExists)
      ? ["preToolUse inject conversation_id hook not configured"]
      : []),
  ];
  const installationOk = notes.length === 0;
  const installationNotes = notes.length > 0 ? notes.join("; ") : "";
  return { installationOk, installationNotes };
}
