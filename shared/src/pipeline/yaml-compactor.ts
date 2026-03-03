import type { ContentTransformer } from "#core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import { toFileExtension } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

const YAML_EXTENSIONS: readonly FileExtension[] = [
  toFileExtension(".yaml"),
  toFileExtension(".yml"),
];

const COMMENT_LINE_RE = /^\s*#/;

function stripCommentLines(content: string): string {
  const lines = content.split("\n");
  const kept = lines.filter((line) => !COMMENT_LINE_RE.test(line));
  return kept.join("\n");
}

function countLeadingSpaces(line: string): number {
  const match = line.match(/^(\s*)/);
  const group = match?.[1];
  return group !== undefined ? group.length : 0;
}

function detectIndentStep(lines: readonly string[]): number {
  const withContent = lines.filter((l) => l.trim().length > 0);
  if (withContent.length === 0) return 2;
  const firstNonEmpty = withContent[0];
  if (firstNonEmpty === undefined) return 2;
  const firstSpaces = countLeadingSpaces(firstNonEmpty);
  if (firstSpaces > 0) return firstSpaces;
  const positiveIndents = withContent
    .map(countLeadingSpaces)
    .filter((n) => n > 0);
  const minIndent = positiveIndents.reduce(
    (min, n) => Math.min(min, n),
    Number.MAX_SAFE_INTEGER,
  );
  return minIndent < Number.MAX_SAFE_INTEGER ? minIndent : 2;
}

function normalizeIndent(content: string): string {
  const lines = content.split("\n");
  const step = detectIndentStep(lines);
  const normalized = lines.map((line) => {
    const leading = countLeadingSpaces(line);
    const rest = line.slice(leading);
    if (rest.length === 0) return line;
    const level = step > 0 ? Math.floor(leading / step) : 0;
    const newSpaces = "  ".repeat(level);
    return newSpaces + rest;
  });
  return normalized.join("\n");
}

// Block key only: optional indent, key, colon, optional whitespace, end.
const BLOCK_KEY_RE = /^(\s*)(\S+):\s*$/;
// Single child: indent (at least 2 spaces), key, colon, optional simple value.
const CHILD_LINE_RE = /^(\s+)(\S+):\s*(\S*)$/;

function collapseSingleKeyBlocks(content: string): string {
  const lines = content.split("\n");
  type Acc = { readonly result: readonly string[]; readonly skipNext: boolean };
  const initial: Acc = { result: [], skipNext: false };
  const folded = lines.reduce<Acc>((acc, line, i) => {
    if (acc.skipNext) return { ...acc, skipNext: false };
    const prevLine = i > 0 ? lines[i - 1] : null;
    const blockMatch = prevLine?.match(BLOCK_KEY_RE);
    const nextMatch = line.match(CHILD_LINE_RE);
    const parentIndent = (blockMatch?.[1] ?? "").length;
    const childIndent = (nextMatch?.[1] ?? "").length;
    const noSibling =
      i + 1 >= lines.length ||
      countLeadingSpaces(lines[i + 1] ?? "") <= parentIndent;
    const blockOk = blockMatch !== null && blockMatch !== undefined;
    const nextOk = nextMatch !== null;
    if (
      !blockOk ||
      !nextOk ||
      childIndent <= parentIndent ||
      !noSibling
    ) {
      return { result: [...acc.result, line], skipNext: false };
    }
    {
      const lastIdx = acc.result.length - 1;
      const indent = blockMatch[1] ?? "";
      const parentKey = blockMatch[2] ?? "";
      const childKey = nextMatch[2] ?? "";
      const childVal = nextMatch[3] ?? "";
      const flowVal =
        childVal.length > 0 ? `${childKey}: ${childVal}` : childKey;
      const newLine = `${indent}${parentKey}: { ${flowVal} }`;
      const newResult = [
        ...acc.result.slice(0, lastIdx),
        newLine,
      ];
      return { result: newResult, skipNext: true };
    }
  }, initial);
  return folded.result.join("\n");
}

export class YamlCompactor implements ContentTransformer {
  readonly id = "yaml-compactor";
  readonly fileExtensions: readonly FileExtension[] = YAML_EXTENSIONS;

  transform(
    content: string,
    _tier: InclusionTier,
    _filePath: RelativePath,
  ): string {
    if (content.length === 0) return content;
    const withoutComments = stripCommentLines(content);
    const reindented = normalizeIndent(withoutComments);
    return collapseSingleKeyBlocks(reindented);
  }
}
