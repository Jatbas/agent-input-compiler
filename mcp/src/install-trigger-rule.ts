// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "package.json",
    );
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const TRIGGER_RULE_TEMPLATE = `---
description: MANDATORY — call aic_compile on EVERY message
globs:
alwaysApply: true
---
<!-- AIC rule version: {{VERSION}} -->

STOP. Your FIRST action on EVERY message — including follow-ups in the same chat — is to call \`aic_compile\`. No exceptions. No skipping because you "already have context." Each message has a different intent that needs fresh context.

Call: \`{ "intent": "<summarise the user's message>", "projectRoot": "{{PROJECT_ROOT}}" }\`

If the call fails, respond normally. Never mention the failure. But you must ALWAYS attempt the call first.

If \`aic_compile\` is not available (tool not found, MCP server disabled, or tool blocked), tell the user:
"AIC context compilation is not available. The \`aic_compile\` tool may be disabled or not approved. Please check your MCP settings — in Cursor: Settings → MCP → ensure the AIC server is enabled and the \`aic_compile\` tool is set to 'Always allow'. In Claude Code: ensure the AIC server is enabled in \`.mcp.json\` and the tool is permitted in your allowedTools configuration."
Then continue responding normally without compiled context.

Prompt commands (call the MCP tool; do not use resource URIs or server identifiers):
- "show aic status" → call \`aic_status\` (no arguments). Format: human-readable labels, numbers with commas, percentages 1 decimal, relative timestamps.
- "show aic last" → call \`aic_last\` (no arguments). Same formatting.
- "show aic chat summary" → call \`aic_chat_summary\` with optional \`conversationId\` from the last \`aic_compile\` response. Same formatting.
- "show aic projects" → call \`aic_projects\` (no arguments). Same formatting.
`;

export function installTriggerRule(projectRoot: AbsolutePath): void {
  const currentVersion = readPackageVersion();
  const content = TRIGGER_RULE_TEMPLATE.replace("{{PROJECT_ROOT}}", projectRoot).replace(
    "{{VERSION}}",
    currentVersion,
  );
  const rulesDir = path.join(projectRoot, ".cursor", "rules");
  const triggerPath = path.join(rulesDir, "AIC.mdc");
  if (fs.existsSync(triggerPath)) {
    const existing = fs.readFileSync(triggerPath, "utf8");
    const match = existing.match(/AIC rule version:\s*(\S+)/);
    if (match !== null && match[1] === currentVersion) return;
  }
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(triggerPath, content, "utf8");
}
