import * as os from "node:os";
import * as path from "node:path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import type { AbsolutePath } from "@aic/shared/core/types/paths.js";
import type { FilePath } from "@aic/shared/core/types/paths.js";
import { toAbsolutePath, toFilePath } from "@aic/shared/core/types/paths.js";

const SENSITIVE_PREFIXES_UNIX = ["/etc", "/usr", "/bin", "/sbin"] as const;
const WINDOWS_SENSITIVE = path.normalize("C:\\Windows");

function isUnderSensitivePrefix(resolved: string): boolean {
  const normalized = path.normalize(resolved);
  if (process.platform === "win32") {
    return normalized.toLowerCase().startsWith(WINDOWS_SENSITIVE.toLowerCase());
  }
  return SENSITIVE_PREFIXES_UNIX.some((p) => normalized.startsWith(p));
}

function assertPathAllowed(resolved: string): void {
  const homedir = os.homedir();
  if (!resolved.startsWith(homedir) || isUnderSensitivePrefix(resolved)) {
    throw new McpError(ErrorCode.InvalidParams, "Invalid projectRoot");
  }
}

export function validateProjectRoot(raw: string): AbsolutePath {
  const resolved = path.resolve(raw);
  assertPathAllowed(resolved);
  return toAbsolutePath(resolved);
}

export function validateConfigPath(raw: string, projectRoot: AbsolutePath): FilePath {
  const resolved = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(projectRoot, raw);
  assertPathAllowed(resolved);
  return toFilePath(resolved);
}
