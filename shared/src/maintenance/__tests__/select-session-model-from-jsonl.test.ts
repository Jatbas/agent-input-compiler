// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import {
  reduceSessionModelJsonlState,
  selectSessionModelIdFromJsonlContent,
} from "../select-session-model-from-jsonl.js";

const cursor = "cursor";
const line = (m: string, c: string, e: string): string => JSON.stringify({ m, c, e });

describe("selectSessionModelIdFromJsonlContent", () => {
  it("returns null for empty raw", () => {
    expect(selectSessionModelIdFromJsonlContent("", null, cursor)).toBeNull();
    expect(selectSessionModelIdFromJsonlContent("\n\n", null, cursor)).toBeNull();
  });

  it("returns null when no line matches editorId", () => {
    const raw = `${line("a", "", "claude")}\n`;
    expect(selectSessionModelIdFromJsonlContent(raw, null, cursor)).toBeNull();
  });

  it("uses last valid line per editor when conversation id is empty", () => {
    const raw = `${line("first", "c1", cursor)}\n${line("second", "c2", cursor)}\n`;
    expect(selectSessionModelIdFromJsonlContent(raw, null, cursor)).toBe("second");
    expect(selectSessionModelIdFromJsonlContent(raw, "", cursor)).toBe("second");
  });

  it("prefers last line with matching conversation id over later lines with other c", () => {
    const raw = [
      line("m1", "conv-a", cursor),
      line("m2", "conv-b", cursor),
      line("m3", "conv-a", cursor),
    ].join("\n");
    expect(selectSessionModelIdFromJsonlContent(raw, "conv-a", cursor)).toBe("m3");
  });

  it("falls back to last editor line when conversation id has no match", () => {
    const raw = `${line("fallback", "only-c", cursor)}\n`;
    expect(selectSessionModelIdFromJsonlContent(raw, "other", cursor)).toBe("fallback");
  });

  it("skips malformed JSON lines", () => {
    const raw = [`not-json`, line("ok", "", cursor)].join("\n");
    expect(selectSessionModelIdFromJsonlContent(raw, null, cursor)).toBe("ok");
  });

  it("skips lines that fail field validators", () => {
    const raw = [
      JSON.stringify({ m: "", c: "", e: cursor }),
      line("good", "", cursor),
    ].join("\n");
    expect(selectSessionModelIdFromJsonlContent(raw, null, cursor)).toBe("good");
  });

  it("skips entries with model id 'auto'", () => {
    const raw = [
      line("auto", "conv-a", cursor),
      line("claude-sonnet-4.6", "conv-a", cursor),
    ].join("\n");
    expect(selectSessionModelIdFromJsonlContent(raw, "conv-a", cursor)).toBe(
      "claude-sonnet-4.6",
    );
  });

  it("returns null when only 'auto' entries exist", () => {
    const raw = `${line("auto", "conv-a", cursor)}\n`;
    expect(selectSessionModelIdFromJsonlContent(raw, "conv-a", cursor)).toBeNull();
  });

  it("reduceSessionModelJsonlState aligns with selectSessionModelIdFromJsonlContent on multi-line fixture", () => {
    const raw = [
      line("m1", "conv-a", cursor),
      line("m2", "conv-b", cursor),
      line("m3", "conv-a", cursor),
    ].join("\n");
    const state = reduceSessionModelJsonlState(raw, "conv-a", cursor);
    expect(selectSessionModelIdFromJsonlContent(raw, "conv-a", cursor)).toBe(
      state.match ?? state.last,
    );
    expect(state.match).toBe("m3");
    expect(state.last).toBe("m3");
  });
});
