// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect } from "vitest";
import {
  pickFirstNonHomeRootFromList,
  resolveSyncMcpPrimaryProjectRoot,
} from "../resolve-mcp-compile-project-root.js";

describe("resolveSyncMcpPrimaryProjectRoot_cursor_dir", () => {
  it("prefers CURSOR_PROJECT_DIR over home cwd", () => {
    const home = os.homedir();
    const proj = path.join(home, "proj");
    const env = { CURSOR_PROJECT_DIR: proj } as NodeJS.ProcessEnv;
    const result = resolveSyncMcpPrimaryProjectRoot(home, env, home);
    expect(result).toBe(path.resolve(proj));
  });
});

describe("resolveSyncMcpPrimaryProjectRoot_fallback_cwd", () => {
  it("returns cwd when env unset", () => {
    const home = os.homedir();
    const env = {} as NodeJS.ProcessEnv;
    const result = resolveSyncMcpPrimaryProjectRoot(home, env, home);
    expect(result).toBe(path.resolve(home));
  });
});

describe("pickFirstNonHomeRootFromList_skips_home", () => {
  it("returns first path that is not home", () => {
    const home = os.homedir();
    const proj = path.join(home, "my-workspace");
    const result = pickFirstNonHomeRootFromList([home, proj], home);
    expect(result).toBe(path.resolve(proj));
  });
});
