// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { installTriggerRule } from "../install-trigger-rule.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { EDITOR_ID } from "@jatbas/aic-core/core/types/enums.js";

function readMcpPackageVersion(): string {
  const pkgPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "package.json",
  );
  const raw = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { version?: string };
  return typeof pkg.version === "string" ? pkg.version : "0.0.0";
}

describe("installTriggerRule", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir !== undefined && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("trigger_missing_creates_file", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-trigger-"));
    const projectRoot = toAbsolutePath(tmpDir);
    installTriggerRule(projectRoot, EDITOR_ID.CURSOR);
    const triggerPath = path.join(tmpDir, ".cursor", "rules", "AIC.mdc");
    expect(fs.existsSync(triggerPath)).toBe(true);
    const content = fs.readFileSync(triggerPath, "utf8");
    expect(content).toContain("aic_compile");
    expect(content).toContain("pnpm aic");
    expect(content).toContain(tmpDir);
  });

  it("trigger_exists_does_not_overwrite", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-trigger-"));
    const rulesDir = path.join(tmpDir, ".cursor", "rules");
    fs.mkdirSync(rulesDir, { recursive: true });
    const triggerPath = path.join(tmpDir, ".cursor", "rules", "AIC.mdc");
    const currentVersion = readMcpPackageVersion();
    fs.writeFileSync(
      triggerPath,
      `custom trigger\n<!-- AIC rule version: ${currentVersion} -->`,
      "utf8",
    );
    const projectRoot = toAbsolutePath(tmpDir);
    installTriggerRule(projectRoot, EDITOR_ID.CURSOR);
    const content = fs.readFileSync(triggerPath, "utf8");
    expect(content).toContain("custom trigger");
    expect(content).toContain(`AIC rule version: ${currentVersion}`);
  });

  it("trigger_rule_updated_when_version_changes", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-trigger-"));
    const rulesDir = path.join(tmpDir, ".cursor", "rules");
    fs.mkdirSync(rulesDir, { recursive: true });
    const triggerPath = path.join(tmpDir, ".cursor", "rules", "AIC.mdc");
    fs.writeFileSync(
      triggerPath,
      "legacy content\n<!-- AIC rule version: 0.0.0 -->",
      "utf8",
    );
    const projectRoot = toAbsolutePath(tmpDir);
    installTriggerRule(projectRoot, EDITOR_ID.CURSOR);
    const content = fs.readFileSync(triggerPath, "utf8");
    expect(content).toContain("aic_compile");
    const versionMatch = content.match(/AIC rule version:\s*(\S+)/);
    expect(versionMatch).not.toBeNull();
    const expectedVersion = readMcpPackageVersion();
    expect(versionMatch?.[1]).toBe(expectedVersion);
  });

  it("trigger_missing_creates_rules_dir", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-trigger-"));
    fs.mkdirSync(path.join(tmpDir, ".cursor"));
    const projectRoot = toAbsolutePath(tmpDir);
    installTriggerRule(projectRoot, EDITOR_ID.CURSOR);
    expect(fs.existsSync(path.join(tmpDir, ".cursor", "rules"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".cursor", "rules", "AIC.mdc"))).toBe(true);
  });

  it("claude_code_creates_claude_md", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-trigger-"));
    const projectRoot = toAbsolutePath(tmpDir);
    installTriggerRule(projectRoot, EDITOR_ID.CLAUDE_CODE);
    const claudeMdPath = path.join(tmpDir, ".claude", "CLAUDE.md");
    expect(fs.existsSync(claudeMdPath)).toBe(true);
    const content = fs.readFileSync(claudeMdPath, "utf8");
    expect(content).toContain("AIC — Claude Code Rules");
    expect(content).toContain("BEGIN AIC MANAGED SECTION");
    expect(content).toContain("END AIC MANAGED SECTION");
  });

  it("generic_creates_no_trigger_file", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-trigger-"));
    const projectRoot = toAbsolutePath(tmpDir);
    installTriggerRule(projectRoot, EDITOR_ID.GENERIC);
    expect(fs.existsSync(path.join(tmpDir, ".cursor", "rules", "AIC.mdc"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".claude", "CLAUDE.md"))).toBe(false);
  });

  it("install_trigger_cursor_claude_code installs Cursor rule not Claude", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-trigger-"));
    const projectRoot = toAbsolutePath(tmpDir);
    installTriggerRule(projectRoot, EDITOR_ID.CURSOR_CLAUDE_CODE);
    const cursorPath = path.join(tmpDir, ".cursor", "rules", "AIC.mdc");
    const claudePath = path.join(tmpDir, ".claude", "CLAUDE.md");
    expect(fs.existsSync(cursorPath)).toBe(true);
    expect(fs.existsSync(claudePath)).toBe(false);
    const content = fs.readFileSync(cursorPath, "utf8");
    expect(content).toContain("aic_compile");
  });
});
