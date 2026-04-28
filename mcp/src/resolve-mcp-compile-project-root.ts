// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";

// Candidate order matches integrations/shared/resolve-project-root.cjs (Cursor branch: CURSOR_PROJECT_DIR then AIC_PROJECT_ROOT then cwd).

function trimEnvValue(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (v === undefined) {
    return "";
  }
  return String(v).trim();
}

function resolveNonHome(candidate: string, homeResolved: string): string | null {
  if (candidate === "") {
    return null;
  }
  const resolved = path.resolve(candidate);
  return resolved === homeResolved ? null : resolved;
}

export function resolveSyncMcpPrimaryProjectRoot(
  cwd: string,
  env: NodeJS.ProcessEnv,
  homedir: string,
): string {
  const homeResolved = path.resolve(homedir);
  const cursor = resolveNonHome(trimEnvValue(env, "CURSOR_PROJECT_DIR"), homeResolved);
  if (cursor !== null) return cursor;
  const aicRoot = resolveNonHome(trimEnvValue(env, "AIC_PROJECT_ROOT"), homeResolved);
  if (aicRoot !== null) return aicRoot;
  return path.resolve(cwd);
}

export function pickFirstNonHomeRootFromList(
  roots: readonly string[],
  homedir: string,
): string | null {
  const homeResolved = path.resolve(homedir);
  const mapped = roots.map((r) => path.resolve(String(r).trim()));
  const first = mapped.find((resolved) => resolved !== homeResolved);
  return first ?? null;
}
