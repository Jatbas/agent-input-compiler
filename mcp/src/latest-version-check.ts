// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { Milliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";

const CACHE_FILENAME = "version-check-cache.json";
const MESSAGE_FILENAME = "update-available.txt";
const CACHE_TTL_MS: Milliseconds = toMilliseconds(24 * 60 * 60 * 1000);
const REGISTRY_BASE = "https://registry.npmjs.org";
const FETCH_TIMEOUT_MS = 2000;
const MAX_BODY_BYTES = 1_000_000;

const SEMVER_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
const MAX_VERSION_LENGTH = 32;

export function isValidVersionString(s: string): boolean {
  return s.length <= MAX_VERSION_LENGTH && SEMVER_REGEX.test(s);
}

function parseParts(v: string): { major: number; minor: number; patch: number } {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (
    !match ||
    match[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined
  ) {
    return { major: 0, minor: 0, patch: 0 };
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

export function compareVersions(a: string, b: string): number {
  const pa = parseParts(a);
  const pb = parseParts(b);
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  return 0;
}

export interface UpdateInfo {
  readonly updateAvailable: string | null;
  readonly currentVersion: string;
}

function ensureAicDir(projectRoot: AbsolutePath): string {
  const aicDir = path.join(projectRoot, ".aic");
  if (!fs.existsSync(aicDir)) {
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
  }
  return aicDir;
}

function readValidCache(
  cachePath: string,
  clock: Clock,
  now: ReturnType<Clock["now"]>,
): string | null {
  if (!fs.existsSync(cachePath)) return null;
  try {
    const raw = fs.readFileSync(cachePath, "utf8");
    const cache = JSON.parse(raw) as {
      lastCheck?: string;
      latestVersion?: string;
      currentVersion?: string;
    };
    const lastCheck =
      typeof cache.lastCheck === "string" ? toISOTimestamp(cache.lastCheck) : null;
    if (
      lastCheck === null ||
      clock.durationMs(lastCheck, now) > CACHE_TTL_MS ||
      typeof cache.latestVersion !== "string" ||
      !isValidVersionString(cache.latestVersion) ||
      typeof cache.currentVersion !== "string" ||
      !isValidVersionString(cache.currentVersion)
    ) {
      return null;
    }
    return cache.latestVersion;
  } catch {
    return null;
  }
}

async function fetchLatestAndWriteCache(
  packageName: string,
  cachePath: string,
  currentVersion: string,
  now: ReturnType<Clock["now"]>,
  _messagePath: string,
): Promise<{ latest: string | null }> {
  const url = `${REGISTRY_BASE}/${encodeURIComponent(packageName)}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) return { latest: null };
  const body = JSON.parse(new TextDecoder().decode(buffer)) as Record<string, unknown>;
  const distTags = body["dist-tags"];
  const rawLatest =
    distTags !== null && typeof distTags === "object"
      ? (distTags as Record<string, unknown>)["latest"]
      : undefined;
  const latest = typeof rawLatest === "string" ? rawLatest : null;
  if (latest === null || !isValidVersionString(latest)) return { latest: null };
  fs.writeFileSync(
    cachePath,
    JSON.stringify({ lastCheck: now, latestVersion: latest, currentVersion }),
    "utf8",
  );
  return { latest };
}

export async function getUpdateInfo(
  projectRoot: AbsolutePath,
  packageName: string,
  currentVersion: string,
  clock: Clock,
): Promise<UpdateInfo> {
  try {
    const aicDir = ensureAicDir(projectRoot);
    const cachePath = path.join(aicDir, CACHE_FILENAME);
    const messagePath = path.join(aicDir, MESSAGE_FILENAME);
    const now = clock.now();

    const cached = readValidCache(cachePath, clock, now);
    const fetched =
      cached !== null
        ? { latest: cached }
        : await fetchLatestAndWriteCache(
            packageName,
            cachePath,
            currentVersion,
            now,
            messagePath,
          );
    const latestVersion = fetched.latest;

    if (latestVersion === null) {
      writeMessageFile(messagePath, "");
      return { updateAvailable: null, currentVersion };
    }

    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
    if (hasUpdate) {
      writeMessageFile(
        messagePath,
        `Update available: ${latestVersion}. Re-run the install link to update.`,
      );
    } else {
      writeMessageFile(messagePath, "");
    }

    return {
      updateAvailable: hasUpdate ? latestVersion : null,
      currentVersion,
    };
  } catch {
    try {
      const messagePath = path.join(projectRoot, ".aic", MESSAGE_FILENAME);
      if (fs.existsSync(path.join(projectRoot, ".aic"))) {
        writeMessageFile(messagePath, "");
      }
    } catch {
      // Ignore write failure on error path
    }
    return { updateAvailable: null, currentVersion };
  }
}

function writeMessageFile(messagePath: string, content: string): void {
  fs.writeFileSync(messagePath, content, "utf8");
}
