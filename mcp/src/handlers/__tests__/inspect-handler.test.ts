// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import { handleInspect } from "../inspect-handler.js";
import type { InspectRunner } from "@jatbas/aic-core/core/interfaces/inspect-runner.interface.js";
import type { ToolInvocationLogStore } from "@jatbas/aic-core/core/interfaces/tool-invocation-log-store.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { PipelineTrace } from "@jatbas/aic-core/core/types/inspect-types.js";
import {
  type SessionId,
  toSessionId,
  toISOTimestamp,
  toUUIDv7,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds, toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import {
  toPercentage,
  toConfidence,
  toRelevanceScore,
} from "@jatbas/aic-core/core/types/scores.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { INCLUSION_TIER, TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";

const stubTrace: PipelineTrace = {
  intent: "test intent",
  taskClass: {
    taskClass: TASK_CLASS.GENERAL,
    confidence: toConfidence(0.5),
    matchedKeywords: [],
    subjectTokens: [],
  },
  rulePacks: [],
  budget: toTokenCount(8000),
  selectedFiles: [
    {
      path: toRelativePath("src/index.ts"),
      language: "typescript",
      estimatedTokens: toTokenCount(120),
      relevanceScore: toRelevanceScore(0.9),
      tier: INCLUSION_TIER.L0,
      resolvedContent: "const x = 1;\n",
    },
    {
      path: toRelativePath("src/util.ts"),
      language: "typescript",
      estimatedTokens: toTokenCount(80),
      relevanceScore: toRelevanceScore(0.7),
      tier: INCLUSION_TIER.L1,
      resolvedContent: "export function foo() {}",
    },
  ],
  guard: null,
  transforms: [],
  summarisationTiers: {
    [INCLUSION_TIER.L0]: 0,
    [INCLUSION_TIER.L1]: 0,
    [INCLUSION_TIER.L2]: 0,
    [INCLUSION_TIER.L3]: 0,
  },
  constraints: [],
  tokenSummary: {
    raw: toTokenCount(200),
    selected: toTokenCount(200),
    afterGuard: toTokenCount(200),
    afterTransforms: toTokenCount(200),
    afterLadder: toTokenCount(200),
    afterPrune: toTokenCount(200),
    promptTotal: toTokenCount(200),
    reductionPct: toPercentage(0),
  },
  compiledAt: toISOTimestamp("2025-01-01T00:00:00.000Z"),
};

function makeInspectRunner(trace: PipelineTrace): InspectRunner {
  return { inspect: async () => trace };
}

const stubLogStore: ToolInvocationLogStore = { record: () => undefined };
const stubClock: Clock = {
  now: () => toISOTimestamp("2025-01-01T00:00:00.000Z"),
  addMinutes: () => toISOTimestamp("2025-01-01T00:00:00.000Z"),
  durationMs: () => toMilliseconds(0),
};
const stubIdGen: IdGenerator = {
  generate: () => toUUIDv7("018f0000-0000-7000-8000-000000000001"),
};
const getSessionId = (): SessionId => toSessionId("018f0000-0000-7000-8000-000000000002");

const args = {
  intent: "test intent",
  projectRoot: path.join(os.homedir(), "aic-inspect-handler-test-project"),
};

describe("handleInspect", () => {
  it("inspect_handler_strips_resolved_content_from_all_selected_files", async () => {
    const result = await handleInspect(
      args,
      makeInspectRunner(stubTrace),
      stubLogStore,
      stubClock,
      stubIdGen,
      getSessionId,
    );
    const block = result.content[0];
    if (block === undefined || block.type !== "text") {
      expect.fail("expected text content block");
    }
    const parsed = JSON.parse(block.text) as {
      trace: { selectedFiles: Array<Record<string, unknown>> };
    };
    for (const file of parsed.trace.selectedFiles) {
      expect(Object.prototype.hasOwnProperty.call(file, "resolvedContent")).toBe(false);
    }
  });

  it("inspect_handler_preserves_other_selected_file_fields", async () => {
    const result = await handleInspect(
      args,
      makeInspectRunner(stubTrace),
      stubLogStore,
      stubClock,
      stubIdGen,
      getSessionId,
    );
    const block = result.content[0];
    if (block === undefined || block.type !== "text") {
      expect.fail("expected text content block");
    }
    const parsed = JSON.parse(block.text) as {
      trace: { selectedFiles: Array<Record<string, unknown>> };
    };
    const first = parsed.trace.selectedFiles[0];
    if (first === undefined) {
      expect.fail("expected at least one selected file");
    }
    expect(first["path"]).toBe("src/index.ts");
    expect(first["language"]).toBe("typescript");
    expect(typeof first["estimatedTokens"]).toBe("number");
    expect(typeof first["relevanceScore"]).toBe("number");
    expect(first["tier"]).toBe(INCLUSION_TIER.L0);
  });
});
