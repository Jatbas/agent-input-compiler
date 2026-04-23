#!/usr/bin/env node
// @ts-check
"use strict";

const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/models";
const OUTPUT_PATH = path.join(
  __dirname,
  "../../shared/src/data/model-context-windows.ts",
);

// Normalized IDs must match this pattern — rejects any character that could break
// out of a TS string literal (quotes, backslashes, newlines, etc.).
const SAFE_ID_RE = /^[a-z0-9][a-z0-9.\-]*[a-z0-9]$/;

function isSafeNormalizedId(id) {
  return SAFE_ID_RE.test(id);
}

// Upper bound guards against absurd values from a compromised API response.
const MAX_CONTEXT_WINDOW = 10_000_000;
// Cap response body to avoid memory exhaustion on a malicious or broken response.
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB

// NORMALIZATION CONTRACT — must match normalizeForLookup in shared/src/core/resolve-display-total-budget.ts exactly:
// 1. Strip first vendor/ prefix if present.
// 2. Strip trailing 8-digit date suffix (-YYYYMMDD) if present.
// 3. Lowercase.
// 4. Reorder claude-{semver}-{role} to claude-{role}-{semver} (handles version-role order from some editors).
// If this logic changes, update resolve-display-total-budget.ts in lockstep.
function stripVendorPrefix(id) {
  const slash = id.indexOf("/");
  return slash !== -1 ? id.slice(slash + 1) : id;
}

function stripDateSuffix(id) {
  return id.replace(/-\d{8}$/, "");
}

function normalizeModelId(id) {
  const base = stripDateSuffix(stripVendorPrefix(id)).toLowerCase();
  const m = /^(claude)-(\d+\.\d+)-([a-z]+)/.exec(base);
  if (m !== null) return `${m[1]}-${m[3]}-${m[2]}`;
  return base;
}

// Filter by vendor of origin on the raw ID (before normalization) so future model
// families from these vendors are captured automatically without editing this script.
// e.g. "anthropic/claude-opus-5-0-20270101" → vendor "anthropic" → included.
const INCLUDE_VENDORS = new Set(["anthropic", "openai", "google"]);

function vendorOf(rawId) {
  const slash = rawId.indexOf("/");
  return slash !== -1 ? rawId.slice(0, slash) : null;
}

function shouldInclude(rawId) {
  const v = vendorOf(rawId);
  return v !== null && INCLUDE_VENDORS.has(v);
}

// Anthropic models that have a native 1M context window (GA, no beta header required).
// All other Anthropic models are capped at CLAUDE_STANDARD_WINDOW because OpenRouter
// data for Anthropic models is unreliable — older models report 1M incorrectly.
const CLAUDE_1M_MODELS = new Set([
  "claude-opus-4.6",
  "claude-opus-4.6-fast",
  "claude-sonnet-4.6",
]);
const CLAUDE_STANDARD_WINDOW = 200000;

function resolveContextWindow(rawId, normalizedId, apiContextLength) {
  if (vendorOf(rawId) !== "anthropic") return apiContextLength;
  return CLAUDE_1M_MODELS.has(normalizedId) ? 1000000 : CLAUDE_STANDARD_WINDOW;
}

function readExistingKeys(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const content = fs.readFileSync(filePath, "utf8");
  const keys = [];
  const re = /"([^"]+)":\s*\d+/g;
  let m;
  while ((m = re.exec(content)) !== null) keys.push(m[1]);
  return new Set(keys);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "aic-release-script/1.0" } }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${String(res.statusCode)} from ${url}`));
          return;
        }
        let totalBytes = 0;
        let data = "";
        res.on("data", (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            res.destroy();
            reject(new Error(`Response exceeded ${MAX_RESPONSE_BYTES} bytes — aborting`));
            return;
          }
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`JSON parse error: ${String(e)}`));
          }
        });
      })
      .on("error", reject);
  });
}

async function fetchAndNormalize(existingKeys) {
  const response = await fetchJson(OPENROUTER_API_URL);
  const models = Array.isArray(response.data) ? response.data : [];
  const result = {};
  const newModels = [];
  for (const model of models) {
    if (typeof model.id !== "string") continue;
    if (!shouldInclude(model.id)) continue;
    const normalizedId = normalizeModelId(model.id);
    if (!isSafeNormalizedId(normalizedId)) {
      console.warn(`[aic-release] SKIP unsafe model id: ${JSON.stringify(model.id)}`);
      continue;
    }
    const contextLength =
      typeof model.context_length === "number" ? model.context_length : 0;
    if (
      !Number.isFinite(contextLength) ||
      !Number.isInteger(contextLength) ||
      contextLength <= 0 ||
      contextLength > MAX_CONTEXT_WINDOW
    )
      continue;
    const window = resolveContextWindow(model.id, normalizedId, contextLength);
    if (result[normalizedId] === undefined || window > result[normalizedId]) {
      result[normalizedId] = window;
      if (!existingKeys.has(normalizedId) && !newModels.includes(normalizedId)) {
        newModels.push(normalizedId);
      }
    }
  }
  return { result, newModels };
}

function buildTsFileContent(windows) {
  const entries = Object.entries(windows)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, size]) => `  "${id}": ${size},`)
    .join("\n");
  return [
    "// SPDX-License-Identifier: Apache-2.0",
    "// Copyright (c) 2025 AIC Contributors",
    "// Updated by mcp/scripts/fetch-model-context-windows.cjs at release time.",
    "export const MODEL_CONTEXT_WINDOWS: Readonly<Record<string, number>> = {",
    entries,
    "} as const;",
    "",
  ].join("\n");
}

function isContentIdentical(filePath, newContent) {
  if (!fs.existsSync(filePath)) return false;
  return fs.readFileSync(filePath, "utf8") === newContent;
}

async function main() {
  console.log("[aic-release] Fetching model context windows from OpenRouter…");
  const existingKeys = readExistingKeys(OUTPUT_PATH);
  const { result: windows, newModels } = await fetchAndNormalize(existingKeys);
  const count = Object.keys(windows).length;
  if (count === 0) {
    console.error(
      "[aic-release] ERROR: OpenRouter returned 0 matching models. Aborting.",
    );
    process.exit(1);
  }
  if (newModels.length > 0) {
    console.log(`[aic-release] NEW models detected (${newModels.length}):`);
    for (const id of newModels) {
      console.log(`  + ${id}: ${windows[id]} tokens`);
    }
  }
  const content = buildTsFileContent(windows);
  if (isContentIdentical(OUTPUT_PATH, content)) {
    console.log(`[aic-release] model-context-windows.ts unchanged (${count} models).`);
    return;
  }
  fs.writeFileSync(OUTPUT_PATH, content, "utf8");
  console.log(`[aic-release] model-context-windows.ts updated (${count} models).`);
}

main().catch((e) => {
  console.error("[aic-release] FAILED:", e.message);
  process.exit(1);
});
