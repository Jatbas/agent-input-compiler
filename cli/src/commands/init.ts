import * as fs from "node:fs";
import * as path from "node:path";
import type { InitArgs } from "@aic/cli/schemas/init-args.js";
import { InitArgsSchema } from "@aic/cli/schemas/init-args.js";
import { handleCommandError } from "@aic/cli/utils/handle-command-error.js";
import { ConfigError } from "@aic/shared/core/errors/config-error.js";


const DEFAULT_CONFIG = {
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

    if (fs.existsSync(configPath)) {
      process.stderr.write(
        "Config already exists. Edit aic.config.json directly to change settings.\n",
      );
      handleCommandError(
        new ConfigError("Config already exists."),
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
