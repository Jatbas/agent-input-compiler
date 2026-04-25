// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { buildTelemetryEvent } from "../build-telemetry-event.js";
import type { CompilationMeta } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { GuardResult } from "@jatbas/aic-core/core/types/guard-types.js";
import {
  toUUIDv7,
  toISOTimestamp,
  toRepoId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toTokenCount, toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import {
  EDITOR_ID,
  INCLUSION_TIER,
  TASK_CLASS,
} from "@jatbas/aic-core/core/types/enums.js";
import { toRatio01, toConfidence } from "@jatbas/aic-core/core/types/scores.js";
import { GUARD_FINDING_TYPE, GUARD_SEVERITY } from "@jatbas/aic-core/core/types/enums.js";

function metaOverrides(overrides: Partial<CompilationMeta>): CompilationMeta {
  return {
    intent: "",
    taskClass: TASK_CLASS.GENERAL,
    filesSelected: 0,
    filesTotal: 0,
    tokensRaw: toTokenCount(0),
    tokensCompiled: toTokenCount(0),
    tokenReductionPct: toRatio01(0),
    cacheHit: false,
    durationMs: toMilliseconds(0),
    modelId: "",
    editorId: EDITOR_ID.GENERIC,
    transformTokensSaved: toTokenCount(0),
    summarisationTiers: {
      [INCLUSION_TIER.L0]: 0,
      [INCLUSION_TIER.L1]: 0,
      [INCLUSION_TIER.L2]: 0,
      [INCLUSION_TIER.L3]: 0,
    },
    guard: null,
    contextCompleteness: toConfidence(1),
    classifierConfidence: toConfidence(1),
    totalBudget: toTokenCount(0),
    ...overrides,
  };
}

describe("buildTelemetryEvent", () => {
  it("buildTelemetryEvent guard null", () => {
    const meta = metaOverrides({ guard: null });
    const event = buildTelemetryEvent(
      meta,
      toUUIDv7("00000000-0000-7000-8000-000000000000"),
      toUUIDv7("00000000-0000-7000-8000-000000000099"),
      toISOTimestamp("2026-01-01T00:00:00.000Z"),
      toRepoId("abc123"),
    );
    expect(event.guardBlockedCount).toBe(0);
    expect(event.guardFindingsCount).toBe(0);
    expect(event.compilationId).toBe("00000000-0000-7000-8000-000000000099");
  });

  it("buildTelemetryEvent guard with counts", () => {
    const guard: GuardResult = {
      passed: false,
      findings: [
        {
          severity: GUARD_SEVERITY.BLOCK,
          type: GUARD_FINDING_TYPE.SECRET,
          file: toRelativePath("src/secret.ts"),
          message: "secret",
        },
      ],
      filesBlocked: [toRelativePath("src/secret.ts"), toRelativePath("src/keys.ts")],
      filesRedacted: [],
      filesWarned: [],
    };
    const meta = metaOverrides({ guard });
    const event = buildTelemetryEvent(
      meta,
      toUUIDv7("00000000-0000-7000-8000-000000000001"),
      toUUIDv7("00000000-0000-7000-8000-000000000098"),
      toISOTimestamp("2026-01-01T00:00:00.000Z"),
      toRepoId("def456"),
    );
    expect(event.guardBlockedCount).toBe(2);
    expect(event.guardFindingsCount).toBe(1);
  });

  it("buildTelemetryEvent transformSavings", () => {
    const meta = metaOverrides({ transformTokensSaved: toTokenCount(42) });
    const event = buildTelemetryEvent(
      meta,
      toUUIDv7("00000000-0000-7000-8000-000000000002"),
      toUUIDv7("00000000-0000-7000-8000-000000000097"),
      toISOTimestamp("2026-01-01T00:00:00.000Z"),
      toRepoId("ghi789"),
    );
    expect(event.transformSavings).toBe(42);
  });
});
