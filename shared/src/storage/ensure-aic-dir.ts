import * as fs from "node:fs";
import * as path from "node:path";
import type { AbsolutePath } from "#core/types/paths.js";
import { toAbsolutePath } from "#core/types/paths.js";

export function ensureAicDir(projectRoot: AbsolutePath): AbsolutePath {
  const aicDir = path.join(projectRoot, ".aic");
  fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
  return toAbsolutePath(aicDir);
}
