// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const { MCP_INTENT_OMITTED_DEFAULT } = require("./mcp-intent-omitted-default.cjs");

const WEAK_SUBAGENT_PREFIXES = ["provide context for"];

function isWeakAicCompileIntent(raw) {
  if (typeof raw !== "string") return true;
  const t = raw.trim();
  if (t.length === 0) return true;
  if (WEAK_SUBAGENT_PREFIXES.some((p) => t.startsWith(p))) return true;
  return t === MCP_INTENT_OMITTED_DEFAULT;
}

module.exports = { isWeakAicCompileIntent };
