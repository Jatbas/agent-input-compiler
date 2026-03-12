// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { installCursorHooks } from "../install-cursor-hooks.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { runStartupSelfCheck } from "../startup-self-check.js";
import { installTriggerRule } from "../install-trigger-rule.js";

describe("installCursorHooks", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir !== undefined && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("hooks_missing_creates_hooks_json_and_scripts", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-hooks-"));
    const projectRoot = toAbsolutePath(tmpDir);
    installCursorHooks(projectRoot);
    expect(fs.existsSync(path.join(tmpDir, ".cursor", "hooks.json"))).toBe(true);
    const parsed = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".cursor", "hooks.json"), "utf8"),
    );
    expect(Array.isArray(parsed.hooks?.sessionStart)).toBe(true);
    expect(
      parsed.hooks.sessionStart.some((e: { command?: string }) =>
        (e.command ?? "").includes("AIC-compile-context.cjs"),
      ),
    ).toBe(true);
    expect(Array.isArray(parsed.hooks?.preToolUse)).toBe(true);
    expect(
      parsed.hooks.preToolUse.some((e: { command?: string }) =>
        (e.command ?? "").includes("AIC-require-aic-compile.cjs"),
      ),
    ).toBe(true);
    const hooksDir = path.join(tmpDir, ".cursor", "hooks");
    expect(fs.existsSync(path.join(hooksDir, "AIC-session-init.cjs"))).toBe(true);
    expect(fs.existsSync(path.join(hooksDir, "AIC-compile-context.cjs"))).toBe(true);
    expect(fs.existsSync(path.join(hooksDir, "AIC-require-aic-compile.cjs"))).toBe(true);
    expect(fs.existsSync(path.join(hooksDir, "AIC-inject-conversation-id.cjs"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(hooksDir, "AIC-before-submit-prewarm.cjs"))).toBe(
      true,
    );
  });

  it("hooks_json_exists_merges_without_removing_user_entries", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-hooks-"));
    const hooksPath = path.join(tmpDir, ".cursor", "hooks.json");
    fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true });
    fs.writeFileSync(
      hooksPath,
      JSON.stringify({
        version: 1,
        hooks: { sessionStart: [{ command: "node user-script.cjs" }] },
      }),
      "utf8",
    );
    fs.mkdirSync(path.join(tmpDir, ".cursor", "hooks"), { recursive: true });
    installCursorHooks(toAbsolutePath(tmpDir));
    const parsed = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    const sessionStart = parsed.hooks?.sessionStart ?? [];
    expect(
      sessionStart.some((e: { command?: string }) =>
        (e.command ?? "").includes("user-script.cjs"),
      ),
    ).toBe(true);
    expect(
      sessionStart.some(
        (e: { command?: string }) =>
          (e.command ?? "").includes("AIC-compile-context.cjs") ||
          (e.command ?? "").includes("AIC-session-init.cjs"),
      ),
    ).toBe(true);
  });

  it("scripts_overwritten_when_content_differs", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-hooks-"));
    const hooksDir = path.join(tmpDir, ".cursor", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    const scriptPath = path.join(hooksDir, "AIC-compile-context.cjs");
    fs.writeFileSync(scriptPath, "custom", "utf8");
    installCursorHooks(toAbsolutePath(tmpDir));
    const content = fs.readFileSync(scriptPath, "utf8");
    expect(content).not.toBe("custom");
    expect(content.includes("aic_compile") || content.includes("execSync")).toBe(true);
  });

  it("idempotent_second_call_no_op", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-hooks-"));
    const projectRoot = toAbsolutePath(tmpDir);
    installCursorHooks(projectRoot);
    const hooksPath = path.join(tmpDir, ".cursor", "hooks.json");
    const scriptPath = path.join(tmpDir, ".cursor", "hooks", "AIC-compile-context.cjs");
    const hooksBefore = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    const scriptBefore = fs.readFileSync(scriptPath, "utf8");
    installCursorHooks(projectRoot);
    const hooksAfter = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    const scriptAfter = fs.readFileSync(scriptPath, "utf8");
    expect(Object.keys(hooksAfter.hooks)).toEqual(Object.keys(hooksBefore.hooks));
    expect((hooksAfter.hooks?.sessionStart ?? []).length).toBe(
      (hooksBefore.hooks?.sessionStart ?? []).length,
    );
    expect(scriptAfter).toBe(scriptBefore);
  });

  it("stale_hook_script_deleted_on_bootstrap", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-hooks-"));
    const cursorDir = path.join(tmpDir, ".cursor");
    const hooksDir = path.join(cursorDir, "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    const stalePath = path.join(hooksDir, "AIC-old-removed.cjs");
    fs.writeFileSync(stalePath, "stale", "utf8");
    installCursorHooks(toAbsolutePath(tmpDir));
    expect(fs.existsSync(stalePath)).toBe(false);
    const scriptNames = [
      "AIC-session-init.cjs",
      "AIC-compile-context.cjs",
      "AIC-require-aic-compile.cjs",
      "AIC-inject-conversation-id.cjs",
      "AIC-post-compile-context.cjs",
      "AIC-before-submit-prewarm.cjs",
      "AIC-after-file-edit-tracker.cjs",
      "AIC-session-end.cjs",
      "AIC-stop-quality-check.cjs",
    ];
    for (const name of scriptNames) {
      expect(fs.existsSync(path.join(hooksDir, name))).toBe(true);
    }
  });

  it("stale_hook_entry_removed_from_hooks_json", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-hooks-"));
    const hooksPath = path.join(tmpDir, ".cursor", "hooks.json");
    fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true });
    fs.writeFileSync(
      hooksPath,
      JSON.stringify({
        version: 1,
        hooks: {
          sessionStart: [{ command: "node .cursor/hooks/AIC-removed-script.cjs" }],
        },
      }),
      "utf8",
    );
    fs.mkdirSync(path.join(tmpDir, ".cursor", "hooks"), { recursive: true });
    installCursorHooks(toAbsolutePath(tmpDir));
    const parsed = JSON.parse(fs.readFileSync(hooksPath, "utf8"));
    const sessionStart = parsed.hooks?.sessionStart ?? [];
    expect(
      sessionStart.some((e: { command?: string }) =>
        (e.command ?? "").includes("AIC-removed-script.cjs"),
      ),
    ).toBe(false);
    expect(
      sessionStart.some((e: { command?: string }) =>
        (e.command ?? "").includes("AIC-compile-context.cjs"),
      ),
    ).toBe(true);
  });

  it("self_check_passes_after_install", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-hooks-"));
    const rulesDir = path.join(tmpDir, ".cursor", "rules");
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, "AIC.mdc"), "", "utf8");
    const projectRoot = toAbsolutePath(tmpDir);
    installTriggerRule(projectRoot);
    installCursorHooks(projectRoot);
    const result = runStartupSelfCheck(projectRoot);
    expect(result.installationOk).toBe(true);
    expect(result.installationNotes).toBe("");
  });
});
