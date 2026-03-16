// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runStartupSelfCheck } from "../startup-self-check.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";

describe("runStartupSelfCheck", () => {
  let tmpDir: string;
  let savedHome: string | undefined;

  afterEach(() => {
    if (savedHome !== undefined) {
      process.env["HOME"] = savedHome;
    }
    if (tmpDir !== undefined && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("all_missing_returns_false_and_notes", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-startup-"));
    savedHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;
    fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true });
    const projectRoot = toAbsolutePath(tmpDir);
    const result = runStartupSelfCheck(projectRoot);
    expect(result.installationOk).toBe(false);
    expect(result.installationNotes).toContain("trigger rule not found");
    expect(result.installationNotes).toContain("session hook not configured");
    expect(result.installationNotes).toContain("hook script missing");
  });

  it("all_present_returns_true", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-startup-"));
    savedHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;
    const rulesDir = path.join(tmpDir, ".cursor", "rules");
    const hooksDir = path.join(tmpDir, ".cursor", "hooks");
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, "AIC.mdc"), "");
    fs.writeFileSync(
      path.join(tmpDir, ".cursor", "hooks.json"),
      JSON.stringify({
        hooks: {
          sessionStart: [{ command: "node .cursor/hooks/AIC-compile-context.cjs" }],
          preToolUse: [
            { command: "node .cursor/hooks/AIC-require-aic-compile.cjs" },
            {
              command: "node .cursor/hooks/AIC-inject-conversation-id.cjs",
              matcher: "MCP",
            },
          ],
        },
      }),
    );
    fs.writeFileSync(path.join(hooksDir, "AIC-compile-context.cjs"), "");
    fs.writeFileSync(path.join(hooksDir, "AIC-require-aic-compile.cjs"), "");
    fs.writeFileSync(path.join(hooksDir, "AIC-inject-conversation-id.cjs"), "");
    const projectRoot = toAbsolutePath(tmpDir);
    const result = runStartupSelfCheck(projectRoot);
    expect(result.installationOk).toBe(true);
    expect(result.installationNotes).toBe("");
  });

  it("session_only_missing_preToolUse_reports_preToolUse_notes", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-startup-"));
    savedHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;
    const rulesDir = path.join(tmpDir, ".cursor", "rules");
    const hooksDir = path.join(tmpDir, ".cursor", "hooks");
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, "AIC.mdc"), "");
    fs.writeFileSync(
      path.join(tmpDir, ".cursor", "hooks.json"),
      JSON.stringify({
        hooks: {
          sessionStart: [{ command: "node .cursor/hooks/AIC-compile-context.cjs" }],
          // preToolUse missing
        },
      }),
    );
    fs.writeFileSync(path.join(hooksDir, "AIC-compile-context.cjs"), "");
    const projectRoot = toAbsolutePath(tmpDir);
    const result = runStartupSelfCheck(projectRoot);
    expect(result.installationOk).toBe(false);
    expect(result.installationNotes).toContain("preToolUse require hook not configured");
    expect(result.installationNotes).toContain(
      "preToolUse inject conversation_id hook not configured",
    );
  });

  it("only_trigger_missing_notes_mention_trigger", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-startup-"));
    savedHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;
    const hooksDir = path.join(tmpDir, ".cursor", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".cursor", "hooks.json"),
      JSON.stringify({
        hooks: {
          sessionStart: [{ command: "node .cursor/hooks/AIC-compile-context.cjs" }],
          preToolUse: [
            { command: "node .cursor/hooks/AIC-require-aic-compile.cjs" },
            {
              command: "node .cursor/hooks/AIC-inject-conversation-id.cjs",
              matcher: "MCP",
            },
          ],
        },
      }),
    );
    fs.writeFileSync(path.join(hooksDir, "AIC-compile-context.cjs"), "");
    fs.writeFileSync(path.join(hooksDir, "AIC-require-aic-compile.cjs"), "");
    fs.writeFileSync(path.join(hooksDir, "AIC-inject-conversation-id.cjs"), "");
    const projectRoot = toAbsolutePath(tmpDir);
    const result = runStartupSelfCheck(projectRoot);
    expect(result.installationOk).toBe(false);
    expect(result.installationNotes).toContain("trigger rule not found — run aic init");
  });

  it("claude_dir_absent_skips_cc_checks", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-startup-"));
    savedHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;
    const rulesDir = path.join(tmpDir, ".cursor", "rules");
    const hooksDir = path.join(tmpDir, ".cursor", "hooks");
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, "AIC.mdc"), "");
    fs.writeFileSync(
      path.join(tmpDir, ".cursor", "hooks.json"),
      JSON.stringify({
        hooks: {
          sessionStart: [{ command: "node .cursor/hooks/AIC-compile-context.cjs" }],
          preToolUse: [
            { command: "node .cursor/hooks/AIC-require-aic-compile.cjs" },
            { command: "node .cursor/hooks/AIC-inject-conversation-id.cjs" },
          ],
        },
      }),
    );
    fs.writeFileSync(path.join(hooksDir, "AIC-compile-context.cjs"), "");
    fs.writeFileSync(path.join(hooksDir, "AIC-require-aic-compile.cjs"), "");
    fs.writeFileSync(path.join(hooksDir, "AIC-inject-conversation-id.cjs"), "");
    const projectRoot = toAbsolutePath(tmpDir);
    const result = runStartupSelfCheck(projectRoot);
    expect(result.installationOk).toBe(true);
    expect(result.installationNotes).not.toContain("Claude Code");
  });

  it("claude_settings_and_claude_md_pass", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-startup-"));
    savedHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;
    const globalClaudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(globalClaudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalClaudeDir, "settings.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [{ command: "node /some/path/aic-session-start.cjs" }],
            },
          ],
        },
      }),
    );
    const projectRoot = toAbsolutePath(tmpDir);
    const result = runStartupSelfCheck(projectRoot);
    expect(result.installationNotes).toContain("Claude Code: OK");
    expect(result.installationOk).toBe(true);
  });

  it("claude_settings_missing_aic_hooks", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-startup-"));
    savedHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;
    const globalClaudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(globalClaudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalClaudeDir, "settings.json"),
      JSON.stringify({ hooks: {} }),
    );
    const projectRoot = toAbsolutePath(tmpDir);
    const result = runStartupSelfCheck(projectRoot);
    expect(result.installationNotes).toContain("Claude Code: settings missing AIC hooks");
    expect(result.installationOk).toBe(false);
  });

  it("startup self-check Claude from global", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-startup-"));
    savedHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;
    const globalClaudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(globalClaudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalClaudeDir, "settings.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [{ hooks: [{ command: "node aic-session-start.cjs" }] }],
        },
      }),
    );
    const projectRoot = toAbsolutePath(tmpDir);
    const result = runStartupSelfCheck(projectRoot);
    expect(result.installationNotes).toContain("Claude Code: OK");
    expect(result.installationNotes).not.toContain("settings missing");
    expect(result.installationOk).toBe(true);
  });
});
