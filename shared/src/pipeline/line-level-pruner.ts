// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { LineLevelPruner as ILineLevelPruner } from "#core/interfaces/line-level-pruner.interface.js";
import type { TokenCounter } from "#core/interfaces/token-counter.interface.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

const SYNTAX_ONLY_LINE = /^\s*[\s{}\[\]();,]*\s*$/;
const STRUCTURAL_LINE = /^\s*(return|break|continue|else|case|default|throw)\b/;

function lineMatchesToken(line: string, subjectTokens: readonly string[]): boolean {
  const lower = line.toLowerCase();
  return subjectTokens.some((t) => lower.includes(t.toLowerCase()));
}

function computeKeepSet(
  lines: readonly string[],
  subjectTokens: readonly string[],
): ReadonlySet<number> {
  const matchIndices = lines.reduce<readonly number[]>(
    (acc, line, i) => (lineMatchesToken(line, subjectTokens) ? [...acc, i] : acc),
    [],
  );
  const expanded = matchIndices.flatMap((i) => [i - 1, i, i + 1]);
  return new Set(expanded.filter((i) => i >= 0 && i < lines.length));
}

function keepLine(
  lineIndex: number,
  lines: readonly string[],
  keepSet: ReadonlySet<number>,
): boolean {
  if (keepSet.has(lineIndex)) return true;
  const line = lines[lineIndex] ?? "";
  if (SYNTAX_ONLY_LINE.test(line)) return true;
  return STRUCTURAL_LINE.test(line);
}

export class LineLevelPruner implements ILineLevelPruner {
  constructor(
    private readonly tokenCounter: TokenCounter,
    private readonly fileContentReader: FileContentReader,
  ) {}

  async prune(
    files: readonly SelectedFile[],
    subjectTokens: readonly string[],
  ): Promise<readonly SelectedFile[]> {
    if (subjectTokens.length === 0) return files;
    return Promise.all(
      files.map(async (f): Promise<SelectedFile> => {
        if (f.tier !== INCLUSION_TIER.L0) return f;
        const content =
          f.resolvedContent ?? (await this.fileContentReader.getContent(f.path));
        const lines = content.split("\n");
        const keepSet = computeKeepSet(lines, subjectTokens);
        const kept = lines.filter((_, i) => keepLine(i, lines, keepSet));
        const prunedContent = kept.join("\n");
        const estimatedTokens = this.tokenCounter.countTokens(prunedContent);
        return { ...f, resolvedContent: prunedContent, estimatedTokens };
      }),
    );
  }
}
