import * as path from "node:path";
import * as fs from "node:fs";
import type { AbsolutePath } from "@aic/shared/core/types/paths.js";

export function runStartupSelfCheck(projectRoot: AbsolutePath): {
  installationOk: boolean;
  installationNotes: string;
} {
  const triggerPath = path.join(projectRoot, ".cursor", "rules", "AIC.mdc");
  const triggerExists = fs.existsSync(triggerPath);

  const hooksPath = path.join(projectRoot, ".cursor", "hooks", "hooks.json");
  const hooksExist = fs.existsSync(hooksPath);
  const sessionStartHasCompile = hooksExist
    ? (() => {
        const content = fs.readFileSync(hooksPath, "utf8");
        const parsed = JSON.parse(content) as {
          hooks?: { sessionStart?: readonly { command?: string }[] };
        };
        const sessionStart = parsed.hooks?.sessionStart;
        return (
          Array.isArray(sessionStart) &&
          sessionStart.some((entry: { command?: string }) =>
            String(entry.command ?? "").includes("AIC-compile-context.cjs"),
          )
        );
      })()
    : false;

  const hookScriptPath = path.join(
    projectRoot,
    ".cursor",
    "hooks",
    "AIC-compile-context.cjs",
  );
  const hookScriptExists = fs.existsSync(hookScriptPath);

  const notes = [
    ...(!triggerExists ? ["trigger rule not found — run aic init"] : []),
    ...(!hooksExist || !sessionStartHasCompile ? ["session hook not configured"] : []),
    ...(!hookScriptExists ? ["hook script missing"] : []),
  ];
  const installationOk = notes.length === 0;
  const installationNotes = notes.length > 0 ? notes.join("; ") : "";
  return { installationOk, installationNotes };
}
