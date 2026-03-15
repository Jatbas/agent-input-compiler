// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { detectEditorId } from "../detect-editor-id.js";
import { EDITOR_ID } from "@jatbas/aic-core/core/types/enums.js";

describe("detectEditorId", () => {
  it("returns cursor for Cursor client name", () => {
    expect(detectEditorId("Cursor")).toBe(EDITOR_ID.CURSOR);
  });

  it("returns cursor for lowercase cursor", () => {
    expect(detectEditorId("cursor")).toBe(EDITOR_ID.CURSOR);
  });

  it("returns cursor for cursor with version suffix", () => {
    expect(detectEditorId("Cursor 0.44.11")).toBe(EDITOR_ID.CURSOR);
  });

  it("returns cursor for cursor-vscode MCP client name", () => {
    expect(detectEditorId("cursor-vscode")).toBe(EDITOR_ID.CURSOR);
  });

  it("returns claude-code for claude-code client name", () => {
    expect(detectEditorId("claude-code")).toBe(EDITOR_ID.CLAUDE_CODE);
  });

  it("returns claude-code for Claude Code with space", () => {
    expect(detectEditorId("Claude Code")).toBe(EDITOR_ID.CLAUDE_CODE);
  });

  it("returns claude-code for claude-code with version", () => {
    expect(detectEditorId("claude-code/1.0.0")).toBe(EDITOR_ID.CLAUDE_CODE);
  });

  it("returns generic for bare claude model name", () => {
    expect(detectEditorId("claude")).toBe(EDITOR_ID.GENERIC);
  });

  it("returns generic for claude model identifier", () => {
    expect(detectEditorId("claude-sonnet-4-20250514")).toBe(EDITOR_ID.GENERIC);
  });

  it("returns generic for Claude with capital C only", () => {
    expect(detectEditorId("Claude")).toBe(EDITOR_ID.GENERIC);
  });

  it("returns generic for undefined client name", () => {
    expect(detectEditorId(undefined)).toBe(EDITOR_ID.GENERIC);
  });

  it("returns generic for unknown editor name", () => {
    expect(detectEditorId("vscode")).toBe(EDITOR_ID.GENERIC);
  });

  it("returns generic for empty string", () => {
    expect(detectEditorId("")).toBe(EDITOR_ID.GENERIC);
  });

  it("returns cursor when client name is undefined but cursorAgent env hint is true", () => {
    expect(detectEditorId(undefined, { cursorAgent: true })).toBe(EDITOR_ID.CURSOR);
  });

  it("returns cursor when client name is empty but cursorAgent env hint is true", () => {
    expect(detectEditorId("", { cursorAgent: true })).toBe(EDITOR_ID.CURSOR);
  });

  it("returns generic when client name is undefined and cursorAgent is false", () => {
    expect(detectEditorId(undefined, { cursorAgent: false })).toBe(EDITOR_ID.GENERIC);
  });

  it("returns cursor for claude-code client when cursorAgent true", () => {
    expect(detectEditorId("claude-code", { cursorAgent: true })).toBe(EDITOR_ID.CURSOR);
  });

  it("returns cursor for claude-code/version when cursorAgent true", () => {
    expect(detectEditorId("claude-code/1.0.0", { cursorAgent: true })).toBe(
      EDITOR_ID.CURSOR,
    );
  });

  it("returns claude-code when client name undefined and claudeCodeProjectDir true", () => {
    expect(detectEditorId(undefined, { claudeCodeProjectDir: true })).toBe(
      EDITOR_ID.CLAUDE_CODE,
    );
  });

  it("returns claude-code when client name vscode and claudeCodeProjectDir true", () => {
    expect(detectEditorId("vscode", { claudeCodeProjectDir: true })).toBe(
      EDITOR_ID.CLAUDE_CODE,
    );
  });

  it("returns cursor when both cursorAgent and claudeCodeProjectDir true", () => {
    expect(
      detectEditorId(undefined, {
        cursorAgent: true,
        claudeCodeProjectDir: true,
      }),
    ).toBe(EDITOR_ID.CURSOR);
  });

  it("cursorProjectDir_true_claude_code_returns_cursor", () => {
    expect(detectEditorId("claude-code", { cursorProjectDir: true })).toBe(
      EDITOR_ID.CURSOR,
    );
  });

  it("cursorProjectDir_false_claude_code_returns_claude_code", () => {
    expect(detectEditorId("claude-code", { cursorProjectDir: false })).toBe(
      EDITOR_ID.CLAUDE_CODE,
    );
  });
});
