import * as fs from "node:fs";
import * as path from "node:path";
import type { AbsolutePath } from "@aic/shared/core/types/paths.js";
import { ensureAicDir } from "@aic/shared/storage/ensure-aic-dir.js";
import { installTriggerRule } from "./install-trigger-rule.js";
import { installCursorHooks } from "./install-cursor-hooks.js";
import { ConfigError } from "@aic/shared/core/errors/config-error.js";

const DEFAULT_CONFIG = {
  contextBudget: { maxTokens: 8000 },
} as const;

export function runInit(projectRoot: AbsolutePath): void {
  ensureAicDir(projectRoot);
  const configPath = path.join(projectRoot, "aic.config.json");
  if (fs.existsSync(configPath)) {
    process.stderr.write(
      "Config already exists. Edit aic.config.json directly to change settings.\n",
    );
    throw new ConfigError("Config already exists.");
  }
  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
  installTriggerRule(projectRoot);
  installCursorHooks(projectRoot);
  process.stdout.write(
    "Created aic.config.json. Edit to customise, or run a compile to use defaults.\n",
  );
}
