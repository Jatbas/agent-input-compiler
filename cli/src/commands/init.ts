import * as fs from "node:fs";
import * as path from "node:path";
import type { InitArgs } from "@aic/cli/schemas/init-args.js";
import { InitArgsSchema } from "@aic/cli/schemas/init-args.js";
import { handleCommandError } from "@aic/cli/utils/handle-command-error.js";
import { ConfigError } from "@aic/shared/core/errors/config-error.js";

const CURRENT_CONFIG_SCHEMA_VERSION = 1;

const DEFAULT_CONFIG = {
  version: 1,
  contextBudget: { maxTokens: 8000 },
} as const;

function hasAicIgnoreLine(content: string): boolean {
  const lines = content.split("\n").map((line) => line.trim());
  return lines.some((line) => line === ".aic/" || line === ".aic");
}

export async function initCommand(args: InitArgs): Promise<void> {
  try {
    InitArgsSchema.parse(args);
    await Promise.resolve();
    const configPath = path.join(args.projectRoot, "aic.config.json");
    const aicDir = path.join(args.projectRoot, ".aic");
    const gitignorePath = path.join(args.projectRoot, ".gitignore");

    if (args.upgrade === true) {
      if (!fs.existsSync(configPath)) {
        handleCommandError(
          new ConfigError("Config file not found. Run 'aic init' first."),
        );
      }
      const content = fs.readFileSync(configPath, "utf8");
      const parsed = JSON.parse(content) as {
        version?: number;
        contextBudget?: { maxTokens: number };
      };
      const oldVersion = parsed.version ?? 0;
      fs.writeFileSync(configPath + ".bak", content, "utf8");
      const upgraded = {
        version: CURRENT_CONFIG_SCHEMA_VERSION,
        contextBudget: parsed.contextBudget ?? { maxTokens: 8000 },
      };
      fs.writeFileSync(configPath, JSON.stringify(upgraded, null, 2), "utf8");
      process.stdout.write(
        `Config upgraded from schema v${oldVersion} to v${CURRENT_CONFIG_SCHEMA_VERSION}. Backup saved to aic.config.json.bak.\n`,
      );
      return;
    }

    if (fs.existsSync(configPath)) {
      process.stderr.write(
        "Config already exists. Use 'aic init --upgrade' to migrate to the current schema version.\n",
      );
      handleCommandError(
        new ConfigError("Config already exists. Use 'aic init --upgrade' to migrate."),
      );
    }

    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, ".aic/\n", "utf8");
    } else {
      const content = fs.readFileSync(gitignorePath, "utf8");
      if (!hasAicIgnoreLine(content)) {
        fs.writeFileSync(gitignorePath, content + "\n.aic/\n", "utf8");
      }
    }
    process.stdout.write(
      "Created aic.config.json. Edit to customise, or run 'aic compile' to use defaults.\n",
    );
  } catch (err) {
    handleCommandError(err);
  }
}
