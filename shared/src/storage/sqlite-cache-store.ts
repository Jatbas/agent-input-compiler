// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import type { CacheStore } from "@jatbas/aic-core/core/interfaces/cache-store.interface.js";
import type { CachedCompilation } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import {
  isoToSqliteDatetime,
  sqliteDatetimeToIso,
} from "@jatbas/aic-core/storage/sqlite-datetime.js";

function safeBlobFilename(key: string): string {
  const base64 = Buffer.from(key, "utf8").toString("base64");
  const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${base64url}.json`;
}

interface BlobPayload {
  readonly compiledPrompt: string;
  readonly tokenCount: number;
  readonly configHash: string;
  readonly filesSelected: number;
}

function blobPath(cacheDir: AbsolutePath, key: string): string {
  return path.join(cacheDir, safeBlobFilename(key));
}

function readBlobFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBlobPayload(raw: string): BlobPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const rec: Record<string, unknown> = isPlainRecord(parsed) ? parsed : {};
    const rawFs = rec["filesSelected"];
    const filesSelected = typeof rawFs === "number" && Number.isFinite(rawFs) ? rawFs : 0;
    const compiledPrompt = rec["compiledPrompt"];
    const tokenCountRaw = rec["tokenCount"];
    const configHash = rec["configHash"];
    if (typeof compiledPrompt !== "string" || typeof configHash !== "string") {
      return null;
    }
    if (typeof tokenCountRaw !== "number" || !Number.isFinite(tokenCountRaw)) {
      return null;
    }
    return {
      compiledPrompt,
      tokenCount: tokenCountRaw,
      configHash,
      filesSelected,
    };
  } catch {
    return null;
  }
}

export class SqliteCacheStore implements CacheStore {
  constructor(
    private readonly projectId: ProjectId,
    private readonly db: ExecutableDb,
    private readonly cacheDir: AbsolutePath,
    private readonly clock: Clock,
  ) {}

  get(key: string): CachedCompilation | null {
    const nowSql = isoToSqliteDatetime(this.clock.now());
    const rows = this.db
      .prepare(
        "SELECT cache_key, file_path, file_tree_hash, created_at, expires_at FROM cache_metadata WHERE cache_key = ? AND expires_at > ? AND project_id = ?",
      )
      .all(key, nowSql, this.projectId) as readonly {
      cache_key: string;
      file_path: string;
      file_tree_hash: string;
      created_at: string;
      expires_at: string;
    }[];
    const row = rows[0];
    if (row === undefined) {
      this.deleteStaleEntryForKey(key);
      return null;
    }
    const raw = readBlobFile(row.file_path);
    if (raw === null) return null;
    const payload = parseBlobPayload(raw);
    if (payload === null) return null;
    return {
      key: row.cache_key,
      compiledPrompt: payload.compiledPrompt,
      tokenCount: toTokenCount(payload.tokenCount),
      createdAt: sqliteDatetimeToIso(row.created_at),
      expiresAt: sqliteDatetimeToIso(row.expires_at),
      fileTreeHash: row.file_tree_hash,
      configHash: payload.configHash,
      filesSelected: payload.filesSelected,
    };
  }

  private deleteRowAndBlobForKey(key: string): void {
    const rows = this.db
      .prepare(
        "SELECT file_path FROM cache_metadata WHERE cache_key = ? AND project_id = ?",
      )
      .all(key, this.projectId) as readonly { file_path: string }[];
    this.db
      .prepare("DELETE FROM cache_metadata WHERE cache_key = ? AND project_id = ?")
      .run(key, this.projectId);
    const row = rows[0];
    if (row !== undefined) {
      try {
        fs.unlinkSync(row.file_path);
      } catch {
        // Blob may already be missing
      }
    }
  }

  private deleteStaleEntryForKey(key: string): void {
    this.deleteRowAndBlobForKey(key);
  }

  set(entry: CachedCompilation): void {
    const filePath = blobPath(this.cacheDir, entry.key);
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const payload: BlobPayload = {
      compiledPrompt: entry.compiledPrompt,
      tokenCount: entry.tokenCount,
      configHash: entry.configHash,
      filesSelected: entry.filesSelected,
    };
    fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
    const createdSql = isoToSqliteDatetime(entry.createdAt);
    const expiresSql = isoToSqliteDatetime(entry.expiresAt);
    this.db
      .prepare(
        "INSERT OR REPLACE INTO cache_metadata (cache_key, file_path, file_tree_hash, created_at, expires_at, project_id) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        entry.key,
        filePath,
        entry.fileTreeHash,
        createdSql,
        expiresSql,
        this.projectId,
      );
  }

  invalidate(key: string): void {
    this.deleteRowAndBlobForKey(key);
  }

  invalidateAll(): void {
    const rows = this.db
      .prepare("SELECT file_path FROM cache_metadata WHERE project_id = ?")
      .all(this.projectId) as readonly { file_path: string }[];
    for (const row of rows) {
      try {
        fs.unlinkSync(row.file_path);
      } catch {
        // Ignore missing files
      }
    }
    this.db
      .prepare("DELETE FROM cache_metadata WHERE project_id = ?")
      .run(this.projectId);
  }

  purgeExpired(): void {
    const nowSql = isoToSqliteDatetime(this.clock.now());
    const snapshot = ((): readonly {
      readonly file_path: string;
      readonly expires_at: string;
    }[] => {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        const snap = this.db
          .prepare(
            "SELECT file_path, expires_at FROM cache_metadata WHERE project_id = ?",
          )
          .all(this.projectId) as readonly {
          readonly file_path: string;
          readonly expires_at: string;
        }[];
        this.db
          .prepare("DELETE FROM cache_metadata WHERE expires_at <= ? AND project_id = ?")
          .run(nowSql, this.projectId);
        this.db.exec("COMMIT");
        return snap;
      } catch (caught: unknown) {
        this.db.exec("ROLLBACK");
        throw caught;
      }
    })();
    const validPaths = new Set(
      snapshot.filter((r) => r.expires_at > nowSql).map((r) => r.file_path),
    );
    const names = fs.readdirSync(this.cacheDir);
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const fullPath = path.join(this.cacheDir, name);
      if (validPaths.has(fullPath)) continue;
      try {
        fs.unlinkSync(fullPath);
      } catch {
        // Race or permission; skip
      }
    }
  }
}
