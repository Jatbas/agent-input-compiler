// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { ModelDetectorDispatch } from "../model-detector-dispatch.js";
import { EDITOR_ID } from "@jatbas/aic-core/core/types/enums.js";

describe("ModelDetectorDispatch", () => {
  it("returns anthropicModel for claude-code editor", () => {
    const detector = new ModelDetectorDispatch({
      anthropicModel: "claude-sonnet-4-20250514",
    });
    expect(detector.detect(EDITOR_ID.CLAUDE_CODE)).toBe("claude-sonnet-4-20250514");
  });

  it("returns null for claude-code when anthropicModel is absent", () => {
    const detector = new ModelDetectorDispatch({});
    expect(detector.detect(EDITOR_ID.CLAUDE_CODE)).toBeNull();
  });

  it("returns cursorModel for cursor editor", () => {
    const detector = new ModelDetectorDispatch({
      cursorModel: "gpt-4o",
    });
    expect(detector.detect(EDITOR_ID.CURSOR)).toBe("gpt-4o");
  });

  it("returns null for cursor when cursorModel is absent", () => {
    const detector = new ModelDetectorDispatch({});
    expect(detector.detect(EDITOR_ID.CURSOR)).toBeNull();
  });

  it("returns null for generic editor regardless of hints", () => {
    const detector = new ModelDetectorDispatch({
      anthropicModel: "claude-sonnet-4-20250514",
      cursorModel: "gpt-4o",
    });
    expect(detector.detect(EDITOR_ID.GENERIC)).toBeNull();
  });

  it("returns null when no hints provided", () => {
    const detector = new ModelDetectorDispatch({});
    expect(detector.detect(EDITOR_ID.CURSOR)).toBeNull();
    expect(detector.detect(EDITOR_ID.CLAUDE_CODE)).toBeNull();
    expect(detector.detect(EDITOR_ID.GENERIC)).toBeNull();
  });

  it("does not cross-pollinate hints between editors", () => {
    const detector = new ModelDetectorDispatch({
      anthropicModel: "claude-sonnet-4-20250514",
    });
    expect(detector.detect(EDITOR_ID.CURSOR)).toBeNull();
  });
});
