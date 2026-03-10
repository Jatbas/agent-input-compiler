// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { FileTransformStore } from "@jatbas/aic-core/core/interfaces/file-transform-store.interface.js";
import type { CachedFileTransform } from "@jatbas/aic-core/core/types/file-transform-types.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { AbsolutePath, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount, type TokenCount } from "@jatbas/aic-core/core/types/units.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";
import {
  isoToSqliteDatetime,
  sqliteDatetimeToIso,
} from "@jatbas/aic-core/storage/sqlite-datetime.js";

interface TierOutputsRow {
  readonly content: string;
  readonly tokens: number;
}

interface TierOutputsParsed {
  readonly [INCLUSION_TIER.L0]: TierOutputsRow;
  readonly [INCLUSION_TIER.L1]: TierOutputsRow;
  readonly [INCLUSION_TIER.L2]: TierOutputsRow;
  readonly [INCLUSION_TIER.L3]: TierOutputsRow;
}

function parseTierOutputs(
  json: string,
): Readonly<Record<InclusionTier, { content: string; tokens: TokenCount }>> {
  const parsed = JSON.parse(json) as TierOutputsParsed;
  return {
    [INCLUSION_TIER.L0]: {
      content: parsed[INCLUSION_TIER.L0].content,
      tokens: toTokenCount(parsed[INCLUSION_TIER.L0].tokens),
    },
    [INCLUSION_TIER.L1]: {
      content: parsed[INCLUSION_TIER.L1].content,
      tokens: toTokenCount(parsed[INCLUSION_TIER.L1].tokens),
    },
    [INCLUSION_TIER.L2]: {
      content: parsed[INCLUSION_TIER.L2].content,
      tokens: toTokenCount(parsed[INCLUSION_TIER.L2].tokens),
    },
    [INCLUSION_TIER.L3]: {
      content: parsed[INCLUSION_TIER.L3].content,
      tokens: toTokenCount(parsed[INCLUSION_TIER.L3].tokens),
    },
  };
}

function serializeTierOutputs(
  tierOutputs: Readonly<Record<InclusionTier, { content: string; tokens: TokenCount }>>,
): string {
  return JSON.stringify({
    [INCLUSION_TIER.L0]: {
      content: tierOutputs[INCLUSION_TIER.L0].content,
      tokens: tierOutputs[INCLUSION_TIER.L0].tokens,
    },
    [INCLUSION_TIER.L1]: {
      content: tierOutputs[INCLUSION_TIER.L1].content,
      tokens: tierOutputs[INCLUSION_TIER.L1].tokens,
    },
    [INCLUSION_TIER.L2]: {
      content: tierOutputs[INCLUSION_TIER.L2].content,
      tokens: tierOutputs[INCLUSION_TIER.L2].tokens,
    },
    [INCLUSION_TIER.L3]: {
      content: tierOutputs[INCLUSION_TIER.L3].content,
      tokens: tierOutputs[INCLUSION_TIER.L3].tokens,
    },
  });
}

type FileTransformRow = {
  readonly file_path: string;
  readonly content_hash: string;
  readonly transformed_content: string;
  readonly tier_outputs_json: string;
  readonly created_at: string;
  readonly expires_at: string;
};

export class SqliteFileTransformStore implements FileTransformStore {
  constructor(
    private readonly projectRoot: AbsolutePath,
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}

  get(filePath: RelativePath, contentHash: string): CachedFileTransform | null {
    const nowSql = isoToSqliteDatetime(this.clock.now());
    const rows = this.db
      .prepare(
        "SELECT file_path, content_hash, transformed_content, tier_outputs_json, created_at, expires_at FROM file_transform_cache WHERE file_path = ? AND content_hash = ? AND expires_at > ?",
      )
      .all(filePath, contentHash, nowSql) as readonly FileTransformRow[];
    const row = rows[0];
    if (row === undefined) return null;
    return {
      filePath: toRelativePath(row.file_path),
      contentHash: row.content_hash,
      transformedContent: row.transformed_content,
      tierOutputs: parseTierOutputs(row.tier_outputs_json),
      createdAt: sqliteDatetimeToIso(row.created_at),
      expiresAt: sqliteDatetimeToIso(row.expires_at),
    };
  }

  set(entry: CachedFileTransform): void {
    const tierOutputsJson = serializeTierOutputs(entry.tierOutputs);
    const createdSql = isoToSqliteDatetime(entry.createdAt);
    const expiresSql = isoToSqliteDatetime(entry.expiresAt);
    this.db
      .prepare(
        "INSERT OR REPLACE INTO file_transform_cache (file_path, content_hash, transformed_content, tier_outputs_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        entry.filePath,
        entry.contentHash,
        entry.transformedContent,
        tierOutputsJson,
        createdSql,
        expiresSql,
      );
  }

  invalidate(filePath: RelativePath): void {
    this.db.prepare("DELETE FROM file_transform_cache WHERE file_path = ?").run(filePath);
  }

  purgeExpired(): void {
    const nowSql = isoToSqliteDatetime(this.clock.now());
    this.db.prepare("DELETE FROM file_transform_cache WHERE expires_at <= ?").run(nowSql);
  }
}
