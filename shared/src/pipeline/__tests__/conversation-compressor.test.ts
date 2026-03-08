// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { ConversationCompressorImpl } from "../conversation-compressor.js";
import type { SessionStep } from "#core/types/session-dedup-types.js";
import { toStepIndex, toTokenCount } from "#core/types/units.js";
import { toRelativePath } from "#core/types/paths.js";
import { toISOTimestamp } from "#core/types/identifiers.js";

function makeStep(overrides: Partial<SessionStep> = {}): SessionStep {
  return {
    stepIndex: toStepIndex(0),
    stepIntent: null,
    filesSelected: [],
    tiers: {},
    tokensCompiled: toTokenCount(0),
    toolOutputs: [],
    completedAt: toISOTimestamp("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("ConversationCompressorImpl", () => {
  it("conversation_compressor_empty_returns_empty_string", () => {
    const compressor = new ConversationCompressorImpl();
    const result = compressor.compress([]);
    expect(result).toBe("");
  });

  it("conversation_compressor_one_step_formats_line", () => {
    const compressor = new ConversationCompressorImpl();
    const step = makeStep({
      stepIntent: "refactor auth",
      filesSelected: [toRelativePath("a.ts"), toRelativePath("b.ts")],
      tokensCompiled: toTokenCount(100),
    });
    const result = compressor.compress([step]);
    expect(result).toContain("Steps completed:");
    expect(result).toContain("1)");
    expect(result).toContain("refactor auth");
    expect(result).toContain("2 files");
    expect(result).toContain("100 tokens");
  });

  it("conversation_compressor_multiple_steps_ordered", () => {
    const compressor = new ConversationCompressorImpl();
    const step1 = makeStep({ stepIntent: "first task" });
    const step2 = makeStep({ stepIntent: "second task" });
    const result = compressor.compress([step1, step2]);
    expect(result).toContain("1) first task");
    expect(result).toContain("2) second task");
    const idx1 = result.indexOf("1) first task");
    const idx2 = result.indexOf("2) second task");
    expect(idx2).toBeGreaterThan(idx1);
  });

  it("conversation_compressor_step_intent_fallback", () => {
    const compressor = new ConversationCompressorImpl();
    const step = makeStep({ stepIntent: null });
    const result = compressor.compress([step]);
    expect(result).toContain("Step 1");
  });

  it("conversation_compressor_no_mutation", () => {
    const compressor = new ConversationCompressorImpl();
    const steps: readonly SessionStep[] = [makeStep({ stepIntent: "fix bug" })];
    const a = compressor.compress(steps);
    const b = compressor.compress(steps);
    expect(a).toBe(b);
  });
});
