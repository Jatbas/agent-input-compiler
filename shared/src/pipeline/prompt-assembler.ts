import type { PromptAssembler as IPromptAssembler } from "#core/interfaces/prompt-assembler.interface.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { OutputFormat } from "#core/types/enums.js";
import { OUTPUT_FORMAT } from "#core/types/enums.js";

const FORMAT_DESCRIPTIONS: Readonly<Record<OutputFormat, string>> = {
  [OUTPUT_FORMAT.UNIFIED_DIFF]:
    "Respond with a unified diff (--- a/ +++ b/ @@ ... @@). Do not include any text outside the diff blocks.",
  [OUTPUT_FORMAT.FULL_FILE]:
    "Respond with the complete contents of each modified file. Begin each file with a header comment: // FILE: {path}",
  [OUTPUT_FORMAT.MARKDOWN]:
    "Respond in Markdown. Use headings, code blocks, and bullet lists as appropriate.",
  [OUTPUT_FORMAT.JSON]:
    "Respond with a single valid JSON object. Do not include any prose, markdown, or explanation outside the JSON.",
  [OUTPUT_FORMAT.PLAIN]: "Respond in plain text.",
};

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

export class PromptAssembler implements IPromptAssembler {
  constructor(private readonly fileContentReader: FileContentReader) {}

  async assemble(
    task: TaskClassification,
    files: readonly SelectedFile[],
    constraints: readonly string[],
    format: OutputFormat,
    specFiles?: readonly SelectedFile[],
    sessionContextSummary?: string,
  ): Promise<string> {
    const intent = task.matchedKeywords.join(" ") || task.taskClass;
    const specParts = await buildSpecParts(this.fileContentReader, specFiles ?? []);
    const sessionContextBlock =
      sessionContextSummary !== undefined && sessionContextSummary !== ""
        ? ["## Session context", "", sessionContextSummary, ""]
        : [];
    const needContent = files.filter((f) => f.previouslyShownAtStep === undefined);
    const contents = await Promise.all(
      needContent.map((f) => this.fileContentReader.getContent(f.path)),
    );
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
      "## Context",
      ...contextParts,
      ...constraintSection,
      "## Output Format",
      FORMAT_DESCRIPTIONS[format],
    ];
    return sections.join("\n").trimEnd();
  }
}
