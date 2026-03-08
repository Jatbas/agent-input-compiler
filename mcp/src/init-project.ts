// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

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

export const CONFIG_FILENAME = "aic.config.json";

// Idempotent, silent init for use from compile handler when project has no config.
export function ensureProjectInit(projectRoot: AbsolutePath): void {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);
  if (fs.existsSync(configPath)) {
    return;
  }
  ensureAicDir(projectRoot);
  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
  installTriggerRule(projectRoot);
  installCursorHooks(projectRoot);
}

export function runInit(projectRoot: AbsolutePath): void {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);
  if (fs.existsSync(configPath)) {
    process.stderr.write(
      "Config already exists. Edit aic.config.json directly to change settings.\n",
    );
    throw new ConfigError("Config already exists.");
  }
  ensureProjectInit(projectRoot);
  process.stdout.write(
    "Created aic.config.json. Edit to customise, or run a compile to use defaults.\n",
  );
}
