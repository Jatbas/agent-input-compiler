// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { PromptAssembler } from "../prompt-assembler.js";
import type { FileContentReader } from "@jatbas/aic-core/core/interfaces/file-content-reader.interface.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount, toStepIndex } from "@jatbas/aic-core/core/types/units.js";
import { toConfidence } from "@jatbas/aic-core/core/types/scores.js";
import { toRelevanceScore } from "@jatbas/aic-core/core/types/scores.js";
import { TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";

function makeFile(path: string): SelectedFile {
  return {
    path: toRelativePath(path),
    language: "ts",
    estimatedTokens: toTokenCount(50),
    relevanceScore: toRelevanceScore(0.5),
    tier: INCLUSION_TIER.L0,
  };
}

describe("PromptAssembler", () => {
  const task: TaskClassification = {
    taskClass: TASK_CLASS.FEATURE,
    confidence: toConfidence(0.9),
    matchedKeywords: ["add", "feature"],
    subjectTokens: [],
  };

  it("renders template correctly", async () => {
    const reader: FileContentReader = {
      getContent: (path) => Promise.resolve(`content of ${path as string}`),
    };
    const assembler = new PromptAssembler(reader);
    const result = await assembler.assemble(
      task,
      [makeFile("src/a.ts")],
      ["use TypeScript"],
    );
    expect(result).toContain("## Task");
    expect(result).toContain("add feature");
    expect(result).toContain("## Task Classification");
    expect(result).toContain("Type: feature (confidence: 0.9)");
    expect(result).toContain("## Context");
    expect(result).toContain("### src/a.ts [Tier: L0]");
    expect(result).toContain("content of src/a.ts");
    expect(result).toContain("## Constraints");
    expect(result).toContain("- use TypeScript");
    expect(result).not.toContain("## Output Format");
  });

  it("omits constraints section when empty", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const assembler = new PromptAssembler(reader);
    const result = await assembler.assemble(task, [makeFile("x.ts")], []);
    expect(result).not.toContain("## Constraints");
    expect(result).not.toContain("## Output Format");
  });

  it("renders multiple files in order", async () => {
    const reader: FileContentReader = {
      getContent: (path) => Promise.resolve(path as string),
    };
    const assembler = new PromptAssembler(reader);
    const result = await assembler.assemble(
      task,
      [makeFile("first.ts"), makeFile("second.ts")],
      [],
    );
    const firstIdx = result.indexOf("### first.ts");
    const secondIdx = result.indexOf("### second.ts");
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });

  it("prompt_assembler_previously_shown_emits_placeholder", async () => {
    const getContentCalls: string[] = [];
    const reader: FileContentReader = {
      getContent: (path) => {
        getContentCalls.push(path as string);
        return Promise.resolve("content");
      },
    };
    const assembler = new PromptAssembler(reader);
    const fileWithPrevious = {
      ...makeFile("src/seen.ts"),
      previouslyShownAtStep: toStepIndex(2),
    };
    const result = await assembler.assemble(task, [fileWithPrevious], []);
    expect(result).toContain("Previously shown in step 2");
    expect(getContentCalls).not.toContain("src/seen.ts");
  });

  it("prompt_assembler_spec_section_emitted", async () => {
    const reader: FileContentReader = {
      getContent: (path) =>
        Promise.resolve(
          (path as string).startsWith("documentation/")
            ? "spec content here"
            : "code content here",
        ),
    };
    const assembler = new PromptAssembler(reader);
    const codeFile = makeFile("src/a.ts");
    const specFile = {
      ...makeFile("documentation/readme.md"),
      path: toRelativePath("documentation/readme.md"),
    };
    const result = await assembler.assemble(task, [codeFile], [], [specFile]);
    expect(result).toContain("## Specification");
    expect(result).toContain("### documentation/readme.md");
    expect(result).toContain("spec content here");
    expect(result).toContain("## Context");
    const specIdx = result.indexOf("## Specification");
    const contextIdx = result.indexOf("## Context");
    expect(contextIdx).toBeGreaterThan(specIdx);
    expect(result).toContain("code content here");
  });

  it("prompt_assembler_no_spec_when_empty", async () => {
    const reader: FileContentReader = { getContent: () => Promise.resolve("") };
    const assembler = new PromptAssembler(reader);
    const resultOmitted = await assembler.assemble(task, [makeFile("x.ts")], []);
    expect(resultOmitted).not.toContain("## Specification");
    expect(resultOmitted).toContain("## Task");
    expect(resultOmitted).toContain("## Task Classification");
    expect(resultOmitted).toContain("## Context");
    expect(resultOmitted).not.toContain("## Output Format");
    const resultEmpty = await assembler.assemble(task, [makeFile("x.ts")], [], []);
    expect(resultEmpty).not.toContain("## Specification");
  });

  it("prompt_assembler_spec_getContent_called", async () => {
    const getContentCalls: string[] = [];
    const reader: FileContentReader = {
      getContent: (path) => {
        getContentCalls.push(path as string);
        return Promise.resolve("spec body");
      },
    };
    const assembler = new PromptAssembler(reader);
    const specFile = {
      ...makeFile("documentation/plan.md"),
      path: toRelativePath("documentation/plan.md"),
    };
    await assembler.assemble(task, [], [], [specFile]);
    expect(getContentCalls).toContain("documentation/plan.md");
  });

  it("prompt_assembler_session_context_section_emitted", async () => {
    const reader: FileContentReader = { getContent: () => Promise.resolve("") };
    const assembler = new PromptAssembler(reader);
    const result = await assembler.assemble(
      task,
      [],
      [],
      undefined,
      "Steps completed:\n1) Done.",
    );
    expect(result).toContain("## Session context");
    expect(result).toContain("1) Done.");
  });

  it("prompt_assembler_session_context_omitted_when_empty", async () => {
    const reader: FileContentReader = { getContent: () => Promise.resolve("") };
    const assembler = new PromptAssembler(reader);
    const resultEmpty = await assembler.assemble(task, [], [], undefined, "");
    const resultUndefined = await assembler.assemble(task, [], []);
    expect(resultEmpty).not.toContain("## Session context");
    expect(resultUndefined).not.toContain("## Session context");
  });

  it("assemble_includes_project_structure_when_provided", async () => {
    const reader: FileContentReader = { getContent: () => Promise.resolve("") };
    const assembler = new PromptAssembler(reader);
    const result = await assembler.assemble(
      task,
      [],
      [],
      undefined,
      undefined,
      "src/ (2 files)",
    );
    expect(result).toContain("## Project structure");
    expect(result).toContain("src/ (2 files)");
    const contextIdx = result.indexOf("## Context");
    const structureIdx = result.indexOf("## Project structure");
    expect(structureIdx).toBeGreaterThanOrEqual(0);
    expect(contextIdx).toBeGreaterThan(structureIdx);
  });

  it("assemble_omits_project_structure_when_empty", async () => {
    const reader: FileContentReader = { getContent: () => Promise.resolve("") };
    const assembler = new PromptAssembler(reader);
    const resultNoArg = await assembler.assemble(task, [], []);
    const resultEmpty = await assembler.assemble(task, [], [], undefined, undefined, "");
    expect(resultNoArg).not.toContain("## Project structure");
    expect(resultEmpty).not.toContain("## Project structure");
  });

  it("assembler_uses_resolvedContent_when_present", async () => {
    const getContentCalls: string[] = [];
    const reader: FileContentReader = {
      getContent: (path) => {
        getContentCalls.push(path as string);
        return Promise.resolve("raw content");
      },
    };
    const assembler = new PromptAssembler(reader);
    const fileWithResolved = {
      ...makeFile("src/resolved.ts"),
      resolvedContent: "resolved text",
    };
    const result = await assembler.assemble(task, [fileWithResolved], []);
    expect(result).toContain("resolved text");
    expect(result).toContain("### src/resolved.ts");
    expect(getContentCalls).not.toContain("src/resolved.ts");
  });

  it("prompt_assembler_constraints_preamble_emitted", async () => {
    const reader: FileContentReader = {
      getContent: (path) => Promise.resolve(`content of ${path as string}`),
    };
    const assembler = new PromptAssembler(reader);
    const result = await assembler.assemble(task, [makeFile("a.ts")], ["C1", "C2", "C3"]);
    expect(result).toContain("## Constraints (key)");
    expect(result).toContain("- C1");
    expect(result).toContain("- C2");
    expect(result).toContain("- C3");
    const preambleIdx = result.indexOf("## Constraints (key)");
    const contextIdx = result.indexOf("## Context");
    expect(contextIdx).toBeGreaterThan(preambleIdx);
  });

  it("prompt_assembler_constraints_preamble_top_three_only", async () => {
    const reader: FileContentReader = { getContent: () => Promise.resolve("") };
    const assembler = new PromptAssembler(reader);
    const result = await assembler.assemble(task, [], ["A", "B", "C", "D", "E"]);
    const preambleEnd = result.indexOf("## Context");
    const preamble = result.slice(0, preambleEnd);
    expect(result).toContain("## Constraints (key)");
    expect(preamble).toContain("- A");
    expect(preamble).toContain("- B");
    expect(preamble).toContain("- C");
    expect(result).toContain("## Constraints");
    expect(result).toContain("- A");
    expect(result).toContain("- B");
    expect(result).toContain("- C");
    expect(result).toContain("- D");
    expect(result).toContain("- E");
  });

  it("prompt_assembler_constraints_preamble_omitted_when_empty", async () => {
    const reader: FileContentReader = { getContent: () => Promise.resolve("") };
    const assembler = new PromptAssembler(reader);
    const result = await assembler.assemble(task, [], []);
    expect(result).not.toContain("## Constraints (key)");
  });

  it("prompt_assembler_constraints_preamble_one_or_two", async () => {
    const reader: FileContentReader = { getContent: () => Promise.resolve("") };
    const assembler = new PromptAssembler(reader);
    const resultOne = await assembler.assemble(task, [], ["Only one"]);
    const preambleOneEnd = resultOne.indexOf("## Context");
    const preambleOne = resultOne.slice(0, preambleOneEnd);
    expect(resultOne).toContain("## Constraints (key)");
    expect(preambleOne).toContain("- Only one");
    const bulletCountOne = (preambleOne.match(/^- /gm) ?? []).length;
    expect(bulletCountOne).toBe(1);

    const resultTwo = await assembler.assemble(task, [], ["First", "Second"]);
    const preambleTwoEnd = resultTwo.indexOf("## Context");
    const preambleTwo = resultTwo.slice(0, preambleTwoEnd);
    expect(preambleTwo).toContain("- First");
    expect(preambleTwo).toContain("- Second");
    const bulletCountTwo = (preambleTwo.match(/^- /gm) ?? []).length;
    expect(bulletCountTwo).toBe(2);
  });

  it("prompt_assembler_never_emits_output_format_section", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve("file content"),
    };
    const assembler = new PromptAssembler(reader);
    const result = await assembler.assemble(
      task,
      [makeFile("src/a.ts")],
      ["use TypeScript"],
    );
    expect(result).not.toContain("## Output Format");
    expect(result).not.toContain("unified diff");
    expect(result).not.toContain("Do not include any text outside");
    expect(result).not.toContain("full-file");
    expect(result).not.toContain("Respond in Markdown");
    expect(result).not.toContain("valid JSON object");
    expect(result).not.toContain("plain text");
  });
});
