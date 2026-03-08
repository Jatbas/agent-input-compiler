// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContextGuard as IContextGuard } from "#core/interfaces/context-guard.interface.js";
import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardResult, GuardFinding } from "#core/types/guard-types.js";
import type { GlobPattern } from "#core/types/paths.js";
import { GUARD_SEVERITY } from "#core/types/enums.js";
import { matchesGlob } from "./glob-match.js";

function pathAllowed(path: string, allowPatterns: readonly GlobPattern[]): boolean {
  return allowPatterns.some((p) => matchesGlob(path, p));
}

export class ContextGuard implements IContextGuard {
  constructor(
    private readonly scanners: readonly GuardScanner[],
    private readonly fileContentReader: FileContentReader,
    private readonly allowPatterns: readonly GlobPattern[],
  ) {}

  async scan(files: readonly SelectedFile[]): Promise<{
    readonly result: GuardResult;
    readonly safeFiles: readonly SelectedFile[];
  }> {
    const contents = await Promise.all(
      files.map((file) => this.fileContentReader.getContent(file.path)),
    );
    const contentByPath = new Map(files.map((file, i) => [file.path, contents[i] ?? ""]));
    const allFindings = files.flatMap((file): GuardFinding[] => {
      const path = file.path;
      if (pathAllowed(path, this.allowPatterns)) return [];

      const content = contentByPath.get(path) ?? "";
      return this.scanners.flatMap((scanner) => scanner.scan(file, content));
    });

    const blockedPaths = [
      ...new Set(
        allFindings.filter((f) => f.severity === GUARD_SEVERITY.BLOCK).map((f) => f.file),
      ),
    ];
    const blockedSet = new Set(blockedPaths);
    const warnedPaths = [
      ...new Set(
        allFindings
          .filter((f) => f.severity === GUARD_SEVERITY.WARN)
          .map((f) => f.file)
          .filter((p) => !blockedSet.has(p)),
      ),
    ];
    const safeFiles = files.filter((f) => !blockedSet.has(f.path));
    const passed = safeFiles.length > 0;
    return {
      result: {
        passed,
        findings: allFindings,
        filesBlocked: blockedPaths,
        filesRedacted: blockedPaths,
        filesWarned: warnedPaths,
      },
      safeFiles,
    };
  }
}
