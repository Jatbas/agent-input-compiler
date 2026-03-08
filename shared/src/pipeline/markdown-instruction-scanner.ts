// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";
import { runInstructionPatternScan } from "./instruction-patterns.js";

const MARKDOWN_EXTENSIONS: readonly string[] = [".md", ".mdc", ".mdx"];

function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSIONS.some((ext) => path.endsWith(ext));
}

export class MarkdownInstructionScanner implements GuardScanner {
  readonly name = "MarkdownInstructionScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[] {
    if (!isMarkdownPath(file.path)) {
      return [];
    }
    return runInstructionPatternScan(file, content, "Markdown instruction pattern: ");
  }
}
