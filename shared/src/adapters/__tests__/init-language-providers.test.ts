// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { IgnoreAdapter } from "../ignore-adapter.js";
import { initLanguageProviders } from "../init-language-providers.js";

describe("init-language-providers", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir !== undefined && tmpDir !== "") {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("extension_scan_respects_gitignore", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-init-lang-"));
    const projectRoot = toAbsolutePath(tmpDir);
    writeFileSync(join(tmpDir, ".gitignore"), "venv/\n");
    mkdirSync(join(tmpDir, "venv"), { recursive: true });
    writeFileSync(join(tmpDir, "venv", "foo.py"), "x = 1\n");
    const result = await initLanguageProviders(projectRoot, new IgnoreAdapter());
    const pythonProviders = result.filter((p) => p.id === "python");
    expect(pythonProviders.length).toBe(0);
  }, 30_000);
});
