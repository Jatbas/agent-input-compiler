// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  realpathSync,
} from "node:fs";

function findRepoRootForIgnoreJson(startDir: string): string {
  let dir = startDir;
  for (;;) {
    const sharedPath = join(dir, "shared", "src", "storage", "aic-ignore-entries.json");
    const intPath = join(dir, "integrations", "shared", "aic-ignore-entries.json");
    if (existsSync(sharedPath) && existsSync(intPath)) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new ConfigError("repo root not found for ignore json sync test");
    }
    dir = parent;
  }
}
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir, platform } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import {
  AIC_IGNORE_ENTRIES,
  ensureAicDir,
  ensureEslintignore,
  ensurePrettierignore,
} from "../ensure-aic-dir.js";

const EXPECTED_GITIGNORE_CONTENT = AIC_IGNORE_ENTRIES.map((e) => `${e}\n`).join("");

describe("ensureAicDir", () => {
  it("aic_ignore_json_matches_integrations_copy", () => {
    const root = findRepoRootForIgnoreJson(dirname(fileURLToPath(import.meta.url)));
    const sharedJson = readFileSync(
      join(root, "shared", "src", "storage", "aic-ignore-entries.json"),
      "utf8",
    );
    const integrationsJson = readFileSync(
      join(root, "integrations", "shared", "aic-ignore-entries.json"),
      "utf8",
    );
    expect(sharedJson).toBe(integrationsJson);
  });

  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function makeTmpDir(): string {
    return mkdtempSync(join(realpathSync(tmpdir()), "aic-test-gitignore-"));
  }

  it("creates .aic directory with 0700 permissions", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    ensureAicDir(toAbsolutePath(tmp));
    const aicPath = join(tmp, ".aic");
    expect(existsSync(aicPath)).toBe(true);
    if (platform() !== "win32") {
      const mode = statSync(aicPath).mode & 0o777;
      expect(mode).toBe(0o700);
    }
  });

  it("creates .gitignore with all AIC entries when no .gitignore exists", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toBe(EXPECTED_GITIGNORE_CONTENT);
  });

  it("appends missing AIC entries to existing .gitignore", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(join(tmp, ".gitignore"), "node_modules/\n", "utf8");
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toBe(`node_modules/\n${EXPECTED_GITIGNORE_CONTENT}`);
  });

  it("appends with newline separator when file does not end with newline", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(join(tmp, ".gitignore"), "node_modules/", "utf8");
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toBe(`node_modules/\n${EXPECTED_GITIGNORE_CONTENT}`);
  });

  it("does not duplicate when .aic/ already present", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(join(tmp, ".gitignore"), "node_modules/\n.aic/\n", "utf8");
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    const rest = AIC_IGNORE_ENTRIES.slice(1)
      .map((e) => `${e}\n`)
      .join("");
    expect(content).toBe(`node_modules/\n.aic/\n${rest}`);
  });

  it("does not duplicate when .aic (without slash) already present", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(join(tmp, ".gitignore"), ".aic\ndist/\n", "utf8");
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    const rest = AIC_IGNORE_ENTRIES.slice(1)
      .map((e) => `${e}\n`)
      .join("");
    expect(content).toBe(`.aic\ndist/\n${rest}`);
  });

  it("ensure_aic_dir_negation_appends", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(
      join(tmp, ".gitignore"),
      "node_modules/\n.cursor/hooks/AIC-*.cjs\n",
      "utf8",
    );
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toContain("!.cursor/hooks/aic-dir.cjs");
    const lines = content.split("\n");
    const aicIdx = lines.findIndex((line) => line.trim() === ".cursor/hooks/AIC-*.cjs");
    const negIdx = lines.findIndex(
      (line) => line.trim() === "!.cursor/hooks/aic-dir.cjs",
    );
    expect(aicIdx).toBeGreaterThanOrEqual(0);
    expect(negIdx).toBeGreaterThanOrEqual(0);
    expect(aicIdx).toBeLessThan(negIdx);
  });

  it("is idempotent on repeated calls", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    ensureAicDir(toAbsolutePath(tmp));
    ensureAicDir(toAbsolutePath(tmp));
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toBe(EXPECTED_GITIGNORE_CONTENT);
  });
});

describe("ensurePrettierignore", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function makeTmpDir(): string {
    return mkdtempSync(join(realpathSync(tmpdir()), "aic-test-prettierignore-"));
  }

  it("creates .prettierignore with all AIC entries when missing", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    ensurePrettierignore(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".prettierignore"), "utf8");
    expect(content).toBe(EXPECTED_GITIGNORE_CONTENT);
  });

  it("appends missing AIC entries to existing .prettierignore", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(join(tmp, ".prettierignore"), "dist/\n", "utf8");
    ensurePrettierignore(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".prettierignore"), "utf8");
    expect(content).toBe(`dist/\n${EXPECTED_GITIGNORE_CONTENT}`);
  });
});

describe("ensureEslintignore", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function makeTmpDir(): string {
    return mkdtempSync(join(realpathSync(tmpdir()), "aic-test-eslintignore-"));
  }

  it("creates .eslintignore with all AIC entries when missing", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    ensureEslintignore(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".eslintignore"), "utf8");
    expect(content).toBe(EXPECTED_GITIGNORE_CONTENT);
  });

  it("appends missing AIC entries to existing .eslintignore", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(join(tmp, ".eslintignore"), "build/\n", "utf8");
    ensureEslintignore(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".eslintignore"), "utf8");
    expect(content).toBe(`build/\n${EXPECTED_GITIGNORE_CONTENT}`);
  });
});
