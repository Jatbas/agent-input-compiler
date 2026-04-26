// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import {
  ensureAicDir,
  joinUnderProjectAic,
} from "@jatbas/aic-core/storage/ensure-aic-dir.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { Milliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";

const CACHE_FILENAME = "version-check-cache.json";
const MESSAGE_FILENAME = "update-available.txt";
const CACHE_TTL_MS: Milliseconds = toMilliseconds(24 * 60 * 60 * 1000);
const REGISTRY_BASE = "https://registry.npmjs.org";
const FETCH_TIMEOUT_MS = 2000;
const MAX_BODY_BYTES = 100_000;

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

function formatUpdateMessage(version: string): string {
  return `A newer AIC version (${version}) is available. Run \`rm -rf ~/.npm/_npx\` then reload Cursor to update.`;
}

export interface UpdateInfo {
  readonly updateAvailable: string | null;
  readonly currentVersion: string;
  readonly updateMessage: string | null;
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

async function fetchLatestVersionFromRegistry(
  packageName: string,
): Promise<string | null> {
  const url = `${REGISTRY_BASE}/${encodeURIComponent(packageName)}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type");
  if (
    contentType === null ||
    contentType.toLowerCase().includes("application/json") === false
  ) {
    return null;
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) return null;
  const body = JSON.parse(new TextDecoder().decode(buffer)) as unknown;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const distTags: unknown = (body as Record<string, unknown>)["dist-tags"];
  if (distTags === null || typeof distTags !== "object" || Array.isArray(distTags)) {
    return null;
  }
  const rawLatest = (distTags as Record<string, unknown>)["latest"];
  if (typeof rawLatest !== "string") return null;
  return isValidVersionString(rawLatest) ? rawLatest : null;
}

async function fetchLatestAndWriteCache(
  packageName: string,
  cachePath: string,
  currentVersion: string,
  now: ReturnType<Clock["now"]>,
): Promise<{ latest: string | null }> {
  const latest = await fetchLatestVersionFromRegistry(packageName);
  if (latest === null) return { latest: null };
  fs.writeFileSync(
    cachePath,
    JSON.stringify({ lastCheck: now, latestVersion: latest, currentVersion }),
    "utf8",
  );
  return { latest };
}

async function fetchWhenCacheMiss(
  persistSideEffects: boolean,
  packageName: string,
  cachePath: string,
  currentVersion: string,
  now: ReturnType<Clock["now"]>,
): Promise<{ latest: string | null }> {
  if (persistSideEffects) {
    return fetchLatestAndWriteCache(packageName, cachePath, currentVersion, now);
  }
  return { latest: await fetchLatestVersionFromRegistry(packageName) };
}

function writeUpdateSideEffectFiles(
  persistSideEffects: boolean,
  messagePath: string,
  hasUpdate: boolean,
  latestVersion: string,
): void {
  if (!persistSideEffects) return;
  if (hasUpdate) {
    writeMessageFile(messagePath, formatUpdateMessage(latestVersion));
  } else {
    writeMessageFile(messagePath, "");
  }
}

function cachePathsForProject(projectRoot: AbsolutePath): {
  readonly cachePath: string;
  readonly messagePath: string;
} {
  const cachePath = joinUnderProjectAic(projectRoot, CACHE_FILENAME);
  const messagePath = joinUnderProjectAic(projectRoot, MESSAGE_FILENAME);
  return { cachePath, messagePath };
}

async function resolveRegistryLatest(
  persistSideEffects: boolean,
  packageName: string,
  cachePath: string,
  currentVersion: string,
  now: ReturnType<Clock["now"]>,
  clock: Clock,
): Promise<string | null> {
  const cached = readValidCache(cachePath, clock, now);
  if (cached !== null) return cached;
  const fetched = await fetchWhenCacheMiss(
    persistSideEffects,
    packageName,
    cachePath,
    currentVersion,
    now,
  );
  return fetched.latest;
}

export async function getUpdateInfo(
  projectRoot: AbsolutePath,
  packageName: string,
  currentVersion: string,
  clock: Clock,
  options?: { readonly persistSideEffects: boolean },
): Promise<UpdateInfo> {
  const persistSideEffects = options === undefined || options.persistSideEffects;
  try {
    const now = clock.now();
    const { cachePath, messagePath } = cachePathsForProject(projectRoot);
    const latestVersion = await resolveRegistryLatest(
      persistSideEffects,
      packageName,
      cachePath,
      currentVersion,
      now,
      clock,
    );

    if (latestVersion === null) {
      if (persistSideEffects) {
        writeMessageFile(messagePath, "");
      }
      return { updateAvailable: null, currentVersion, updateMessage: null };
    }

    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
    const updateMessage = hasUpdate ? formatUpdateMessage(latestVersion) : null;
    writeUpdateSideEffectFiles(persistSideEffects, messagePath, hasUpdate, latestVersion);

    return {
      updateAvailable: hasUpdate ? latestVersion : null,
      currentVersion,
      updateMessage,
    };
  } catch {
    if (persistSideEffects) {
      try {
        const messagePath = joinUnderProjectAic(projectRoot, MESSAGE_FILENAME);
        if (fs.existsSync(ensureAicDir(projectRoot))) {
          writeMessageFile(messagePath, "");
        }
      } catch {
        // Ignore write failure on error path
      }
    }
    return { updateAvailable: null, currentVersion, updateMessage: null };
  }
}

function writeMessageFile(messagePath: string, content: string): void {
  fs.writeFileSync(messagePath, content, "utf8");
}
