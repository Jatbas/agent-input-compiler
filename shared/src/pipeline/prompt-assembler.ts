// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { PromptAssembler as IPromptAssembler } from "@jatbas/aic-core/core/interfaces/prompt-assembler.interface.js";
import type { FileContentReader } from "@jatbas/aic-core/core/interfaces/file-content-reader.interface.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";

async function buildSpecParts(
  fileContentReader: FileContentReader,
  specFiles: readonly SelectedFile[],
): Promise<readonly string[]> {
  if (specFiles.length === 0) return [];
  const specContentList = await Promise.all(
    specFiles.map((f) => fileContentReader.getContent(f.path)),
  );
  return [
    "## Specification",
    "",
    ...specFiles.flatMap((file, i) => [
      `### ${file.path} [Tier: ${file.tier}]`,
      specContentList[i] ?? "",
      "",
    ]),
  ];
}

async function fetchContextContents(
  fileContentReader: FileContentReader,
  needContent: readonly SelectedFile[],
): Promise<readonly string[]> {
  return Promise.all(
    needContent.map((f) =>
      f.resolvedContent !== undefined
        ? Promise.resolve(f.resolvedContent)
        : fileContentReader.getContent(f.path),
    ),
  );
}

function buildConstraintsPreamble(constraints: readonly string[]): readonly string[] {
  return constraints.length > 0
    ? ["## Constraints (key)", "", ...constraints.slice(0, 3).map((c) => `- ${c}`), ""]
    : [];
}

export class PromptAssembler implements IPromptAssembler {
  constructor(private readonly fileContentReader: FileContentReader) {}

  async assemble(
    task: TaskClassification,
    files: readonly SelectedFile[],
    constraints: readonly string[],
    specFiles?: readonly SelectedFile[],
    sessionContextSummary?: string,
    structuralMap?: string,
  ): Promise<string> {
    const intent = task.matchedKeywords.join(" ") || task.taskClass;
    const specParts = await buildSpecParts(this.fileContentReader, specFiles ?? []);
    const sessionContextBlock =
      sessionContextSummary !== undefined && sessionContextSummary !== ""
        ? ["## Session context", "", sessionContextSummary, ""]
        : [];
    const projectStructureBlock =
      structuralMap !== undefined && structuralMap !== ""
        ? ["## Project structure", "", structuralMap, ""]
        : [];
    const constraintsPreamble = buildConstraintsPreamble(constraints);
    const needContent = files.filter((f) => f.previouslyShownAtStep === undefined);
    const contents = await fetchContextContents(this.fileContentReader, needContent);
    const contentIndexFor = (upTo: number): number =>
      files.slice(0, upTo).filter((f) => f.previouslyShownAtStep === undefined).length;
    const contextParts = files.flatMap((file, i) => {
      if (file.previouslyShownAtStep !== undefined) {
        return [
          `### ${file.path} [Tier: ${file.tier}] — Previously shown in step ${file.previouslyShownAtStep}`,
          "",
        ];
      }
      const content = contents[contentIndexFor(i)] ?? "";
      return [`### ${file.path} [Tier: ${file.tier}]`, content, ""];
    });
    const constraintSection =
      constraints.length > 0
        ? ["## Constraints", ...constraints.map((c) => `- ${c}`), ""]
        : [];
    const sections = [
      "## Task",
      intent,
      "",
      "## Task Classification",
      `Type: ${task.taskClass} (confidence: ${task.confidence})`,
      "",
      ...specParts,
      ...sessionContextBlock,
      ...projectStructureBlock,
      ...constraintsPreamble,
      "## Context",
      ...contextParts,
      ...constraintSection,
    ];
    return sections.join("\n").trimEnd();
  }
}
