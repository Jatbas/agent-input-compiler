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

export class PromptAssembler implements IPromptAssembler {
  constructor(private readonly fileContentReader: FileContentReader) {}

  assemble(
    task: TaskClassification,
    files: readonly SelectedFile[],
    constraints: readonly string[],
    format: OutputFormat,
  ): string {
    const intent = task.matchedKeywords.join(" ") || task.taskClass;
    const contextParts = files.flatMap((file) => {
      const content = this.fileContentReader.getContent(file.path);
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
      "## Context",
      ...contextParts,
      ...constraintSection,
      "## Output Format",
      FORMAT_DESCRIPTIONS[format],
    ];
    return sections.join("\n").trimEnd();
  }
}
