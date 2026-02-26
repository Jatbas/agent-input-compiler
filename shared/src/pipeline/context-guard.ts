import type { ContextGuard as IContextGuard } from "#core/interfaces/context-guard.interface.js";
import type { GuardScanner } from "#core/interfaces/guard-scanner.interface.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardResult, GuardFinding } from "#core/types/guard-types.js";
import type { GlobPattern } from "#core/types/paths.js";
import { GUARD_SEVERITY } from "#core/types/enums.js";
import { matchesGlob } from "./glob-match.js";

function pathAllowed(path: string, allowPatterns: readonly GlobPattern[]): boolean {
  return allowPatterns.some((p) => matchesGlob(path, p as string));
}

export class ContextGuard implements IContextGuard {
  constructor(
    private readonly scanners: readonly GuardScanner[],
    private readonly fileContentReader: FileContentReader,
    private readonly allowPatterns: readonly GlobPattern[],
  ) {}

  scan(files: readonly SelectedFile[]): {
    readonly result: GuardResult;
    readonly safeFiles: readonly SelectedFile[];
  } {
    const allFindings = files.flatMap((file): GuardFinding[] => {
      const path = file.path as string;
      if (pathAllowed(path, this.allowPatterns)) return [];

      const content = this.fileContentReader.getContent(file.path);
      return this.scanners.flatMap((scanner) => scanner.scan(file, content));
    });

    const blockedPaths = [
      ...new Set(
        allFindings.filter((f) => f.severity === GUARD_SEVERITY.BLOCK).map((f) => f.file),
      ),
    ];
    const blockedSet = new Set(blockedPaths);
    const safeFiles = files.filter((f) => !blockedSet.has(f.path));
    const passed = safeFiles.length > 0;
    return {
      result: {
        passed,
        findings: allFindings,
        filesBlocked: blockedPaths,
        filesRedacted: blockedPaths,
      },
      safeFiles,
    };
  }
}
