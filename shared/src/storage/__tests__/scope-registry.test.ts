// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { AicError } from "../../core/errors/aic-error.js";
import type { ProjectRootNormaliser } from "../../core/interfaces/project-root-normaliser.interface.js";
import { toAbsolutePath } from "../../core/types/paths.js";
import type { AbsolutePath } from "../../core/types/paths.js";
import { ScopeRegistry } from "../scope-registry.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "aic-scope-registry-"));
}

describe("ScopeRegistry", () => {
  let tmpDirA: string;
  let tmpDirB: string;

  afterEach(() => {
    if (tmpDirA) rmSync(tmpDirA, { recursive: true, force: true });
    if (tmpDirB) rmSync(tmpDirB, { recursive: true, force: true });
  });

  it("same_path_same_instance", () => {
    tmpDirA = makeTempDir();
    const pathA = toAbsolutePath(tmpDirA);
    const normaliser: ProjectRootNormaliser = {
      normalise(raw: string): AbsolutePath {
        return toAbsolutePath(raw);
      },
    };
    const registry = new ScopeRegistry(normaliser);
    const scope1 = registry.getOrCreate(pathA);
    const scope2 = registry.getOrCreate(pathA);
    expect(scope2).toBe(scope1);
    registry.close();
  });

  it("different_paths_different_instances", () => {
    tmpDirA = makeTempDir();
    tmpDirB = makeTempDir();
    const pathA = toAbsolutePath(tmpDirA);
    const pathB = toAbsolutePath(tmpDirB);
    const normaliser: ProjectRootNormaliser = {
      normalise(raw: string): AbsolutePath {
        return toAbsolutePath(raw);
      },
    };
    const registry = new ScopeRegistry(normaliser);
    const scopeA = registry.getOrCreate(pathA);
    const scopeB = registry.getOrCreate(pathB);
    expect(scopeB).not.toBe(scopeA);
    registry.close();
  });

  it("normalisation_trailing_slash", () => {
    tmpDirA = makeTempDir();
    const pathNoSlash = toAbsolutePath(tmpDirA);
    const pathWithSlash = toAbsolutePath(tmpDirA + "/");
    const normaliser: ProjectRootNormaliser = {
      normalise(raw: string): AbsolutePath {
        return toAbsolutePath(raw.replace(/\/$/, ""));
      },
    };
    const registry = new ScopeRegistry(normaliser);
    const scope1 = registry.getOrCreate(pathNoSlash);
    const scope2 = registry.getOrCreate(pathWithSlash);
    expect(scope2).toBe(scope1);
    registry.close();
  });

  it("normalisation_drive_letter", () => {
    tmpDirA = makeTempDir();
    tmpDirB = makeTempDir();
    const pathA = toAbsolutePath(tmpDirA);
    const pathB = toAbsolutePath(tmpDirB);
    const normaliser: ProjectRootNormaliser = {
      normalise(): AbsolutePath {
        return pathA;
      },
    };
    const registry = new ScopeRegistry(normaliser);
    const scope1 = registry.getOrCreate(pathA);
    const scope2 = registry.getOrCreate(pathB);
    expect(scope2).toBe(scope1);
    registry.close();
  });

  it("close_releases_scopes", () => {
    tmpDirA = makeTempDir();
    tmpDirB = makeTempDir();
    const pathA = toAbsolutePath(tmpDirA);
    const pathB = toAbsolutePath(tmpDirB);
    const normaliser: ProjectRootNormaliser = {
      normalise(raw: string): AbsolutePath {
        return toAbsolutePath(raw);
      },
    };
    const registry = new ScopeRegistry(normaliser);
    const scope1 = registry.getOrCreate(pathA);
    registry.getOrCreate(pathB);
    registry.close();
    const scope2 = registry.getOrCreate(pathA);
    expect(scope2).not.toBe(scope1);
    const rows = scope2.db.prepare("SELECT 1 as one").all() as { one: number }[];
    expect(rows).toHaveLength(1);
    const first = rows[0];
    if (first === undefined) throw new AicError("expected one row", "TEST_SETUP");
    expect(first.one).toBe(1);
    registry.close();
  });
});
