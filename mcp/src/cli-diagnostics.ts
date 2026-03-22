// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import {
  STATUS_TIME_RANGE_DAYS_MAX,
  toStatusTimeRangeDays,
  type StatusTimeRangeDays,
} from "@jatbas/aic-core/core/types/status-types.js";
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

function parseOptionalProjectRoot(argv: readonly string[]): AbsolutePath {
  const idx = argv.findIndex((arg) => arg === "--project");
  if (idx === -1 || idx + 1 >= argv.length) {
    return toAbsolutePath(process.cwd());
  }
  const next = argv[idx + 1];
  if (next === undefined || next.length === 0) {
    return toAbsolutePath(process.cwd());
  }
  return toAbsolutePath(next);
}

const scanArgvForProjectRoot: typeof parseOptionalProjectRoot = parseOptionalProjectRoot;
const scanArgvForProjectRootSame: typeof parseOptionalProjectRoot =
  scanArgvForProjectRoot;

function parseStatusTimeRangeDaysFromArgv(
  argv: readonly string[],
):
  | { readonly ok: true; readonly days: StatusTimeRangeDays | null }
  | { readonly ok: false } {
  const tokens = argv.reduce<string[]>((acc, a, idx) => {
    if (a === "--project") {
      return acc;
    }
    const prev = idx > 0 ? argv[idx - 1] : undefined;
    if (prev === "--project") {
      return acc;
    }
    return [...acc, a];
  }, []);
  const matches = tokens.filter((t) => /^\d+d$/.test(t));
  if (matches.length === 0) {
    return { ok: true, days: null };
  }
  if (matches.length > 1) {
    return { ok: false };
  }
  const first = matches[0];
  const m = first === undefined ? null : /^(\d+)d$/.exec(first);
  if (m === null || m[1] === undefined) {
    return { ok: false };
  }
  const n = Number.parseInt(m[1], 10);
  if (!Number.isInteger(n) || n < 1 || n > STATUS_TIME_RANGE_DAYS_MAX) {
    return { ok: false };
  }
  return { ok: true, days: toStatusTimeRangeDays(n) };
}

async function runCliDiagnosticsAsync(argv: readonly string[]): Promise<number> {
  const sub = argv[0];
  const handlers: Record<string, () => Promise<number>> = {
    status: async () => runStatusCli(argv),
    last: async () => runLastCli(argv),
    "chat-summary": async () => runChatSummaryCli(argv),
    projects: async () => runProjectsCli(),
  };
  const run = sub !== undefined ? handlers[sub] : undefined;
  if (run === undefined) {
    process.stderr.write(
      `Usage: aic {status [<N>d]|last|chat-summary} [--project <dir>] | projects | init | serve (N integer 1..${String(STATUS_TIME_RANGE_DAYS_MAX)} for rolling window)\n`,
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

function projectIdFromArgvOrUnavailable(
  db: ExecutableDb,
  argv: readonly string[],
): { readonly projectRoot: AbsolutePath; readonly projectId: ProjectId } | null {
  const projectRoot = scanArgvForProjectRootSame(argv);
  const projectId = resolveProjectIdForAbsoluteRoot(db, projectRoot);
  if (projectId === null) {
    return null;
  }
  return { projectRoot, projectId };
}

function runWithProjectFromArgv(
  db: ExecutableDb,
  argv: readonly string[],
  run: (ctx: {
    readonly clock: SystemClock;
    readonly db: ExecutableDb;
    readonly projectId: ProjectId;
    readonly projectRoot: AbsolutePath;
  }) => number | Promise<number>,
): number | Promise<number> {
  const clock = new SystemClock();
  const scoped = projectIdFromArgvOrUnavailable(db, argv);
  if (scoped === null) {
    return 1;
  }
  return run({
    clock,
    db,
    projectId: scoped.projectId,
    projectRoot: scoped.projectRoot,
  });
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

async function runStatusCli(argv: readonly string[]): Promise<number> {
  const parsedWindow = parseStatusTimeRangeDaysFromArgv(argv);
  if (!parsedWindow.ok) {
    process.stderr.write(
      `status: use at most one <N>d suffix (N integer 1..${String(STATUS_TIME_RANGE_DAYS_MAX)}) or omit for all-time aggregates\n`,
    );
    return 1;
  }
  return withGlobalReadonlyDb(async (db) => {
    const step = runWithProjectFromArgv(
      db,
      argv,
      async ({ clock, projectId, projectRoot, db: storeDb }) => {
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
          db: storeDb,
          clock,
          configLoader,
          projectRoot,
          budgetConfig,
          updateInfo,
          installScope,
          installScopeWarnings,
          timeRangeDays: parsedWindow.days,
        });
        process.stdout.write(formatStatusTable(payload, clock));
        return 0;
      },
    );
    return await Promise.resolve(step);
  });
}

async function runLastCli(argv: readonly string[]): Promise<number> {
  return withGlobalReadonlyDb((db) =>
    runWithProjectFromArgv(db, argv, ({ clock, projectId, db: storeDb }) => {
      const payload = buildLastPayload({
        projectId,
        db: storeDb,
        clock,
        conversationIdForLast: null,
      });
      process.stdout.write(formatLastTable(payload, clock));
      return 0;
    }),
  );
}

async function runChatSummaryCli(argv: readonly string[]): Promise<number> {
  return withGlobalReadonlyDb((db) =>
    runWithProjectFromArgv(db, argv, ({ clock, projectId, projectRoot, db: storeDb }) => {
      const store = new SqliteStatusStore(projectId, storeDb, clock);
      const summary = store.getSummary();
      const row = buildProjectScopedChatSummaryCliRow(String(projectRoot), summary);
      process.stdout.write(formatChatSummaryTable(row, clock));
      return 0;
    }),
  );
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
