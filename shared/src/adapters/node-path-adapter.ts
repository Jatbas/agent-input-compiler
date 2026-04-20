// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import fs from "node:fs";
import path from "node:path";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ProjectRootNormaliser } from "@jatbas/aic-core/core/interfaces/project-root-normaliser.interface.js";

export class NodePathAdapter implements ProjectRootNormaliser {
  constructor() {}

  normalise(raw: string): AbsolutePath {
    const initial = path.resolve(raw);
    const canonical = resolveGitWorktreeMainRoot(initial) ?? initial;
    const resolved = path.resolve(canonical);
    const isRoot =
      resolved === "/" || (path.sep === "\\" && /^[A-Za-z]:\\$/.test(resolved));
    const withoutTrailing =
      isRoot || !resolved.endsWith(path.sep)
        ? resolved
        : resolved.slice(0, -path.sep.length);
    const driveLowered =
      path.sep === "\\" && /^[A-Z]:/.test(withoutTrailing)
        ? withoutTrailing.slice(0, 2).toLowerCase() + withoutTrailing.slice(2)
        : withoutTrailing;
    return toAbsolutePath(driveLowered);
  }
}

// Collapse a git worktree path to its main repo root; returns null for main repos, non-git projects, or malformed pointers.
function resolveGitWorktreeMainRoot(absoluteRoot: string): string | null {
  const gitSentinel = path.join(absoluteRoot, ".git");
  const sentinelStat = safeLstat(gitSentinel);
  if (sentinelStat === null || !sentinelStat.isFile()) return null;
  const content = safeReadText(gitSentinel);
  if (content === null) return null;
  const match = /^gitdir:\s*(.+?)\s*$/m.exec(content);
  if (match === null) return null;
  const gitdirRaw = match[1];
  if (gitdirRaw === undefined || gitdirRaw.length === 0) return null;
  const gitdir = path.resolve(
    path.isAbsolute(gitdirRaw) ? gitdirRaw : path.join(absoluteRoot, gitdirRaw),
  );
  const marker = `${path.sep}.git${path.sep}worktrees${path.sep}`;
  const idx = gitdir.lastIndexOf(marker);
  if (idx === -1) return null;
  const mainGitDir = gitdir.slice(0, idx + `${path.sep}.git`.length);
  const mainGitStat = safeLstat(mainGitDir);
  if (mainGitStat === null || !mainGitStat.isDirectory()) return null;
  return path.dirname(mainGitDir);
}

function safeLstat(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

function safeReadText(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}
