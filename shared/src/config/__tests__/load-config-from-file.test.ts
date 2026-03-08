// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { toAbsolutePath } from "#core/types/paths.js";
import { toFilePath } from "#core/types/paths.js";
import { toTokenCount } from "#core/types/units.js";
import { ConfigError } from "#core/errors/config-error.js";
import { LoadConfigFromFile } from "../load-config-from-file.js";

describe("LoadConfigFromFile", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir !== undefined && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("load_missing_file_returns_defaults", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    const result = loader.load(projectRoot, null);
    expect(result.config.contextBudget.maxTokens).toBe(toTokenCount(8000));
    expect(result.config.heuristic.maxFiles).toBe(20);
    expect(result.rawJson).toBeUndefined();
  });

  it("load_valid_file_returns_config_and_rawJson", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    const configPath = path.join(tmpDir, "aic.config.json");
    fs.writeFileSync(
      configPath,
      '{"contextBudget":{"maxTokens":10000},"contextSelector":{"heuristic":{"maxFiles":15}}}',
      "utf8",
    );
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    const result = loader.load(projectRoot, null);
    expect(result.config.contextBudget.maxTokens).toBe(toTokenCount(10000));
    expect(result.config.heuristic.maxFiles).toBe(15);
    expect(result.rawJson).toBeDefined();
    expect(result.rawJson).toContain("10000");
  });

  it("load_invalid_json_throws_config_error", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    fs.writeFileSync(path.join(tmpDir, "aic.config.json"), "{ invalid", "utf8");
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    expect(() => loader.load(projectRoot, null)).toThrow(ConfigError);
  });

  it("load_invalid_schema_throws_config_error", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    fs.writeFileSync(
      path.join(tmpDir, "aic.config.json"),
      '{"contextBudget":{"maxTokens":"not a number"}}',
      "utf8",
    );
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    expect(() => loader.load(projectRoot, null)).toThrow(ConfigError);
  });

  it("load_explicit_config_path_uses_that_file", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    const subdir = path.join(tmpDir, "subdir");
    fs.mkdirSync(subdir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "aic.config.json"),
      '{"contextBudget":{"maxTokens":5000}}',
      "utf8",
    );
    fs.writeFileSync(
      path.join(subdir, "aic.config.json"),
      '{"contextBudget":{"maxTokens":12000},"contextSelector":{"heuristic":{"maxFiles":25}}}',
      "utf8",
    );
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    const result = loader.load(
      projectRoot,
      toFilePath(path.join("subdir", "aic.config.json")),
    );
    expect(result.config.contextBudget.maxTokens).toBe(toTokenCount(12000));
    expect(result.config.heuristic.maxFiles).toBe(25);
  });
});
