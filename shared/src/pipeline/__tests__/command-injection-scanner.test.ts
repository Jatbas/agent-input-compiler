// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { CommandInjectionScanner } from "@jatbas/aic-shared/pipeline/command-injection-scanner.js";
import { GUARD_FINDING_TYPE } from "@jatbas/aic-shared/core/types/enums.js";
import type { SelectedFile } from "@jatbas/aic-shared/core/types/selected-file.js";
import { toRelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import { toTokenCount } from "@jatbas/aic-shared/core/types/units.js";
import { toRelevanceScore } from "@jatbas/aic-shared/core/types/scores.js";
import { INCLUSION_TIER } from "@jatbas/aic-shared/core/types/enums.js";

function makeSelectedFile(path: string): SelectedFile {
  return {
    path: toRelativePath(path),
    language: "typescript",
    estimatedTokens: toTokenCount(100),
    relevanceScore: toRelevanceScore(0.5),
    tier: INCLUSION_TIER.L0,
  };
}

describe("CommandInjectionScanner", () => {
  const scanner = new CommandInjectionScanner();
  const mockFile = makeSelectedFile("src/foo.ts");

  it("detects_dollar_paren_substitution", () => {
    const content = "run $(whoami) here";
    const findings = scanner.scan(mockFile, content);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.type).toBe(GUARD_FINDING_TYPE.COMMAND_INJECTION);
    expect(findings[0]?.message.startsWith("Command injection pattern:")).toBe(true);
  });

  it("detects_backtick_substitution", () => {
    const content = "run `id` here";
    const findings = scanner.scan(mockFile, content);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("detects_pipe_chain", () => {
    const content = "a | b";
    const findings = scanner.scan(mockFile, content);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it("clean_content_returns_empty", () => {
    const content = "const x = 1;";
    const findings = scanner.scan(mockFile, content);
    expect(findings).toEqual([]);
  });

  it("finding_includes_file_and_line", () => {
    const content = "$(echo)";
    const findings = scanner.scan(mockFile, content);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.file).toBe(mockFile.path);
    expect(findings[0]?.line).toBeDefined();
  });
});
