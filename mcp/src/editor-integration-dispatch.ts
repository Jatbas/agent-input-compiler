// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// All editor-specific strings and env names live here so server.ts has zero references.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ModelEnvHints } from "@jatbas/aic-core/core/types/model-env-hints.js";
import { EDITOR_ID } from "@jatbas/aic-core/core/types/enums.js";
import type { EditorModelConfigReaderAdapter } from "@jatbas/aic-core/adapters/editor-model-config-reader.js";
import type { EditorEnvHints } from "./detect-editor-id.js";
import { INSTALL_SCOPE, type InstallScope } from "./detect-install-scope.js";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";

export const BOOTSTRAP_INTEGRATION = {
  AUTO: "auto",
  NONE: "none",
  CURSOR: "cursor",
  CLAUDE_CODE: "claude-code",
  CURSOR_CLAUDE_CODE: "cursor-claude-code",
} as const;
export type BootstrapIntegrationMode =
  (typeof BOOTSTRAP_INTEGRATION)[keyof typeof BOOTSTRAP_INTEGRATION];

const BOOTSTRAP_FLAG_PREFIX = "--aic-bootstrap-integration=";

const VALID_MODES: ReadonlySet<string> = new Set<string>([
  BOOTSTRAP_INTEGRATION.AUTO,
  BOOTSTRAP_INTEGRATION.NONE,
  BOOTSTRAP_INTEGRATION.CURSOR,
  BOOTSTRAP_INTEGRATION.CLAUDE_CODE,
  BOOTSTRAP_INTEGRATION.CURSOR_CLAUDE_CODE,
]);

function assertBootstrapMode(raw: string): BootstrapIntegrationMode {
  if (!VALID_MODES.has(raw)) {
    throw new ConfigError(
      `Invalid AIC bootstrap integration mode "${raw}". Use auto, none, cursor, claude-code, or cursor-claude-code.`,
    );
  }
  return raw as BootstrapIntegrationMode;
}

export function parseBootstrapIntegrationMode(
  argv: readonly string[],
): BootstrapIntegrationMode {
  let fromArg: string | undefined;
  for (const entry of argv) {
    if (entry.startsWith(BOOTSTRAP_FLAG_PREFIX)) {
      fromArg = entry.slice(BOOTSTRAP_FLAG_PREFIX.length);
    }
  }
  if (fromArg !== undefined) {
    if (fromArg === "") {
      throw new ConfigError(
        "Invalid AIC bootstrap integration: empty value for --aic-bootstrap-integration.",
      );
    }
    return assertBootstrapMode(fromArg);
  }
  const envRaw = process.env["AIC_BOOTSTRAP_INTEGRATION"];
  const trimmed = typeof envRaw === "string" ? envRaw.trim() : "";
  if (trimmed === "") {
    return BOOTSTRAP_INTEGRATION.AUTO;
  }
  return assertBootstrapMode(trimmed);
}

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

// Cursor sends "default" for auto-mode; normalize to "auto"
function normalizeModelHint(raw: string): string {
  return raw.toLowerCase() === "default" ? "auto" : raw;
}

export function getEditorModelHints(
  reader: EditorModelConfigReaderAdapter,
): ModelEnvHints {
  const anthropicRaw =
    process.env["ANTHROPIC_MODEL"] ?? reader.read(EDITOR_ID.CLAUDE_CODE);
  const cursorRaw = process.env["CURSOR_MODEL"] ?? reader.read(EDITOR_ID.CURSOR);
  const anthropicModel =
    typeof anthropicRaw === "string" && anthropicRaw !== ""
      ? normalizeModelHint(anthropicRaw)
      : undefined;
  const cursorModel =
    typeof cursorRaw === "string" && cursorRaw !== ""
      ? normalizeModelHint(cursorRaw)
      : undefined;
  return {
    ...(anthropicModel !== undefined ? { anthropicModel } : {}),
    ...(cursorModel !== undefined ? { cursorModel } : {}),
  };
}

export function getEditorEnvHints(): EditorEnvHints {
  const claudeCodeProjectDir =
    process.env["CLAUDE_PROJECT_DIR"] !== undefined &&
    process.env["CLAUDE_PROJECT_DIR"] !== "";
  const cursorProjectDir =
    process.env["CURSOR_PROJECT_DIR"] !== undefined &&
    process.env["CURSOR_PROJECT_DIR"] !== "";
  return {
    cursorAgent: process.env["CURSOR_AGENT"] === "1",
    claudeCodeProjectDir,
    cursorProjectDir,
  };
}

const REL_INSTALL_SCRIPT = path.join("integrations", "cursor", "install.cjs");
const REL_CC_INSTALL_SCRIPT = path.join("integrations", "claude", "install.cjs");

function resolveBundledCursorInstallScript(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.resolve(here, "..", "integrations", "cursor", "install.cjs");
  return fs.existsSync(candidate) ? candidate : null;
}

function resolveCursorInstallScript(absRoot: AbsolutePath): string | null {
  const inProject = path.join(absRoot, REL_INSTALL_SCRIPT);
  if (fs.existsSync(inProject)) return inProject;
  return resolveBundledCursorInstallScript();
}

function runCursorInstallerIfResolvable(absRoot: AbsolutePath): void {
  const scriptPath = resolveCursorInstallScript(absRoot);
  if (scriptPath !== null) {
    execFileSync("node", [scriptPath], { cwd: absRoot });
  }
}

function runClaudeInstallerIfPresent(absRoot: AbsolutePath): void {
  const ccScript = path.join(absRoot, REL_CC_INSTALL_SCRIPT);
  if (fs.existsSync(ccScript)) {
    try {
      execFileSync("node", [ccScript], { cwd: absRoot });
    } catch {
      process.stderr.write("[aic] Claude Code installer failed; continuing.\n");
    }
  }
}

function runAutoBootstrap(absRoot: AbsolutePath): void {
  const cursorDetected =
    fs.existsSync(path.join(absRoot, ".cursor")) ||
    (process.env["CURSOR_PROJECT_DIR"] !== undefined &&
      process.env["CURSOR_PROJECT_DIR"] !== "");
  const claudeCodeDetected =
    fs.existsSync(path.join(absRoot, ".claude")) ||
    (process.env["CLAUDE_PROJECT_DIR"] !== undefined &&
      process.env["CLAUDE_PROJECT_DIR"] !== "");
  if (!cursorDetected && !claudeCodeDetected) return;
  if (cursorDetected) {
    runCursorInstallerIfResolvable(absRoot);
  }
  if (claudeCodeDetected) {
    runClaudeInstallerIfPresent(absRoot);
  }
}

const RUN_BOOTSTRAP_BY_MODE: Record<
  BootstrapIntegrationMode,
  (absRoot: AbsolutePath) => void
> = {
  [BOOTSTRAP_INTEGRATION.NONE]: () => {},
  [BOOTSTRAP_INTEGRATION.AUTO]: runAutoBootstrap,
  [BOOTSTRAP_INTEGRATION.CURSOR]: runCursorInstallerIfResolvable,
  [BOOTSTRAP_INTEGRATION.CLAUDE_CODE]: runClaudeInstallerIfPresent,
  [BOOTSTRAP_INTEGRATION.CURSOR_CLAUDE_CODE]: (absRoot: AbsolutePath): void => {
    runCursorInstallerIfResolvable(absRoot);
    runClaudeInstallerIfPresent(absRoot);
  },
};

export function runEditorBootstrapIfNeeded(
  absRoot: AbsolutePath,
  mode: BootstrapIntegrationMode = BOOTSTRAP_INTEGRATION.AUTO,
): void {
  RUN_BOOTSTRAP_BY_MODE[mode](absRoot);
}
