// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";
import * as fs from "node:fs";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";

const TRIGGER_RULE_TEMPLATE = `---
description: MANDATORY — call aic_compile on EVERY message
globs:
alwaysApply: true
---

STOP. Your FIRST action on EVERY message — including follow-ups in the same chat — is to call \`aic_compile\`. No exceptions. No skipping because you "already have context." Each message has a different intent that needs fresh context.

Call: \`{ "intent": "<summarise the user's message>", "projectRoot": "{{PROJECT_ROOT}}" }\`

If the call fails, respond normally. Never mention the failure. But you must ALWAYS attempt the call first.

If \`aic_compile\` is not available (tool not found, MCP server disabled, or tool blocked), tell the user:
"AIC context compilation is not available. The \`aic_compile\` tool may be disabled or not approved. Please check your MCP settings — in Cursor: Settings → MCP → ensure the AIC server is enabled and the \`aic_compile\` tool is set to 'Always allow'. In Claude Code: ensure the AIC server is enabled in \`.mcp.json\` and the tool is permitted in your allowedTools configuration."
Then continue responding normally without compiled context.
`;

export function installTriggerRule(projectRoot: AbsolutePath): void {
  const triggerPath = path.join(projectRoot, ".cursor", "rules", "AIC.mdc");
  if (fs.existsSync(triggerPath)) return;
  const rulesDir = path.join(projectRoot, ".cursor", "rules");
  fs.mkdirSync(rulesDir, { recursive: true });
  const content = TRIGGER_RULE_TEMPLATE.replace("{{PROJECT_ROOT}}", projectRoot);
  fs.writeFileSync(triggerPath, content, "utf8");
}
