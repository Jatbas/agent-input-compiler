import { describe, it, expect } from "vitest";
import { PromptAssembler } from "../prompt-assembler.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import { toRelativePath } from "#core/types/paths.js";
import { toTokenCount, toStepIndex } from "#core/types/units.js";
import { toConfidence } from "#core/types/scores.js";
import { toRelevanceScore } from "#core/types/scores.js";
import { TASK_CLASS, OUTPUT_FORMAT, type OutputFormat } from "#core/types/enums.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

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
  };

  it("renders template correctly for unified-diff format", async () => {
    const reader: FileContentReader = {
      getContent: (path) => Promise.resolve(`content of ${path as string}`),
    };
    const assembler = new PromptAssembler(reader);
    const result = await assembler.assemble(
      task,
      [makeFile("src/a.ts")],
      ["use TypeScript"],
      OUTPUT_FORMAT.UNIFIED_DIFF,
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
    expect(result).toContain("## Output Format");
    expect(result).toContain("unified diff");
  });

  it("omits constraints section when empty", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const assembler = new PromptAssembler(reader);
    const result = await assembler.assemble(
      task,
      [makeFile("x.ts")],
      [],
      OUTPUT_FORMAT.PLAIN,
    );
    expect(result).not.toContain("## Constraints");
    expect(result).toContain("## Output Format");
  });

  it("uses correct description for each output format", async () => {
    const reader: FileContentReader = {
      getContent: () => Promise.resolve(""),
    };
    const assembler = new PromptAssembler(reader);
    const formats: OutputFormat[] = [
      OUTPUT_FORMAT.UNIFIED_DIFF,
      OUTPUT_FORMAT.FULL_FILE,
      OUTPUT_FORMAT.MARKDOWN,
      OUTPUT_FORMAT.JSON,
      OUTPUT_FORMAT.PLAIN,
    ];
    for (const format of formats) {
      const result = await assembler.assemble(task, [], [], format);
      expect(result).toContain("## Output Format");
      if (format === OUTPUT_FORMAT.JSON) expect(result).toContain("valid JSON");
      if (format === OUTPUT_FORMAT.PLAIN) expect(result).toContain("plain text");
    }
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
      OUTPUT_FORMAT.PLAIN,
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
    const result = await assembler.assemble(
      task,
      [fileWithPrevious],
      [],
      OUTPUT_FORMAT.PLAIN,
    );
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
    const result = await assembler.assemble(task, [codeFile], [], OUTPUT_FORMAT.PLAIN, [
      specFile,
    ]);
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
    const resultOmitted = await assembler.assemble(
      task,
      [makeFile("x.ts")],
      [],
      OUTPUT_FORMAT.PLAIN,
    );
    expect(resultOmitted).not.toContain("## Specification");
    expect(resultOmitted).toContain("## Task");
    expect(resultOmitted).toContain("## Task Classification");
    expect(resultOmitted).toContain("## Context");
    expect(resultOmitted).toContain("## Output Format");
    const resultEmpty = await assembler.assemble(
      task,
      [makeFile("x.ts")],
      [],
      OUTPUT_FORMAT.PLAIN,
      [],
    );
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
    await assembler.assemble(task, [], [], OUTPUT_FORMAT.PLAIN, [specFile]);
    expect(getContentCalls).toContain("documentation/plan.md");
  });
});
