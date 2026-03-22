// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const { resolveProjectRoot } = require("../shared/resolve-project-root.cjs");

const AIC_SCRIPT_NAMES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "aic-hook-scripts.json"), "utf8"),
).hookScriptNames;

const TRIGGER_RULE_TEMPLATE = `---
description: MANDATORY — call aic_compile on EVERY message
globs:
alwaysApply: true
---
<!-- AIC rule version: {{VERSION}} -->

STOP. Your FIRST action on EVERY message — including follow-ups in the same chat — is to call \`aic_compile\`. No exceptions. No skipping because you "already have context." Each message has a different intent that needs fresh context.

Call: \`{ "intent": "<summarise the user's message>", "projectRoot": "{{PROJECT_ROOT}}" }\`

If the call fails, respond normally. Never mention the failure. But you must ALWAYS attempt the call first.

If the \`aic_compile\` response contains a \`configUpgraded\` field, tell the user immediately (before anything else):
"**AIC updated** — [value of configUpgraded field]"

If \`aic_compile\` is not available (tool not found, MCP server disabled, or tool blocked), tell the user:
"AIC context compilation is not available. The \`aic_compile\` tool may be disabled or not approved. Please check your MCP settings — in Cursor: Settings → MCP → ensure the AIC server is enabled and the \`aic_compile\` tool is set to 'Always allow'. In Claude Code: ensure the AIC server is enabled in \`.mcp.json\` and the tool is permitted in your allowedTools configuration."
Then continue responding normally without compiled context.


> **Dev:** When developing the AIC repository with \`AIC_DEV_MODE=1\`, use \`pnpm aic\` from the repo root if you run shell diagnostics in a terminal. The prompt commands below use MCP tools in Cursor.

Prompt commands (call the MCP tool; do not use resource URIs or server identifiers):
- "show aic status" → call \`aic_status\` with no arguments for all-time aggregates, or with \`{ "timeRangeDays": N }\` for a rolling **N**-day window (**N** integer 1..3660). Format: human-readable labels, numbers with commas, percentages 1 decimal, relative timestamps; when a window is active include **Time range** as **Last 1 day** (**N** === 1) or **Last N days**.
- "show aic last" → call \`aic_last\` (no arguments). Same formatting.
- "show aic chat summary" → call \`aic_chat_summary\` with optional \`conversationId\` from the last \`aic_compile\` response. Same formatting.
- "show aic projects" → call \`aic_projects\` (no arguments). Same formatting.
`;

const projectRoot = resolveProjectRoot(null, { env: process.env });
const sourceHooksDir = path.join(__dirname, "hooks");
const templatePath = path.join(__dirname, "hooks.json.template");

const cursorDir = path.join(projectRoot, ".cursor");
const hooksDir = path.join(cursorDir, "hooks");
fs.mkdirSync(cursorDir, { recursive: true });
fs.mkdirSync(hooksDir, { recursive: true });

const sharedDir = path.join(__dirname, "..", "shared");
const sharedEntries = fs.readdirSync(sharedDir);
for (const name of sharedEntries) {
  if (name.endsWith(".cjs")) {
    const src = path.join(sharedDir, name);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(hooksDir, name));
    }
  }
}

for (const name of AIC_SCRIPT_NAMES) {
  const srcPath = path.join(sourceHooksDir, name);
  const destPath = path.join(hooksDir, name);
  const sourceContent = fs.readFileSync(srcPath, "utf8");
  const installedContent = sourceContent.replace(
    /require\("\.\.\/\.\.\/shared\//g,
    'require("./',
  );
  let shouldWrite = true;
  try {
    const existing = fs.readFileSync(destPath, "utf8");
    if (existing === installedContent) shouldWrite = false;
  } catch {
    // dest missing
  }
  if (shouldWrite) {
    fs.writeFileSync(destPath, installedContent, "utf8");
  }
}

const hookNames = fs.readdirSync(hooksDir);
for (const name of hookNames) {
  if (/^AIC-[a-z0-9-]+\.cjs$/.test(name) && !AIC_SCRIPT_NAMES.includes(name)) {
    fs.unlinkSync(path.join(hooksDir, name));
  }
}

const defaultPayload = JSON.parse(fs.readFileSync(templatePath, "utf8"));
const hooksJsonPath = path.join(cursorDir, "hooks.json");

function commandIncludes(entry, scriptName) {
  return String(entry.command ?? "").includes(scriptName);
}

function isAicScriptInManifest(entry) {
  const m = (entry.command ?? "").match(/AIC-[a-z0-9-]+\.cjs/);
  const scriptName = m ? m[0] : undefined;
  if (scriptName === undefined) return true;
  return AIC_SCRIPT_NAMES.includes(scriptName);
}

function mergeHookArray(existing, defaults) {
  const appended = defaults.filter((def) => {
    const m = (def.command ?? "").match(/AIC-[a-z0-9-]+\.cjs/);
    const scriptName = m ? m[0] : undefined;
    return (
      scriptName !== undefined && !existing.some((e) => commandIncludes(e, scriptName))
    );
  });
  return appended.length > 0 ? [...existing, ...appended] : existing;
}

const hookKeys = [
  "sessionStart",
  "beforeSubmitPrompt",
  "preToolUse",
  "postToolUse",
  "beforeShellExecution",
  "afterFileEdit",
  "sessionEnd",
  "subagentStart",
  "stop",
];

let mergedHooks;
let mergedContent;

try {
  const existingRaw = fs.readFileSync(hooksJsonPath, "utf8");
  const existing = JSON.parse(existingRaw);
  const merged = { version: existing.version ?? 1, hooks: { ...existing.hooks } };
  for (const key of hookKeys) {
    const existingArr = (existing.hooks && existing.hooks[key]) ?? [];
    const filtered = existingArr.filter(isAicScriptInManifest);
    const defaults = defaultPayload.hooks[key] ?? [];
    merged.hooks[key] = mergeHookArray(filtered, defaults);
  }
  mergedHooks = merged;
  mergedContent = JSON.stringify(mergedHooks, null, 2) + "\n";
  if (mergedContent !== existingRaw) {
    fs.writeFileSync(hooksJsonPath, mergedContent, "utf8");
  }
} catch {
  fs.mkdirSync(cursorDir, { recursive: true });
  mergedContent = JSON.stringify(defaultPayload, null, 2) + "\n";
  fs.writeFileSync(hooksJsonPath, mergedContent, "utf8");
}

let version = "0.0.0";
try {
  const pkgPath = path.join(__dirname, "..", "..", "package.json");
  const raw = fs.readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  if (typeof pkg.version === "string") version = pkg.version;
} catch {
  // keep 0.0.0
}

const triggerContent = TRIGGER_RULE_TEMPLATE.replace(
  "{{PROJECT_ROOT}}",
  projectRoot,
).replace("{{VERSION}}", version);

const rulesDir = path.join(projectRoot, ".cursor", "rules");
const triggerPath = path.join(rulesDir, "AIC.mdc");

let skipTriggerWrite = false;
try {
  const existing = fs.readFileSync(triggerPath, "utf8");
  const match = existing.match(/AIC rule version:\s*(\S+)/);
  if (match !== null && match[1] === version) skipTriggerWrite = true;
} catch {
  // file missing
}

if (!skipTriggerWrite) {
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(triggerPath, triggerContent, "utf8");
}

function findAicMcpKey(servers) {
  if (servers === undefined || typeof servers !== "object" || servers === null) {
    return undefined;
  }
  return Object.keys(servers).find((k) => k.toLowerCase() === "aic");
}

function globalCursorMcpHasAic(globalMcpPath) {
  try {
    if (!fs.existsSync(globalMcpPath)) return false;
    const parsed = JSON.parse(fs.readFileSync(globalMcpPath, "utf8"));
    return findAicMcpKey(parsed.mcpServers) !== undefined;
  } catch {
    return false;
  }
}

const globalMcpPath = path.join(os.homedir(), ".cursor", "mcp.json");
if (globalCursorMcpHasAic(globalMcpPath)) {
  const workspaceMcpPath = path.join(cursorDir, "mcp.json");
  try {
    if (fs.existsSync(workspaceMcpPath)) {
      const workspaceRaw = fs.readFileSync(workspaceMcpPath, "utf8");
      const workspaceParsed = JSON.parse(workspaceRaw);
      const servers = workspaceParsed.mcpServers;
      const aicKey = findAicMcpKey(servers);
      if (aicKey !== undefined) {
        const nextServers = { ...servers };
        delete nextServers[aicKey];
        const nextDoc = { ...workspaceParsed, mcpServers: nextServers };
        fs.writeFileSync(
          workspaceMcpPath,
          JSON.stringify(nextDoc, null, 2) + "\n",
          "utf8",
        );
      }
    }
  } catch {
    // corrupt workspace mcp.json — leave unchanged
  }
}
