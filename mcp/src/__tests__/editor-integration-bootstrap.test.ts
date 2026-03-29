// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import {
  BOOTSTRAP_INTEGRATION,
  parseBootstrapIntegrationMode,
  readClaudeCodeInstalledFromExtensionsDir,
  resolveClaudeInstallScript,
  runEditorBootstrapIfNeeded,
} from "../editor-integration-dispatch.js";

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    const hasBundle = fs.existsSync(
      path.join(dir, "mcp", "scripts", "bundle-cursor-installer.cjs"),
    );
    const hasInstall = fs.existsSync(
      path.join(dir, "integrations", "cursor", "install.cjs"),
    );
    if (hasBundle && hasInstall) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new ConfigError("Editor bootstrap test: repo root not found.");
    }
    dir = parent;
  }
}

function computeExpectedHookFileCount(root: string): number {
  const manifestPath = path.join(root, "integrations", "cursor", "aic-hook-scripts.json");
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(raw) as { readonly hookScriptNames: readonly string[] };
  const sharedDir = path.join(root, "integrations", "shared");
  const sharedEntries = fs.readdirSync(sharedDir);
  const sharedCjsCount = sharedEntries.reduce((acc, name) => {
    if (!name.endsWith(".cjs")) return acc;
    const src = path.join(sharedDir, name);
    return fs.statSync(src).isFile() ? acc + 1 : acc;
  }, 0);
  return manifest.hookScriptNames.length + sharedCjsCount;
}

const startDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = findRepoRoot(startDir);

beforeAll(() => {
  execFileSync(
    "node",
    [path.join(repoRoot, "mcp", "scripts", "bundle-cursor-installer.cjs")],
    {
      cwd: repoRoot,
    },
  );
});

describe("editor integration bootstrap", () => {
  it("bundle_copies_claude_install_script", () => {
    const bundled = path.join(repoRoot, "mcp", "integrations", "claude", "install.cjs");
    expect(fs.existsSync(bundled)).toBe(true);
  });

  it("bundle_includes_uninstall_scripts", () => {
    expect(
      fs.existsSync(
        path.join(repoRoot, "mcp", "integrations", "cursor", "uninstall.cjs"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(repoRoot, "mcp", "integrations", "claude", "uninstall.cjs"),
      ),
    ).toBe(true);
  });

  it("bundle_includes_clean_global_aic_dir_for_uninstall_requires", () => {
    const bundled = path.join(
      repoRoot,
      "mcp",
      "integrations",
      "clean-global-aic-dir.cjs",
    );
    expect(fs.existsSync(bundled)).toBe(true);
  });

  it("readClaudeCodeInstalledFromExtensionsDir_false_when_missing", () => {
    expect(
      readClaudeCodeInstalledFromExtensionsDir("/nonexistent-aic-extensions-xyz"),
    ).toBe(false);
  });

  it("readClaudeCodeInstalledFromExtensionsDir_true_when_prefix_present", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cc-ext-"));
    try {
      fs.mkdirSync(path.join(tmpDir, "anthropic.claude-code-0.0.0"), { recursive: true });
      expect(readClaudeCodeInstalledFromExtensionsDir(tmpDir)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("readClaudeCodeInstalledFromExtensionsDir_false_when_no_match", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cc-ext-empty-"));
    try {
      expect(readClaudeCodeInstalledFromExtensionsDir(tmpDir)).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("resolveClaudeInstallScript_prefers_workspace", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cc-resolve-ws-"));
    try {
      const rel = path.join("integrations", "claude", "install.cjs");
      fs.mkdirSync(path.dirname(path.join(projectRoot, rel)), { recursive: true });
      fs.writeFileSync(path.join(projectRoot, rel), "", "utf8");
      const expected = path.join(projectRoot, rel);
      expect(resolveClaudeInstallScript(toAbsolutePath(projectRoot))).toBe(expected);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("resolveClaudeInstallScript_falls_back_to_bundled_after_257_bundle", () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cc-resolve-bundle-"));
    try {
      const bundled = path.join(repoRoot, "mcp", "integrations", "claude", "install.cjs");
      expect(fs.existsSync(bundled)).toBe(true);
      expect(resolveClaudeInstallScript(toAbsolutePath(projectRoot))).toBe(bundled);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it("editor_integration_bootstrap_auto_unchanged", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-editor-bootstrap-"));
    try {
      fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true });
      runEditorBootstrapIfNeeded(toAbsolutePath(tmpDir));
      const hooksJsonPath = path.join(tmpDir, ".cursor", "hooks.json");
      expect(fs.existsSync(hooksJsonPath)).toBe(true);
      const expectedHookFileCount = computeExpectedHookFileCount(repoRoot);
      const hooksDir = path.join(tmpDir, ".cursor", "hooks");
      const names = fs.readdirSync(hooksDir);
      expect(names.length).toBe(expectedHookFileCount);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("editor_integration_bootstrap_force_cursor_without_dot_cursor", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-editor-bootstrap-"));
    try {
      runEditorBootstrapIfNeeded(toAbsolutePath(tmpDir), BOOTSTRAP_INTEGRATION.CURSOR);
      const hooksJsonPath = path.join(tmpDir, ".cursor", "hooks.json");
      expect(fs.existsSync(hooksJsonPath)).toBe(true);
      const expectedHookFileCount = computeExpectedHookFileCount(repoRoot);
      const hooksDir = path.join(tmpDir, ".cursor", "hooks");
      const names = fs.readdirSync(hooksDir);
      expect(names.length).toBe(expectedHookFileCount);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("editor_integration_bootstrap_none_skips", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-editor-bootstrap-"));
    try {
      fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true });
      runEditorBootstrapIfNeeded(toAbsolutePath(tmpDir), BOOTSTRAP_INTEGRATION.NONE);
      const hooksJsonPath = path.join(tmpDir, ".cursor", "hooks.json");
      expect(fs.existsSync(hooksJsonPath)).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("parse_bootstrap_integration_invalid_argv_throws", () => {
    expect(() =>
      parseBootstrapIntegrationMode(["--aic-bootstrap-integration=not-a-mode"]),
    ).toThrow(ConfigError);
  });
});
