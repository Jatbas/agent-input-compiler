// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";

// Scan from `const CLAUDE_MD_TEMPLATE = ` through the closing unescaped backtick; treat \` as one literal backtick inside the template body.
function extractClaudeMdTemplateFromSource(source: string): string {
  const needle = "const CLAUDE_MD_TEMPLATE = `";
  const start = source.indexOf(needle);
  if (start < 0) {
    throw new ConfigError("CLAUDE_MD_TEMPLATE assignment not found");
  }
  let i = start + needle.length;
  let out = "";
  while (i < source.length) {
    const c = source[i];
    if (c === "\\" && source[i + 1] === "`") {
      out += "`";
      i += 2;
      continue;
    }
    if (c === "`") {
      break;
    }
    out += c;
    i += 1;
  }
  return out.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    const snap = path.join(dir, "integrations", "shared", "claude-md-canonical-body.txt");
    const trigger = path.join(dir, "mcp", "src", "install-trigger-rule.ts");
    if (fs.existsSync(snap) && fs.existsSync(trigger)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new ConfigError("repo root not found for claude-md drift test");
    }
    dir = parent;
  }
}

describe("claude_md_canonical_body_drift", () => {
  it("claude_md_canonical_body_drift", () => {
    const startDir = path.dirname(fileURLToPath(import.meta.url));
    const root = findRepoRoot(startDir);
    const snapshotPath = path.join(
      root,
      "integrations",
      "shared",
      "claude-md-canonical-body.txt",
    );
    const snapshot = fs
      .readFileSync(snapshotPath, "utf8")
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n");
    const installSrc = fs.readFileSync(
      path.join(root, "integrations", "claude", "install.cjs"),
      "utf8",
    );
    const triggerSrc = fs.readFileSync(
      path.join(root, "mcp", "src", "install-trigger-rule.ts"),
      "utf8",
    );
    const fromInstall = extractClaudeMdTemplateFromSource(installSrc);
    const fromTrigger = extractClaudeMdTemplateFromSource(triggerSrc);
    expect(fromInstall).toBe(fromTrigger);
    expect(snapshot).toBe(fromInstall);
  });
});
