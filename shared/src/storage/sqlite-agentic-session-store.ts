// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { AgenticSessionState } from "@jatbas/aic-core/core/interfaces/agentic-session-state.interface.js";
import type { SessionId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { PreviousFile } from "@jatbas/aic-core/core/types/session-dedup-types.js";
import type { SessionStep } from "@jatbas/aic-core/core/types/session-dedup-types.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";
import type { ToolOutput } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toStepIndex, toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { StorageError } from "@jatbas/aic-core/core/errors/storage-error.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";

interface SerializedStep {
  readonly stepIndex: number;
  readonly stepIntent: string | null;
  readonly filesSelected: readonly string[];
  readonly tiers: Readonly<Record<string, string>>;
  readonly tokensCompiled: number;
  readonly toolOutputs: readonly {
    readonly type: string;
    readonly content: string;
    readonly relatedFiles?: readonly string[];
  }[];
  readonly completedAt: string;
}

function serializeStep(step: SessionStep): SerializedStep {
  return {
    stepIndex: Number(step.stepIndex),
    stepIntent: step.stepIntent,
    filesSelected: step.filesSelected.map((p) => p),
    tiers: step.tiers as Record<string, string>,
    tokensCompiled: Number(step.tokensCompiled),
    toolOutputs: step.toolOutputs.map((o) => {
      const base = { type: o.type, content: o.content };
      if (o.relatedFiles !== undefined && o.relatedFiles.length > 0) {
        return { ...base, relatedFiles: o.relatedFiles.map((p) => p) };
      }
      return base;
    }),
    completedAt: step.completedAt,
  };
}

function computeModifiedSince(
  fileLastModified: Readonly<Record<string, ISOTimestamp>> | undefined,
  pathStr: string,
  completedAt: ISOTimestamp,
): boolean {
  if (fileLastModified === undefined) return true;
  const mtime = fileLastModified[pathStr];
  if (mtime === undefined) return true;
  return mtime > completedAt;
}

function deserializeStep(raw: SerializedStep): SessionStep {
  return {
    stepIndex: toStepIndex(raw.stepIndex),
    stepIntent: raw.stepIntent,
    filesSelected: raw.filesSelected.map((p) => toRelativePath(p)),
    tiers: raw.tiers as Readonly<Record<string, InclusionTier>>,
    tokensCompiled: toTokenCount(raw.tokensCompiled),
    toolOutputs: raw.toolOutputs.map((o): ToolOutput => {
      const base: ToolOutput = {
        type: o.type as ToolOutput["type"],
        content: o.content,
      };
      if (o.relatedFiles !== undefined && o.relatedFiles.length > 0) {
        return {
          ...base,
          relatedFiles: o.relatedFiles.map((p) => toRelativePath(p)),
        };
      }
      return base;
    }),
    completedAt: toISOTimestamp(raw.completedAt),
  };
}

export class SqliteAgenticSessionStore implements AgenticSessionState {
  constructor(
    private readonly projectRoot: AbsolutePath,
    private readonly db: ExecutableDb,
  ) {}

  getSteps(sessionId: SessionId): readonly SessionStep[] {
    const rows = this.db
      .prepare("SELECT steps_json FROM session_state WHERE session_id = ?")
      .all(sessionId) as { steps_json: string }[];
    const first = rows[0];
    if (!first) return [];
    const raw = JSON.parse(first.steps_json) as SerializedStep[];
    const steps = raw.map((s) => deserializeStep(s));
    return steps.toSorted((a, b) => Number(a.stepIndex) - Number(b.stepIndex));
  }

  recordStep(sessionId: SessionId, step: SessionStep): void {
    const existing = this.db
      .prepare("SELECT steps_json, created_at FROM session_state WHERE session_id = ?")
      .all(sessionId) as { steps_json: string; created_at: string }[];
    const serialized = serializeStep(step);
    const existingRow = existing[0];
    if (!existingRow) {
      this.db
        .prepare(
          "INSERT INTO session_state (session_id, task_intent, steps_json, created_at, last_activity_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          sessionId,
          step.stepIntent,
          JSON.stringify([serialized]),
          step.completedAt,
          step.completedAt,
        );
    } else {
      const steps = JSON.parse(existingRow.steps_json) as SerializedStep[];
      const appended = [...steps, serialized];
      this.db
        .prepare(
          "UPDATE session_state SET steps_json = ?, last_activity_at = ? WHERE session_id = ?",
        )
        .run(JSON.stringify(appended), step.completedAt, sessionId);
    }
  }

  getPreviouslyShownFiles(
    sessionId: SessionId,
    fileLastModified?: Readonly<Record<string, ISOTimestamp>>,
  ): readonly PreviousFile[] {
    const steps = this.getSteps(sessionId);
    type PathInfo = {
      readonly lastStepIndex: number;
      readonly lastTier: InclusionTier;
      readonly completedAt: ISOTimestamp;
    };
    const byPath = steps.reduce<Record<string, PathInfo>>((acc, step) => {
      const stepIdx = Number(step.stepIndex);
      const info: PathInfo = {
        lastStepIndex: stepIdx,
        lastTier: INCLUSION_TIER.L0,
        completedAt: step.completedAt,
      };
      const fromTiers = Object.entries(step.tiers).reduce<Record<string, PathInfo>>(
        (m, [path, tier]) => ({ ...m, [path]: { ...info, lastTier: tier } }),
        {},
      );
      const fromFiles = step.filesSelected.reduce<Record<string, PathInfo>>(
        (m, p) => ({
          ...m,
          [p]: {
            ...info,
            lastTier: step.tiers[p] ?? INCLUSION_TIER.L0,
          },
        }),
        {},
      );
      return { ...acc, ...fromTiers, ...fromFiles };
    }, {});
    const paths = Object.keys(byPath);
    return paths.map((pathStr): PreviousFile => {
      const info = byPath[pathStr];
      if (info === undefined) throw new StorageError("byPath invariant");
      const modifiedSince = computeModifiedSince(
        fileLastModified,
        pathStr,
        info.completedAt,
      );
      return {
        path: toRelativePath(pathStr),
        lastTier: info.lastTier,
        lastStepIndex: toStepIndex(info.lastStepIndex),
        modifiedSince,
      };
    });
  }
}
