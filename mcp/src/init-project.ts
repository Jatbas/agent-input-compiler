// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import {
  ensureAicDir,
  ensureEslintignore,
  ensurePrettierignore,
  joinUnderProjectAic,
} from "@jatbas/aic-core/storage/ensure-aic-dir.js";
import { PROJECT_ID_FILENAME } from "@jatbas/aic-core/storage/ensure-project-id.js";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";

const DEFAULT_CONFIG = {} as const;

export const CONFIG_FILENAME = "aic.config.json";

// Idempotent, silent init for use from compile handler when project has no config.
export function ensureProjectInit(
  projectRoot: AbsolutePath,
  clock?: Clock,
  idGenerator?: IdGenerator,
): void {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);
  if (fs.existsSync(configPath)) {
    return;
  }
  ensureAicDir(projectRoot);
  if (clock !== undefined && idGenerator !== undefined) {
    const projectIdPath = joinUnderProjectAic(projectRoot, PROJECT_ID_FILENAME);
    if (!fs.existsSync(projectIdPath)) {
      const uuid = idGenerator.generate();
      fs.writeFileSync(projectIdPath, uuid, "utf8");
    }
  }
  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
  ensurePrettierignore(projectRoot);
  ensureEslintignore(projectRoot);
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
