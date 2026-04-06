// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("path");

function resolveProjectRoot(parsed, options) {
  const opts = options ?? {};
  const env = opts.env ?? process.env;
  const toolInputOverride =
    opts.toolInputOverride != null ? String(opts.toolInputOverride).trim() : "";
  const useAicProjectRoot = opts.useAicProjectRoot === true;

  const isCursor = parsed == null || Object.prototype.hasOwnProperty.call(opts, "env");
  if (isCursor) {
    const cursorDir =
      env.CURSOR_PROJECT_DIR != null && String(env.CURSOR_PROJECT_DIR).trim() !== ""
        ? String(env.CURSOR_PROJECT_DIR).trim()
        : "";
    const aicRoot =
      useAicProjectRoot &&
      env.AIC_PROJECT_ROOT != null &&
      String(env.AIC_PROJECT_ROOT).trim() !== ""
        ? String(env.AIC_PROJECT_ROOT).trim()
        : "";
    const raw = toolInputOverride || cursorDir || aicRoot || process.cwd();
    return path.resolve(raw);
  }

  const cwdRaw = (parsed?.cwd ?? parsed?.input?.cwd ?? "").trim();
  const fromParsed = (toolInputOverride || cwdRaw).trim();
  const claudeDir =
    env.CLAUDE_PROJECT_DIR != null && String(env.CLAUDE_PROJECT_DIR).trim() !== ""
      ? String(env.CLAUDE_PROJECT_DIR).trim()
      : "";
  const raw = fromParsed || claudeDir || process.cwd();
  return path.resolve(raw);
}

module.exports = { resolveProjectRoot };
