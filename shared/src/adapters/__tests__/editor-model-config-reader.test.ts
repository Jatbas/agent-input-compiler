// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { afterEach, describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { EditorModelConfigReaderAdapter } from "../editor-model-config-reader.js";
import { EDITOR_ID } from "@jatbas/aic-core/core/types/enums.js";

describe("EditorModelConfigReaderAdapter", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir !== undefined && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("editor_config_returns_model_for_cursor", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-editor-config-"));
    const cursorDir = path.join(tempDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(path.join(cursorDir, "settings.json"), '{"model":"gpt-4o"}', "utf8");
    const adapter = new EditorModelConfigReaderAdapter(tempDir);
    expect(adapter.read(EDITOR_ID.CURSOR)).toBe("gpt-4o");
  });

  it("editor_config_returns_model_for_claude_code", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-editor-config-"));
    const claudeDir = path.join(tempDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      '{"model":"claude-sonnet-4"}',
      "utf8",
    );
    const adapter = new EditorModelConfigReaderAdapter(tempDir);
    expect(adapter.read(EDITOR_ID.CLAUDE_CODE)).toBe("claude-sonnet-4");
  });

  it("editor_config_returns_null_for_generic", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-editor-config-"));
    const adapter = new EditorModelConfigReaderAdapter(tempDir);
    expect(adapter.read(EDITOR_ID.GENERIC)).toBeNull();
  });

  it("missing_file_returns_null", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-editor-config-"));
    const adapter = new EditorModelConfigReaderAdapter(tempDir);
    expect(adapter.read(EDITOR_ID.CURSOR)).toBeNull();
  });

  it("malformed_json_returns_null", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-editor-config-"));
    const cursorDir = path.join(tempDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(path.join(cursorDir, "settings.json"), "not json {", "utf8");
    const adapter = new EditorModelConfigReaderAdapter(tempDir);
    expect(adapter.read(EDITOR_ID.CURSOR)).toBeNull();
  });

  it("missing_model_key_returns_null", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-editor-config-"));
    const cursorDir = path.join(tempDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(path.join(cursorDir, "settings.json"), "{}", "utf8");
    const adapter = new EditorModelConfigReaderAdapter(tempDir);
    expect(adapter.read(EDITOR_ID.CURSOR)).toBeNull();
  });
});
