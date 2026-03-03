import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { AbsolutePath } from "@aic/shared/core/types/paths.js";

const DEFAULT_HOOKS = {
  version: 1,
  hooks: {
    sessionStart: [
      { command: "node .cursor/hooks/AIC-session-init.cjs" },
      { command: "node .cursor/hooks/AIC-compile-context.cjs", timeout: 20 },
    ],
    beforeSubmitPrompt: [{ command: "node .cursor/hooks/AIC-before-submit-prewarm.cjs" }],
    preToolUse: [
      { command: "node .cursor/hooks/AIC-require-aic-compile.cjs" },
      {
        command: "node .cursor/hooks/AIC-inject-conversation-id.cjs",
        matcher: "MCP",
      },
    ],
    afterFileEdit: [],
  },
} as const;

const BUNDLED_HOOKS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "hooks",
);

const AIC_SCRIPT_NAMES: readonly string[] = [
  "AIC-session-init.cjs",
  "AIC-compile-context.cjs",
  "AIC-require-aic-compile.cjs",
  "AIC-inject-conversation-id.cjs",
  "AIC-before-submit-prewarm.cjs",
];

type HookEntry = {
  readonly command?: string;
  readonly timeout?: number;
  readonly matcher?: string;
};

function commandIncludes(entry: { command?: string }, scriptName: string): boolean {
  return String(entry.command ?? "").includes(scriptName);
}

function mergeHookArray(
  existing: readonly HookEntry[],
  defaults: readonly HookEntry[],
): readonly HookEntry[] {
  const appended = defaults.filter((def) => {
    const scriptName = (def.command ?? "").match(/AIC-[a-z0-9-]+\.cjs/)?.[0];
    return (
      scriptName !== undefined && !existing.some((e) => commandIncludes(e, scriptName))
    );
  });
  return appended.length > 0 ? [...existing, ...appended] : existing;
}

export function installCursorHooks(projectRoot: AbsolutePath): void {
  const cursorDir = path.join(projectRoot, ".cursor");
  const hooksPath = path.join(cursorDir, "hooks.json");
  if (!fs.existsSync(hooksPath)) {
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(hooksPath, JSON.stringify(DEFAULT_HOOKS, null, 2), "utf8");
  } else {
    const raw = fs.readFileSync(hooksPath, "utf8");
    const parsed = JSON.parse(raw) as {
      version?: number;
      hooks?: {
        sessionStart?: readonly HookEntry[];
        preToolUse?: readonly HookEntry[];
        beforeSubmitPrompt?: readonly HookEntry[];
        afterFileEdit?: readonly HookEntry[];
      };
    };
    const sessionStart = mergeHookArray(
      parsed.hooks?.sessionStart ?? [],
      DEFAULT_HOOKS.hooks.sessionStart,
    );
    const preToolUse = mergeHookArray(
      parsed.hooks?.preToolUse ?? [],
      DEFAULT_HOOKS.hooks.preToolUse,
    );
    const beforeSubmitPrompt = mergeHookArray(
      parsed.hooks?.beforeSubmitPrompt ?? [],
      DEFAULT_HOOKS.hooks.beforeSubmitPrompt,
    );
    const afterFileEdit = parsed.hooks?.afterFileEdit ?? [];
    const merged = {
      version: parsed.version ?? 1,
      hooks: {
        ...parsed.hooks,
        sessionStart,
        preToolUse,
        beforeSubmitPrompt,
        afterFileEdit,
      },
    };
    fs.writeFileSync(hooksPath, JSON.stringify(merged, null, 2), "utf8");
  }

  const hooksDir = path.join(cursorDir, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });

  for (const name of AIC_SCRIPT_NAMES) {
    const srcPath = path.join(BUNDLED_HOOKS_DIR, name);
    const destPath = path.join(hooksDir, name);
    const content = fs.readFileSync(srcPath, "utf8");
    fs.writeFileSync(destPath, content, "utf8");
  }
}
