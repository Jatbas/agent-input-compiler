// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ensureProjectInit, runInit } from "../init-project.js";
import { toAbsolutePath } from "@jatbas/aic-shared/core/types/paths.js";
import { ConfigError } from "@jatbas/aic-shared/core/errors/config-error.js";

describe("runInit", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir !== undefined && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates_aic_dir_config_and_gitignore", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-init-"));
    const projectRoot = toAbsolutePath(tmpDir);
    runInit(projectRoot);
    const aicDir = path.join(tmpDir, ".aic");
    expect(fs.existsSync(aicDir)).toBe(true);
    const mode = fs.statSync(aicDir).mode & 0o777;
    expect(mode).toBe(0o700);
    const configPath = path.join(tmpDir, "aic.config.json");
    expect(fs.existsSync(configPath)).toBe(true);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      contextBudget: { maxTokens: number };
    };
    expect(config.contextBudget.maxTokens).toBe(8000);
    const gitignorePath = path.join(tmpDir, ".gitignore");
    expect(fs.existsSync(gitignorePath)).toBe(true);
    expect(fs.readFileSync(gitignorePath, "utf8")).toContain(".aic/");
  });

  it("config_already_exists_throws", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-init-"));
    fs.writeFileSync(path.join(tmpDir, "aic.config.json"), "{}", "utf8");
    const projectRoot = toAbsolutePath(tmpDir);
    expect(() => runInit(projectRoot)).toThrow(ConfigError);
  });
});

describe("ensureProjectInit", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir !== undefined && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates_config_and_artifacts_when_config_missing", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-ensure-init-"));
    const projectRoot = toAbsolutePath(tmpDir);
    ensureProjectInit(projectRoot);
    expect(fs.existsSync(path.join(tmpDir, ".aic"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "aic.config.json"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".cursor", "rules", "AIC.mdc"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".cursor", "hooks.json"))).toBe(true);
  });

  it("no_op_when_config_exists", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-ensure-init-"));
    fs.writeFileSync(
      path.join(tmpDir, "aic.config.json"),
      JSON.stringify({ contextBudget: { maxTokens: 4000 } }),
      "utf8",
    );
    const projectRoot = toAbsolutePath(tmpDir);
    ensureProjectInit(projectRoot);
    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "aic.config.json"), "utf8"),
    ) as {
      contextBudget: { maxTokens: number };
    };
    expect(config.contextBudget.maxTokens).toBe(4000);
  });
});
