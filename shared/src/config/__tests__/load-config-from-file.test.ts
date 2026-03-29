// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ConfigStore } from "@jatbas/aic-core/core/interfaces/config-store.interface.js";
import type { StringHasher } from "@jatbas/aic-core/core/interfaces/string-hasher.interface.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toFilePath } from "@jatbas/aic-core/core/types/paths.js";
import { matchesGlob } from "@jatbas/aic-core/pipeline/glob-match.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";
import { LoadConfigFromFile, applyConfigResult } from "../load-config-from-file.js";

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
    expect(result.config.devMode).toBe(false);
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

  it("load_config_enabled_omitted_defaults_true", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    const resultNoFile = loader.load(projectRoot, null);
    expect(resultNoFile.config.enabled).toBe(true);
    fs.writeFileSync(
      path.join(tmpDir, "aic.config.json"),
      '{"contextBudget":{"maxTokens":5000}}',
      "utf8",
    );
    const resultOmitted = loader.load(projectRoot, null);
    expect(resultOmitted.config.enabled).toBe(true);
  });

  it("load_config_enabled_false", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    fs.writeFileSync(path.join(tmpDir, "aic.config.json"), '{"enabled": false}', "utf8");
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    const result = loader.load(projectRoot, null);
    expect(result.config.enabled).toBe(false);
  });

  it("load_config_enabled_true", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    fs.writeFileSync(path.join(tmpDir, "aic.config.json"), '{"enabled": true}', "utf8");
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    const result = loader.load(projectRoot, null);
    expect(result.config.enabled).toBe(true);
  });

  it("load_config_dev_mode_defaults_false", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    const missing = loader.load(projectRoot, null);
    expect(missing.config.devMode).toBe(false);
    fs.writeFileSync(
      path.join(tmpDir, "aic.config.json"),
      '{"contextBudget":{"maxTokens":7000}}',
      "utf8",
    );
    const omitted = loader.load(projectRoot, null);
    expect(omitted.config.devMode).toBe(false);
  });

  it("load_config_dev_mode_true", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    fs.writeFileSync(path.join(tmpDir, "aic.config.json"), '{"devMode": true}', "utf8");
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    const result = loader.load(projectRoot, null);
    expect(result.config.devMode).toBe(true);
  });

  it("load_config_dev_mode_invalid_type", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    fs.writeFileSync(path.join(tmpDir, "aic.config.json"), '{"devMode": "yes"}', "utf8");
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    expect(() => loader.load(projectRoot, null)).toThrow(ConfigError);
  });

  it("load_config_with_unimplemented_keys_ignores_extra_keys", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    fs.writeFileSync(
      path.join(tmpDir, "aic.config.json"),
      '{"contextBudget":{"maxTokens":6000},"rulePacks":["built-in:default"],"guard":{"enabled":false},"cache":{"ttlMinutes":30}}',
      "utf8",
    );
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    const result = loader.load(projectRoot, null);
    expect(result.config.contextBudget.maxTokens).toBe(toTokenCount(6000));
    // rulePacks, guard, cache are ignored; contextBudget is applied
  });

  it("load_config_guard_allow_patterns", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-config-test-"));
    fs.writeFileSync(
      path.join(tmpDir, "aic.config.json"),
      '{"guard":{"allowPatterns":["src/**","lib/**"]}}',
      "utf8",
    );
    const projectRoot = toAbsolutePath(tmpDir);
    const loader = new LoadConfigFromFile();
    const result = loader.load(projectRoot, null);
    const mockStore: ConfigStore = {
      getLatestHash: () => null,
      writeSnapshot: () => {},
    };
    const mockHasher: StringHasher = { hash: () => "h" };
    const applied = applyConfigResult(result, mockStore, mockHasher);
    expect(applied.guardAllowPatterns.length).toBe(2);
    expect(matchesGlob("src/foo.ts", applied.guardAllowPatterns[0] ?? "")).toBe(true);
    expect(matchesGlob("lib/bar.ts", applied.guardAllowPatterns[1] ?? "")).toBe(true);
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
