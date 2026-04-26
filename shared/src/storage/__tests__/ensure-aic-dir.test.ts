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
  symlinkSync,
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
  getContainedProjectAicRootIfPresent,
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

  it("rejects_symlinked_aic_outside_project", () => {
    if (platform() === "win32") return;
    const project = mkdtempSync(join(realpathSync(tmpdir()), "aic-symlink-proj-"));
    const external = mkdtempSync(join(realpathSync(tmpdir()), "aic-symlink-ext-"));
    dirs[dirs.length] = project;
    dirs[dirs.length] = external;
    symlinkSync(external, join(project, ".aic"), "dir");
    expect(() => ensureAicDir(toAbsolutePath(project))).toThrow(ConfigError);
  });

  it("getContainedProjectAicRootIfPresent_returns_null_when_no_aic", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    expect(getContainedProjectAicRootIfPresent(toAbsolutePath(tmp))).toBe(null);
  });

  it("getContainedProjectAicRootIfPresent_rejects_symlinked_aic_outside_project", () => {
    if (platform() === "win32") return;
    const project = mkdtempSync(join(realpathSync(tmpdir()), "aic-get-contained-proj-"));
    const external = mkdtempSync(join(realpathSync(tmpdir()), "aic-get-contained-ext-"));
    dirs[dirs.length] = project;
    dirs[dirs.length] = external;
    symlinkSync(external, join(project, ".aic"), "dir");
    expect(() => getContainedProjectAicRootIfPresent(toAbsolutePath(project))).toThrow(
      ConfigError,
    );
  });

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

  it("ensure_aic_dir_does_not_append_dir_negation", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(join(tmp, ".gitignore"), "node_modules/\n", "utf8");
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).not.toContain("!.cursor/hooks/AIC-dir.cjs");
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

  it("skips aic.config.json in gitignore when devMode is true", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(
      join(tmp, "aic.config.json"),
      JSON.stringify({ contextBudget: { maxTokens: 8000 }, devMode: true }),
      "utf8",
    );
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).not.toContain("aic.config.json");
    expect(content).toContain(".aic/");
  });

  it("includes aic.config.json in gitignore when devMode is false", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(
      join(tmp, "aic.config.json"),
      JSON.stringify({ contextBudget: { maxTokens: 8000 }, devMode: false }),
      "utf8",
    );
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toContain("aic.config.json");
  });

  it("includes aic.config.json in gitignore when no config file exists", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toContain("aic.config.json");
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
