import { AicError } from "@aic/shared/core/errors/aic-error.js";
import { sanitizeError } from "@aic/shared/core/errors/sanitize-error.js";
import { z } from "zod";

export function handleCommandError(err: unknown): never {
  if (err instanceof z.ZodError) {
    process.stderr.write(String(err.message));
    throw err;
  }
  if (err instanceof AicError) {
    const sanitized = sanitizeError(err);
    process.stderr.write(sanitized.message);
    throw err;
  }
  process.stderr.write("Internal error");
  throw err;
}
