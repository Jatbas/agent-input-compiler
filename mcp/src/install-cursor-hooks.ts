// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";

const DEFAULT_HOOKS = {
  version: 1,
  hooks: {
    sessionStart: [
      { command: "node .cursor/hooks/AIC-session-init.cjs" },
      { command: "node .cursor/hooks/AIC-compile-context.cjs", timeout: 20 },
    ],
    beforeSubmitPrompt: [{ command: "node .cursor/hooks/AIC-before-submit-prewarm.cjs" }],
    preToolUse: [
      {
        command: "node .cursor/hooks/AIC-require-aic-compile.cjs",
        failClosed: false,
      },
      {
        command: "node .cursor/hooks/AIC-inject-conversation-id.cjs",
        matcher: "MCP",
      },
    ],
    postToolUse: [
      {
        command: "node .cursor/hooks/AIC-post-compile-context.cjs",
        matcher: "MCP",
      },
    ],
    afterFileEdit: [{ command: "node .cursor/hooks/AIC-after-file-edit-tracker.cjs" }],
    sessionEnd: [{ command: "node .cursor/hooks/AIC-session-end.cjs" }],
    stop: [
      {
        command: "node .cursor/hooks/AIC-stop-quality-check.cjs",
        loop_limit: 5,
      },
    ],
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
  "AIC-post-compile-context.cjs",
  "AIC-before-submit-prewarm.cjs",
  "AIC-after-file-edit-tracker.cjs",
  "AIC-session-end.cjs",
  "AIC-stop-quality-check.cjs",
];

type HookEntry = {
  readonly command?: string;
  readonly timeout?: number;
  readonly matcher?: string;
  readonly failClosed?: boolean;
};

type StopHookEntry = HookEntry & { readonly loop_limit?: number | null };

function commandIncludes(entry: { command?: string }, scriptName: string): boolean {
  return String(entry.command ?? "").includes(scriptName);
}

function isAicScriptInManifest(entry: HookEntry): boolean {
  const scriptName = (entry.command ?? "").match(/AIC-[a-z0-9-]+\.cjs/)?.[0];
  if (scriptName === undefined) return true;
  return AIC_SCRIPT_NAMES.includes(scriptName);
}

type ParsedHooks = {
  version?: number;
  hooks?: {
    sessionStart?: readonly HookEntry[];
    preToolUse?: readonly HookEntry[];
    postToolUse?: readonly HookEntry[];
    beforeSubmitPrompt?: readonly HookEntry[];
    afterFileEdit?: readonly HookEntry[];
    sessionEnd?: readonly HookEntry[];
    stop?: readonly StopHookEntry[];
  };
};

function readHooksOrRewrite(
  pathToHooks: string,
  writeDefault: (obj: Record<string, unknown>) => void,
): ParsedHooks {
  try {
    const raw = fs.readFileSync(pathToHooks, "utf8");
    return JSON.parse(raw) as ParsedHooks;
  } catch {
    writeDefault(DEFAULT_HOOKS);
    return { version: DEFAULT_HOOKS.version, hooks: { ...DEFAULT_HOOKS.hooks } };
  }
}

function mergeHookArray<T extends HookEntry>(
  existing: readonly T[],
  defaults: readonly T[],
): readonly T[] {
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
  const jsonContent = (obj: Record<string, unknown>): string =>
    JSON.stringify(obj, null, 2) + "\n";
  if (!fs.existsSync(hooksPath)) {
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(hooksPath, jsonContent(DEFAULT_HOOKS), "utf8");
  } else {
    const parsed = readHooksOrRewrite(hooksPath, (obj) =>
      fs.writeFileSync(hooksPath, jsonContent(obj), "utf8"),
    );
    const sessionStart = mergeHookArray(
      (parsed.hooks?.sessionStart ?? []).filter(isAicScriptInManifest),
      DEFAULT_HOOKS.hooks.sessionStart,
    );
    const preToolUse = mergeHookArray(
      (parsed.hooks?.preToolUse ?? []).filter(isAicScriptInManifest),
      DEFAULT_HOOKS.hooks.preToolUse,
    );
    const postToolUse = mergeHookArray(
      (parsed.hooks?.postToolUse ?? []).filter(isAicScriptInManifest),
      DEFAULT_HOOKS.hooks.postToolUse,
    );
    const beforeSubmitPrompt = mergeHookArray(
      (parsed.hooks?.beforeSubmitPrompt ?? []).filter(isAicScriptInManifest),
      DEFAULT_HOOKS.hooks.beforeSubmitPrompt,
    );
    const afterFileEdit = mergeHookArray(
      (parsed.hooks?.afterFileEdit ?? []).filter(isAicScriptInManifest),
      DEFAULT_HOOKS.hooks.afterFileEdit,
    );
    const sessionEnd = mergeHookArray(
      (parsed.hooks?.sessionEnd ?? []).filter(isAicScriptInManifest),
      DEFAULT_HOOKS.hooks.sessionEnd,
    );
    const stop = mergeHookArray(
      (parsed.hooks?.stop ?? []).filter(isAicScriptInManifest),
      DEFAULT_HOOKS.hooks.stop,
    );
    const merged = {
      version: parsed.version ?? 1,
      hooks: {
        ...parsed.hooks,
        sessionStart,
        preToolUse,
        postToolUse,
        beforeSubmitPrompt,
        afterFileEdit,
        sessionEnd,
        stop,
      },
    };
    fs.writeFileSync(hooksPath, jsonContent(merged), "utf8");
  }

  const hooksDir = path.join(cursorDir, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });

  const hookNames = fs.readdirSync(hooksDir);
  for (const name of hookNames) {
    if (/^AIC-[a-z0-9-]+\.cjs$/.test(name) && !AIC_SCRIPT_NAMES.includes(name)) {
      fs.unlinkSync(path.join(hooksDir, name));
    }
  }

  for (const name of AIC_SCRIPT_NAMES) {
    const srcPath = path.join(BUNDLED_HOOKS_DIR, name);
    const destPath = path.join(hooksDir, name);
    const content = fs.readFileSync(srcPath, "utf8");
    fs.writeFileSync(destPath, content, "utf8");
  }
}
