// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// All editor-specific strings and env names live here so server.ts has zero references.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ModelEnvHints } from "@jatbas/aic-core/core/types/model-env-hints.js";
import { EDITOR_ID } from "@jatbas/aic-core/core/types/enums.js";
import type { EditorModelConfigReaderAdapter } from "@jatbas/aic-core/adapters/editor-model-config-reader.js";
import type { EditorEnvHints } from "./detect-editor-id.js";
import { INSTALL_SCOPE, type InstallScope } from "./detect-install-scope.js";

export function getInstallScopeWarnings(installScope: InstallScope): readonly string[] {
  if (installScope !== INSTALL_SCOPE.BOTH) return [];
  return [
    "Duplicate AIC installation detected.\n\n" +
      "AIC is registered in **both** the global and workspace MCP configs. " +
      "This causes Cursor to run two separate AIC server instances, which leads to duplicate tools and database conflicts.\n\n" +
      "**How to fix:**\n" +
      "1. Open the file `.cursor/mcp.json` **in this project directory** (not the global one)\n" +
      '2. Delete the `"aic"` entry from `mcpServers`\n' +
      "3. Save the file\n" +
      "4. Reload Cursor: `Cmd+Shift+P` → **Reload Window**\n\n" +
      "The global config (`~/.cursor/mcp.json`) already has AIC and covers all projects — no need to reinstall. " +
      "After reloading, AIC will start normally from the global config.",
  ];
}

export function getDuplicateInstallStderrMessage(): string {
  return (
    "[aic] Duplicate install detected: AIC is in both global and workspace MCP configs. " +
    "Remove the 'aic' entry from .cursor/mcp.json in this project, then reload Cursor.\n"
  );
}

export function getEditorModelHints(
  reader: EditorModelConfigReaderAdapter,
): ModelEnvHints {
  const anthropicModel =
    process.env["ANTHROPIC_MODEL"] ?? reader.read(EDITOR_ID.CLAUDE_CODE);
  const cursorModel = process.env["CURSOR_MODEL"] ?? reader.read(EDITOR_ID.CURSOR);
  return {
    ...(typeof anthropicModel === "string" && anthropicModel !== ""
      ? { anthropicModel }
      : {}),
    ...(typeof cursorModel === "string" && cursorModel !== "" ? { cursorModel } : {}),
  };
}

export function getEditorEnvHints(): EditorEnvHints {
  return { cursorAgent: process.env["CURSOR_AGENT"] === "1" };
}

const REL_INSTALL_SCRIPT = path.join("integrations", "cursor", "install.cjs");
const REL_CC_INSTALL_SCRIPT = path.join("integrations", "claude", "install.cjs");

export function runEditorBootstrapIfNeeded(absRoot: AbsolutePath): void {
  const cursorDetected =
    fs.existsSync(path.join(absRoot, ".cursor")) ||
    (process.env["CURSOR_PROJECT_DIR"] !== undefined &&
      process.env["CURSOR_PROJECT_DIR"] !== "");
  const claudeCodeDetected =
    fs.existsSync(path.join(absRoot, ".claude")) ||
    (process.env["CLAUDE_PROJECT_DIR"] !== undefined &&
      process.env["CLAUDE_PROJECT_DIR"] !== "");
  if (!cursorDetected && !claudeCodeDetected) return;
  const installScript = path.join(absRoot, REL_INSTALL_SCRIPT);
  if (fs.existsSync(installScript)) {
    execFileSync("node", [installScript], { cwd: absRoot });
  }
  if (claudeCodeDetected) {
    const ccScript = path.join(absRoot, REL_CC_INSTALL_SCRIPT);
    if (fs.existsSync(ccScript)) {
      try {
        execFileSync("node", [ccScript], { cwd: absRoot });
      } catch {
        process.stderr.write("[aic] Claude Code installer failed; continuing.\n");
      }
    }
  }
}
