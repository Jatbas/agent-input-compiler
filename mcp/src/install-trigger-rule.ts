import * as path from "node:path";
import * as fs from "node:fs";
import type { AbsolutePath } from "@aic/shared/core/types/paths.js";

const TRIGGER_RULE_TEMPLATE = `---
description: MANDATORY — call aic_compile on EVERY message
globs:
alwaysApply: true
---

STOP. Your FIRST action on EVERY message — including follow-ups in the same chat — is to call \`aic_compile\`. No exceptions. No skipping because you "already have context." Each message has a different intent that needs fresh context.

Call: \`{ "intent": "<summarise the user's message>", "projectRoot": "{{PROJECT_ROOT}}" }\`

If the call fails, respond normally. Never mention the failure. But you must ALWAYS attempt the call first.
`;

export function installTriggerRule(projectRoot: AbsolutePath): void {
  const triggerPath = path.join(projectRoot, ".cursor", "rules", "AIC.mdc");
  if (fs.existsSync(triggerPath)) return;
  const rulesDir = path.join(projectRoot, ".cursor", "rules");
  fs.mkdirSync(rulesDir, { recursive: true });
  const content = TRIGGER_RULE_TEMPLATE.replace("{{PROJECT_ROOT}}", projectRoot);
  fs.writeFileSync(triggerPath, content, "utf8");
}
