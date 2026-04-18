// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SpecCompileCacheStore } from "@jatbas/aic-core/core/interfaces/spec-compile-cache-store.interface.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type {
  SpecCompileCacheEntry,
  SpecInclusionTier,
} from "@jatbas/aic-core/core/types/specification-compilation.types.js";
import {
  isoToSqliteDatetime,
  sqliteDatetimeToIso,
} from "@jatbas/aic-core/storage/sqlite-datetime.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toPercentage } from "@jatbas/aic-core/core/types/scores.js";

type SpecCompileCacheRow = {
  readonly compiled_spec: string;
  readonly meta_json: string;
  readonly created_at: string;
  readonly expires_at: string;
};

function isSpecInclusionTier(value: unknown): value is SpecInclusionTier {
  return value === "verbatim" || value === "signature-path" || value === "path-only";
}

function parseTypeTiers(
  value: unknown,
): Readonly<Record<string, SpecInclusionTier>> | null {
  if (typeof value !== "object" || value === null) return null;
  return Object.entries(value).reduce<Readonly<Record<string, SpecInclusionTier>> | null>(
    (acc, [key, tierValue]) => {
      if (acc === null) return null;
      if (!isSpecInclusionTier(tierValue)) return null;
      return { ...acc, [key]: tierValue };
    },
    {},
  );
}

function parseJsonValue(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function parseMetaJson(json: string): SpecCompileCacheEntry["meta"] | null {
  const parsed = parseJsonValue(json);
  if (!parsed.ok) return null;
  const data = parsed.value;
  if (typeof data !== "object" || data === null) return null;
  const fields = Object.fromEntries(
    Object.entries(data).map(([key, value]): [string, unknown] => [key, value]),
  );
  const totalTokensRaw = fields["totalTokensRaw"];
  const totalTokensCompiled = fields["totalTokensCompiled"];
  const reductionPct = fields["reductionPct"];
  const typeTiers = fields["typeTiers"];
  const transformTokensSaved = fields["transformTokensSaved"];
  if (typeof totalTokensRaw !== "number") return null;
  if (typeof totalTokensCompiled !== "number") return null;
  if (typeof reductionPct !== "number") return null;
  if (typeof transformTokensSaved !== "number") return null;
  const parsedTiers = parseTypeTiers(typeTiers);
  if (parsedTiers === null) return null;
  return {
    totalTokensRaw: toTokenCount(totalTokensRaw),
    totalTokensCompiled: toTokenCount(totalTokensCompiled),
    reductionPct: toPercentage(reductionPct),
    typeTiers: parsedTiers,
    transformTokensSaved: toTokenCount(transformTokensSaved),
  };
}

export class SqliteSpecCompileCacheStore implements SpecCompileCacheStore {
  constructor(
    private readonly projectId: ProjectId,
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}

  get(cacheKey: string): SpecCompileCacheEntry | null {
    const nowSql = isoToSqliteDatetime(this.clock.now());
    const rows = this.db
      .prepare(
        "SELECT compiled_spec, meta_json, created_at, expires_at FROM spec_compile_cache WHERE cache_key = ? AND project_id = ? AND expires_at > ?",
      )
      .all(cacheKey, this.projectId, nowSql) as readonly SpecCompileCacheRow[];
    const row = rows[0];
    if (row === undefined) return null;
    const meta = parseMetaJson(row.meta_json);
    if (meta === null) return null;
    return {
      cacheKey,
      compiledSpec: row.compiled_spec,
      meta,
      createdAt: sqliteDatetimeToIso(row.created_at),
      expiresAt: sqliteDatetimeToIso(row.expires_at),
    };
  }

  set(entry: SpecCompileCacheEntry): void {
    const metaJson = JSON.stringify({
      totalTokensRaw: entry.meta.totalTokensRaw,
      totalTokensCompiled: entry.meta.totalTokensCompiled,
      reductionPct: entry.meta.reductionPct,
      typeTiers: entry.meta.typeTiers,
      transformTokensSaved: entry.meta.transformTokensSaved,
    });
    this.db
      .prepare(
        "INSERT OR REPLACE INTO spec_compile_cache (cache_key, project_id, compiled_spec, meta_json, created_at, expires_at) VALUES (?,?,?,?,?,?)",
      )
      .run(
        entry.cacheKey,
        this.projectId,
        entry.compiledSpec,
        metaJson,
        isoToSqliteDatetime(entry.createdAt),
        isoToSqliteDatetime(entry.expiresAt),
      );
  }

  invalidate(cacheKey: string): void {
    this.db
      .prepare("DELETE FROM spec_compile_cache WHERE cache_key = ? AND project_id = ?")
      .run(cacheKey, this.projectId);
  }

  purgeExpired(): void {
    const nowSql = isoToSqliteDatetime(this.clock.now());
    this.db
      .prepare("DELETE FROM spec_compile_cache WHERE expires_at <= ? AND project_id = ?")
      .run(nowSql, this.projectId);
  }
}
