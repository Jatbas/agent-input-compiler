import * as fs from "node:fs";
import * as path from "node:path";
import type { AbsolutePath } from "#core/types/paths.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { toTokenCount } from "#core/types/units.js";
import type { CacheStore } from "#core/interfaces/cache-store.interface.js";
import type { CachedCompilation } from "#core/types/compilation-types.js";
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";

function safeBlobFilename(key: string): string {
  const base64 = Buffer.from(key, "utf8").toString("base64");
  const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${base64url}.json`;
}

interface BlobPayload {
  readonly compiledPrompt: string;
  readonly tokenCount: number;
  readonly configHash: string;
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

function parseBlobPayload(raw: string): BlobPayload | null {
  try {
    return JSON.parse(raw) as BlobPayload;
  } catch {
    return null;
  }
}

export class SqliteCacheStore implements CacheStore {
  constructor(
    private readonly db: ExecutableDb,
    private readonly cacheDir: AbsolutePath,
    private readonly clock: Clock,
  ) {}

  get(key: string): CachedCompilation | null {
    const now = this.clock.now();
    const rows = this.db
      .prepare(
        "SELECT cache_key, file_path, file_tree_hash, created_at, expires_at FROM cache_metadata WHERE cache_key = ? AND expires_at > datetime(?)",
      )
      .all(key, now) as readonly {
      cache_key: string;
      file_path: string;
      file_tree_hash: string;
      created_at: string;
      expires_at: string;
    }[];
    const row = rows[0];
    if (row === undefined) return null;
    const raw = readBlobFile(row.file_path);
    if (raw === null) return null;
    const payload = parseBlobPayload(raw);
    if (payload === null) return null;
    return {
      key: row.cache_key,
      compiledPrompt: payload.compiledPrompt,
      tokenCount: toTokenCount(payload.tokenCount),
      createdAt: toISOTimestamp(row.created_at),
      expiresAt: toISOTimestamp(row.expires_at),
      fileTreeHash: row.file_tree_hash,
      configHash: payload.configHash,
    };
  }

  set(entry: CachedCompilation): void {
    const filePath = blobPath(this.cacheDir, entry.key);
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const payload: BlobPayload = {
      compiledPrompt: entry.compiledPrompt,
      tokenCount: entry.tokenCount,
      configHash: entry.configHash,
    };
    fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
    this.db
      .prepare(
        "INSERT OR REPLACE INTO cache_metadata (cache_key, file_path, file_tree_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(entry.key, filePath, entry.fileTreeHash, entry.createdAt, entry.expiresAt);
  }

  invalidate(key: string): void {
    const rows = this.db
      .prepare("SELECT file_path FROM cache_metadata WHERE cache_key = ?")
      .all(key) as readonly { file_path: string }[];
    this.db.prepare("DELETE FROM cache_metadata WHERE cache_key = ?").run(key);
    const row = rows[0];
    if (row !== undefined) {
      try {
        fs.unlinkSync(row.file_path);
      } catch {
        // File may already be missing; ignore
      }
    }
  }

  invalidateAll(): void {
    const rows = this.db
      .prepare("SELECT file_path FROM cache_metadata")
      .all() as readonly { file_path: string }[];
    for (const row of rows) {
      try {
        fs.unlinkSync(row.file_path);
      } catch {
        // Ignore missing files
      }
    }
    this.db.prepare("DELETE FROM cache_metadata").run();
  }

  purgeExpired(): void {
    const now = this.clock.now();
    const rows = this.db
      .prepare("SELECT file_path FROM cache_metadata WHERE expires_at <= datetime(?)")
      .all(now) as readonly { file_path: string }[];
    for (const row of rows) {
      try {
        fs.unlinkSync(row.file_path);
      } catch {
        // Blob may already be missing
      }
    }
    this.db
      .prepare("DELETE FROM cache_metadata WHERE expires_at <= datetime(?)")
      .run(now);
    const validPaths = new Set(
      (
        this.db.prepare("SELECT file_path FROM cache_metadata").all() as readonly {
          file_path: string;
        }[]
      ).map((r) => r.file_path),
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
