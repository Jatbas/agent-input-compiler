// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { NodePathAdapter } from "../node-path-adapter.js";

describe("NodePathAdapter", () => {
  const adapter = new NodePathAdapter();

  it("trailing_slash_stripped", () => {
    const withTrailing = path.sep === "\\" ? "C:\\foo\\bar\\" : "/foo/bar/";
    const result = adapter.normalise(withTrailing);
    const s = String(result);
    const isRoot = s === "/" || (path.sep === "\\" && /^[a-z]:\\$/.test(s));
    expect(isRoot || !s.endsWith(path.sep)).toBe(true);
  });

  describe.skipIf(process.platform !== "win32")("windows_drive_lowercased", () => {
    it("windows_drive_lowercased", () => {
      const result = adapter.normalise("C:\\project");
      expect(String(result).startsWith("c:\\")).toBe(true);
    });
  });

  it("already_normalised_unchanged", () => {
    const input = path.sep === "\\" ? "C:\\already\\normal" : "/already/normal";
    const a = adapter.normalise(input);
    const b = adapter.normalise(input);
    expect(a).toBe(b);
  });

  it("root_path_not_stripped", () => {
    expect(adapter.normalise("/")).toBe("/");
    if (path.sep === "\\") {
      expect(adapter.normalise("C:\\")).toBe("c:\\");
    }
  });

  describe.skipIf(process.platform === "win32")("posix_no_op", () => {
    it("posix_no_op", () => {
      const result = adapter.normalise("/home/proj");
      expect(String(result)).toBe("/home/proj");
    });
  });

  describe("git_worktree_resolution", () => {
    let tmpRoot = "";

    beforeEach(() => {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-normaliser-"));
    });

    afterEach(() => {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it("worktree_with_absolute_gitdir_resolves_to_main_repo_root", () => {
      const mainRepo = path.join(tmpRoot, "main");
      const worktree = path.join(tmpRoot, "wt1");
      const mainGitDir = path.join(mainRepo, ".git");
      const worktreeMeta = path.join(mainGitDir, "worktrees", "wt1");
      fs.mkdirSync(worktreeMeta, { recursive: true });
      fs.mkdirSync(worktree, { recursive: true });
      fs.writeFileSync(path.join(worktree, ".git"), `gitdir: ${worktreeMeta}\n`);
      const result = String(adapter.normalise(worktree));
      const expected = String(adapter.normalise(mainRepo));
      expect(result).toBe(expected);
    });

    it("worktree_with_relative_gitdir_resolves_to_main_repo_root", () => {
      const mainRepo = path.join(tmpRoot, "main");
      const worktree = path.join(tmpRoot, "main", ".git-worktrees", "plan-1");
      const mainGitDir = path.join(mainRepo, ".git");
      const worktreeMeta = path.join(mainGitDir, "worktrees", "plan-1");
      fs.mkdirSync(worktreeMeta, { recursive: true });
      fs.mkdirSync(worktree, { recursive: true });
      const rel = path.relative(worktree, worktreeMeta);
      fs.writeFileSync(path.join(worktree, ".git"), `gitdir: ${rel}\n`);
      const result = String(adapter.normalise(worktree));
      const expected = String(adapter.normalise(mainRepo));
      expect(result).toBe(expected);
    });

    it("main_repo_with_git_directory_is_unchanged", () => {
      const mainRepo = path.join(tmpRoot, "main");
      fs.mkdirSync(path.join(mainRepo, ".git"), { recursive: true });
      const result = String(adapter.normalise(mainRepo));
      expect(result).toBe(String(adapter.normalise(mainRepo)));
    });

    it("non_git_project_is_unchanged", () => {
      const proj = path.join(tmpRoot, "plain");
      fs.mkdirSync(proj, { recursive: true });
      const result = String(adapter.normalise(proj));
      expect(result).toBe(String(adapter.normalise(proj)));
    });

    it("malformed_git_file_falls_back_to_raw_path", () => {
      const proj = path.join(tmpRoot, "broken");
      fs.mkdirSync(proj, { recursive: true });
      fs.writeFileSync(path.join(proj, ".git"), "not a gitdir pointer\n");
      const result = String(adapter.normalise(proj));
      expect(result).toBe(String(adapter.normalise(proj)));
    });

    it("git_file_pointing_outside_worktrees_subtree_falls_back_to_raw_path", () => {
      const proj = path.join(tmpRoot, "submodule-like");
      fs.mkdirSync(proj, { recursive: true });
      fs.writeFileSync(
        path.join(proj, ".git"),
        `gitdir: ${path.join(tmpRoot, "somewhere", "modules", "sub")}\n`,
      );
      const result = String(adapter.normalise(proj));
      expect(result).toBe(String(adapter.normalise(proj)));
    });
  });
});
