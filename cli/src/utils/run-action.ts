import * as path from "node:path";
import type { Command } from "commander";
import { sanitizeError } from "@aic/shared/core/errors/sanitize-error.js";
import { z } from "zod";

export type CliOpts = {
  readonly root?: string;
  readonly config?: string;
  readonly db?: string;
};

export function resolveBaseArgs(opts: CliOpts): {
  readonly projectRoot: string;
  readonly configPath: string | null;
  readonly dbPath: string | null;
} {
  const rootOpt = opts.root ?? process.cwd();
  return {
    projectRoot: path.resolve(rootOpt),
    configPath: opts.config ?? null,
    dbPath: opts.db ?? null,
  };
}

export async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
    process.exit(0);
  } catch (err) {
    if (err instanceof z.ZodError) {
      process.stderr.write(String(err.message));
      process.exit(1);
    }
    process.stderr.write(sanitizeError(err).message);
    process.exit(2);
  }
}

export function createIntentAction<T>(
  schema: { readonly parse: (data: unknown) => T },
  handler: (parsed: T) => Promise<void>,
): (this: Command, intent: string) => Promise<void> {
  return async function (this: Command, intent: string): Promise<void> {
    await runAction(async () => {
      const parsed = schema.parse({
        intent,
        ...resolveBaseArgs(this.opts() as CliOpts),
      });
      await handler(parsed);
    });
  };
}
