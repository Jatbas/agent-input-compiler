// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { BudgetConfig } from "@jatbas/aic-core/core/interfaces/budget-config.interface.js";
import type { TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { SystemClock } from "@jatbas/aic-core/adapters/system-clock.js";
import { NodePathAdapter } from "@jatbas/aic-core/adapters/node-path-adapter.js";
import {
  openDatabaseReadOnly,
  closeDatabase,
} from "@jatbas/aic-core/storage/open-database.js";
import { lookupProjectIdByNormalisedRoot } from "@jatbas/aic-core/storage/lookup-project-id-by-root.js";
import {
  SqliteStatusStore,
  listProjectsFromDb,
} from "@jatbas/aic-core/storage/sqlite-status-store.js";
import { LoadConfigFromFile } from "@jatbas/aic-core/config/load-config-from-file.js";
import { getUpdateInfo } from "./latest-version-check.js";
import {
  buildProjectScopedChatSummaryCliRow,
  buildStatusPayload,
  buildLastPayload,
} from "./diagnostic-payloads.js";
import {
  formatStatusTable,
  formatLastTable,
  formatChatSummaryTable,
  formatProjectsTable,
} from "./format-diagnostic-output.js";
import { detectInstallScope } from "./detect-install-scope.js";
import { getInstallScopeWarnings } from "./editor-integration-dispatch.js";

export function readPackageVersion(): {
  readonly packageName: string;
  readonly packageVersion: string;
} {
  try {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(dir, "..", "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { name?: string; version?: string };
    const packageName = typeof pkg.name === "string" ? pkg.name : "@aic/mcp";
    const packageVersion = typeof pkg.version === "string" ? pkg.version : "0.0.0";
    return { packageName, packageVersion };
  } catch {
    return { packageName: "@aic/mcp", packageVersion: "0.0.0" };
  }
}

export function createDefaultBudgetConfig(): BudgetConfig {
  return {
    getMaxTokens(): ReturnType<typeof toTokenCount> {
      return toTokenCount(8000);
    },
    getBudgetForTaskClass(_taskClass: TaskClass): ReturnType<typeof toTokenCount> | null {
      return null;
    },
  };
}

function parseChatSummaryProjectRoot(argv: readonly string[]): AbsolutePath {
  const idx = argv.indexOf("--project");
  if (idx === -1 || idx + 1 >= argv.length) {
    return toAbsolutePath(process.cwd());
  }
  return toAbsolutePath(argv[idx + 1] ?? process.cwd());
}

async function runCliDiagnosticsAsync(argv: readonly string[]): Promise<number> {
  const sub = argv[0];
  const handlers: Record<string, () => Promise<number>> = {
    status: async () => runStatusCli(),
    last: async () => runLastCli(),
    "chat-summary": async () => runChatSummaryCli(argv),
    projects: async () => runProjectsCli(),
  };
  const run = sub !== undefined ? handlers[sub] : undefined;
  if (run === undefined) {
    process.stderr.write(
      "Usage: aic {status|last|chat-summary [--project <dir>]|projects|init|serve}\n",
    );
    return 1;
  }
  return run();
}

function openGlobalDbOrExit(): { readonly db: ExecutableDb } | { readonly code: number } {
  const dbPath = path.join(os.homedir(), ".aic", "aic.sqlite");
  if (!fs.existsSync(dbPath)) {
    process.stderr.write(`AIC database not found at ${dbPath}\n`);
    return { code: 1 };
  }
  return { db: openDatabaseReadOnly(dbPath) };
}

function resolveProjectIdForAbsoluteRoot(
  db: ExecutableDb,
  projectRoot: AbsolutePath,
): ProjectId | null {
  const normaliser = new NodePathAdapter();
  const projectId = lookupProjectIdByNormalisedRoot(
    db,
    normaliser.normalise(projectRoot),
  );
  if (projectId === null) {
    process.stderr.write(
      "This project is not known to AIC (no projects row for this path).\n",
    );
  }
  return projectId;
}

async function withGlobalReadonlyDb(
  fn: (db: ExecutableDb) => number | Promise<number>,
): Promise<number> {
  const opened = openGlobalDbOrExit();
  if ("code" in opened) return opened.code;
  const { db } = opened;
  try {
    return await Promise.resolve(fn(db));
  } finally {
    closeDatabase(db);
  }
}

async function runStatusCli(): Promise<number> {
  return withGlobalReadonlyDb(async (db) => {
    const clock = new SystemClock();
    const projectRoot = toAbsolutePath(process.cwd());
    const projectId = resolveProjectIdForAbsoluteRoot(db, projectRoot);
    if (projectId === null) {
      return 1;
    }
    const { packageName, packageVersion } = readPackageVersion();
    const updateInfo = await getUpdateInfo(
      projectRoot,
      packageName,
      packageVersion,
      clock,
      {
        persistSideEffects: false,
      },
    );
    const installScope = detectInstallScope(os.homedir(), projectRoot);
    const installScopeWarnings = getInstallScopeWarnings(installScope);
    const configLoader = new LoadConfigFromFile();
    const budgetConfig = createDefaultBudgetConfig();
    const payload = buildStatusPayload({
      projectId,
      db,
      clock,
      configLoader,
      projectRoot,
      budgetConfig,
      updateInfo,
      installScope,
      installScopeWarnings,
    });
    process.stdout.write(formatStatusTable(payload, clock));
    return 0;
  });
}

async function runLastCli(): Promise<number> {
  return withGlobalReadonlyDb((db) => {
    const clock = new SystemClock();
    const projectRoot = toAbsolutePath(process.cwd());
    const projectId = resolveProjectIdForAbsoluteRoot(db, projectRoot);
    if (projectId === null) {
      return 1;
    }
    const payload = buildLastPayload({
      projectId,
      db,
      clock,
      conversationIdForLast: null,
    });
    process.stdout.write(formatLastTable(payload, clock));
    return 0;
  });
}

async function runChatSummaryCli(argv: readonly string[]): Promise<number> {
  return withGlobalReadonlyDb((db) => {
    const clock = new SystemClock();
    const projectRoot = parseChatSummaryProjectRoot(argv);
    const projectId = resolveProjectIdForAbsoluteRoot(db, projectRoot);
    if (projectId === null) {
      return 1;
    }
    const store = new SqliteStatusStore(projectId, db, clock);
    const summary = store.getSummary();
    const row = buildProjectScopedChatSummaryCliRow(String(projectRoot), summary);
    process.stdout.write(formatChatSummaryTable(row, clock));
    return 0;
  });
}

async function runProjectsCli(): Promise<number> {
  return withGlobalReadonlyDb((db) => {
    const clock = new SystemClock();
    const list = listProjectsFromDb(db);
    process.stdout.write(formatProjectsTable(list, clock));
    return 0;
  });
}

export function runCliDiagnosticsAndExit(argv: readonly string[]): void {
  void runCliDiagnosticsAsync(argv).then(
    (code) => {
      process.exit(code);
    },
    (err: unknown) => {
      process.stderr.write(err instanceof Error ? err.message : String(err));
      process.exit(1);
    },
  );
}
