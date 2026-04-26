// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { PromptAssembler as IPromptAssembler } from "@jatbas/aic-core/core/interfaces/prompt-assembler.interface.js";
import type { FileContentReader } from "@jatbas/aic-core/core/interfaces/file-content-reader.interface.js";
import type { TokenCounter } from "@jatbas/aic-core/core/interfaces/token-counter.interface.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { AssembledPrompt } from "@jatbas/aic-core/core/types/assembled-prompt.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";

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

function firstFileNeedingContent(files: readonly SelectedFile[]): SelectedFile | null {
  const found = files.find((f) => f.previouslyShownAtStep === undefined);
  return found ?? null;
}

async function buildReinforcedContextParts(
  fileContentReader: FileContentReader,
  files: readonly SelectedFile[],
): Promise<{ readonly parts: readonly string[]; readonly body: string | null }> {
  if (files.length < 5) return { parts: [], body: null };
  const target = firstFileNeedingContent(files);
  if (target === null) return { parts: [], body: null };
  const [body] = await fetchContextContents(fileContentReader, [target]);
  const text = body ?? "";
  return {
    parts: [
      "## Context (reinforced)",
      "",
      `### ${target.path} [Tier: ${target.tier}]`,
      text,
      "",
    ],
    body: text,
  };
}

function computeRenderedOverheadTokens(
  tokenCounter: TokenCounter,
  prompt: string,
  bodyFragments: readonly string[],
): AssembledPrompt["renderedOverheadTokens"] {
  const full = Number(tokenCounter.countTokens(prompt));
  const sumParts = bodyFragments.reduce(
    (s, b) => s + Number(tokenCounter.countTokens(b)),
    0,
  );
  return toTokenCount(Math.max(0, full - sumParts));
}

async function loadSpecPartsAndBodies(
  fileContentReader: FileContentReader,
  specFiles: readonly SelectedFile[],
): Promise<{
  readonly parts: readonly string[];
  readonly bodies: readonly string[];
}> {
  if (specFiles.length === 0) return { parts: [], bodies: [] };
  const specContentList = await Promise.all(
    specFiles.map((f) => fileContentReader.getContent(f.path)),
  );
  return {
    parts: [
      "## Specification",
      "",
      ...specFiles.flatMap((file, i) => [
        `### ${file.path} [Tier: ${file.tier}]`,
        specContentList[i] ?? "",
        "",
      ]),
    ],
    bodies: [...specContentList],
  };
}

async function loadContextPartsAndBodies(
  fileContentReader: FileContentReader,
  files: readonly SelectedFile[],
): Promise<{
  readonly parts: readonly string[];
  readonly bodies: readonly string[];
}> {
  const needContent = files.filter((f) => f.previouslyShownAtStep === undefined);
  const contents = await fetchContextContents(fileContentReader, needContent);
  const contentIndexFor = (upTo: number): number =>
    files.slice(0, upTo).filter((f) => f.previouslyShownAtStep === undefined).length;
  const parts = files.flatMap((file, i) => {
    if (file.previouslyShownAtStep !== undefined) {
      return [
        `### ${file.path} [Tier: ${file.tier}] — Previously shown in step ${file.previouslyShownAtStep}`,
        "",
      ];
    }
    const content = contents[contentIndexFor(i)] ?? "";
    return [`### ${file.path} [Tier: ${file.tier}]`, content, ""];
  });
  const bodies = files.flatMap((file, i) => {
    if (file.previouslyShownAtStep !== undefined) return [];
    return [contents[contentIndexFor(i)] ?? ""];
  });
  return { parts, bodies };
}

function sessionAndStructureBlocks(
  sessionContextSummary: string | undefined,
  structuralMap: string | undefined,
): { readonly session: readonly string[]; readonly structure: readonly string[] } {
  const session =
    sessionContextSummary !== undefined && sessionContextSummary !== ""
      ? (["## Session context", "", sessionContextSummary, ""] as const)
      : ([] as const);
  const structure =
    structuralMap !== undefined && structuralMap !== ""
      ? (["## Project structure", "", structuralMap, ""] as const)
      : ([] as const);
  return { session, structure };
}

async function buildPromptAndBodyFragments(
  fileContentReader: FileContentReader,
  task: TaskClassification,
  files: readonly SelectedFile[],
  constraints: readonly string[],
  specFiles: readonly SelectedFile[],
  sessionContextSummary: string | undefined,
  structuralMap: string | undefined,
): Promise<{ readonly prompt: string; readonly bodyFragments: readonly string[] }> {
  const intent = task.matchedKeywords.join(" ") || task.taskClass;
  const spec = await loadSpecPartsAndBodies(fileContentReader, specFiles);
  const { session, structure } = sessionAndStructureBlocks(
    sessionContextSummary,
    structuralMap,
  );
  const constraintsPreamble = buildConstraintsPreamble(constraints);
  const ctx = await loadContextPartsAndBodies(fileContentReader, files);
  const constraintSection =
    constraints.length > 0
      ? ["## Constraints", ...constraints.map((c) => `- ${c}`), ""]
      : [];
  const reinforced = await buildReinforcedContextParts(fileContentReader, files);
  const reinforcedBodies =
    reinforced.body === null ? ([] as const) : ([reinforced.body] as const);
  const bodyFragments = [...spec.bodies, ...ctx.bodies, ...reinforcedBodies];
  const sections = [
    "## Task",
    intent,
    "",
    "## Task Classification",
    `Type: ${task.taskClass} (confidence: ${task.confidence})`,
    "",
    ...spec.parts,
    ...session,
    ...structure,
    ...constraintsPreamble,
    "## Context",
    ...ctx.parts,
    ...reinforced.parts,
    ...constraintSection,
  ];
  return { prompt: sections.join("\n").trimEnd(), bodyFragments };
}

export class PromptAssembler implements IPromptAssembler {
  constructor(
    private readonly fileContentReader: FileContentReader,
    private readonly tokenCounter: TokenCounter,
  ) {}

  async assemble(
    task: TaskClassification,
    files: readonly SelectedFile[],
    constraints: readonly string[],
    specFiles?: readonly SelectedFile[],
    sessionContextSummary?: string,
    structuralMap?: string,
  ): Promise<AssembledPrompt> {
    const { prompt, bodyFragments } = await buildPromptAndBodyFragments(
      this.fileContentReader,
      task,
      files,
      constraints,
      specFiles ?? [],
      sessionContextSummary,
      structuralMap,
    );
    return {
      prompt,
      renderedOverheadTokens: computeRenderedOverheadTokens(
        this.tokenCounter,
        prompt,
        bodyFragments,
      ),
    };
  }
}
