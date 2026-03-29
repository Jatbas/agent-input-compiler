// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import Database from "better-sqlite3";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toISOTimestamp, toProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { ProjectRootNormaliser } from "@jatbas/aic-core/core/interfaces/project-root-normaliser.interface.js";
import { SqliteMigrationRunner } from "../sqlite-migration-runner.js";
import { migration } from "../migrations/001-consolidated-schema.js";
import { reconcileProjectId, PROJECT_ID_FILENAME } from "../ensure-project-id.js";
import { NodePathAdapter } from "@jatbas/aic-core/adapters/node-path-adapter.js";

function mockClock(nowVal: string): Clock {
  const ts = toISOTimestamp(nowVal);
  return {
    now: (): ReturnType<Clock["now"]> => ts,
    addMinutes: (): ReturnType<Clock["addMinutes"]> => ts,
    durationMs: () => 0 as ReturnType<Clock["durationMs"]>,
  };
}

function mockIdGenerator(id: string): IdGenerator {
  return {
    generate: () => id as ReturnType<IdGenerator["generate"]>,
  };
}

describe("ensure-project-id", () => {
  let tmpDir: string;
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
    if (tmpDir !== undefined && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function setupDb(clock: Clock): ExecutableDb {
    db = new Database(":memory:");
    const runner = new SqliteMigrationRunner(clock);
    runner.run(db as unknown as ExecutableDb, [migration]);
    return db as unknown as ExecutableDb;
  }

  function mkProjectRoot(): string {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-ensure-project-id-"));
    return tmpDir;
  }

  it("reconcileProjectId_file_missing_returns_id", () => {
    const projectRoot = toAbsolutePath(mkProjectRoot());
    const clock = mockClock("2026-03-10T12:00:00.000Z");
    const dbInstance = setupDb(clock);
    const idGenerator = mockIdGenerator("018f0000-0000-7000-8000-000000000001");
    const normaliser: ProjectRootNormaliser = new NodePathAdapter();
    expect(fs.existsSync(path.join(projectRoot, ".aic", PROJECT_ID_FILENAME))).toBe(
      false,
    );
    const returned = reconcileProjectId(
      projectRoot,
      dbInstance,
      clock,
      idGenerator,
      normaliser,
    );
    expect(returned).toBe(toProjectId("018f0000-0000-7000-8000-000000000001"));
    const filePath = path.join(projectRoot, ".aic", PROJECT_ID_FILENAME);
    expect(fs.existsSync(filePath)).toBe(true);
    const uuid = fs.readFileSync(filePath, "utf8").trim();
    expect(uuid).toBe("018f0000-0000-7000-8000-000000000001");
    const rows = (dbInstance as unknown as Database.Database)
      .prepare("SELECT project_id, project_root FROM projects")
      .all() as readonly { project_id: string; project_root: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.project_id).toBe(uuid);
    expect(rows[0]?.project_root).toBe(normaliser.normalise(projectRoot));
  });

  it("reconcileProjectId_file_present_insert_returns_id", () => {
    const projectRoot = toAbsolutePath(mkProjectRoot());
    fs.mkdirSync(path.join(projectRoot, ".aic"), { recursive: true, mode: 0o700 });
    const uuid = "018f0000-0000-7000-8000-000000000002";
    fs.writeFileSync(path.join(projectRoot, ".aic", PROJECT_ID_FILENAME), uuid, "utf8");
    const clock = mockClock("2026-03-10T12:00:00.000Z");
    const dbInstance = setupDb(clock);
    const idGenerator = mockIdGenerator(uuid);
    const normaliser = new NodePathAdapter();
    const returned = reconcileProjectId(
      projectRoot,
      dbInstance,
      clock,
      idGenerator,
      normaliser,
    );
    expect(returned).toBe(toProjectId(uuid));
    const rows = (dbInstance as unknown as Database.Database)
      .prepare("SELECT project_id, project_root, last_seen_at FROM projects")
      .all() as readonly {
      project_id: string;
      project_root: string;
      last_seen_at: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.project_id).toBe(uuid);
    expect(rows[0]?.last_seen_at).toBe("2026-03-10T12:00:00.000Z");
    const clock2 = mockClock("2026-03-10T13:00:00.000Z");
    reconcileProjectId(projectRoot, dbInstance, clock2, idGenerator, normaliser);
    const rows2 = (dbInstance as unknown as Database.Database)
      .prepare("SELECT last_seen_at FROM projects WHERE project_id = ?")
      .all(uuid) as readonly { last_seen_at: string }[];
    expect(rows2[0]?.last_seen_at).toBe("2026-03-10T13:00:00.000Z");
  });

  it("reconcileProjectId_match_update_last_seen_returns_id", () => {
    const projectRoot = toAbsolutePath(mkProjectRoot());
    fs.mkdirSync(path.join(projectRoot, ".aic"), { recursive: true, mode: 0o700 });
    const uuid = "018f0000-0000-7000-8000-000000000003";
    fs.writeFileSync(path.join(projectRoot, ".aic", PROJECT_ID_FILENAME), uuid, "utf8");
    const clock = mockClock("2026-03-10T14:00:00.000Z");
    const dbInstance = setupDb(clock);
    const normaliser = new NodePathAdapter();
    const normalisedRoot = normaliser.normalise(projectRoot);
    (dbInstance as unknown as Database.Database)
      .prepare(
        "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
      )
      .run(uuid, normalisedRoot, "2026-03-10T11:00:00.000Z", "2026-03-10T11:00:00.000Z");
    const idGenerator = mockIdGenerator(uuid);
    const returned = reconcileProjectId(
      projectRoot,
      dbInstance,
      clock,
      idGenerator,
      normaliser,
    );
    expect(returned).toBe(toProjectId(uuid));
    const rows = (dbInstance as unknown as Database.Database)
      .prepare("SELECT last_seen_at FROM projects WHERE project_id = ?")
      .all(uuid) as readonly { last_seen_at: string }[];
    expect(rows[0]?.last_seen_at).toBe("2026-03-10T14:00:00.000Z");
  });

  it("reconcileProjectId_rename_updates_projects_only", () => {
    const oldPath = toAbsolutePath(mkProjectRoot());
    const newPath = toAbsolutePath(mkProjectRoot());
    fs.mkdirSync(path.join(newPath, ".aic"), { recursive: true, mode: 0o700 });
    const uuid = "018f0000-0000-7000-8000-000000000004";
    fs.writeFileSync(path.join(newPath, ".aic", PROJECT_ID_FILENAME), uuid, "utf8");
    const clock = mockClock("2026-03-10T15:00:00.000Z");
    const dbInstance = setupDb(clock);
    const normaliser = new NodePathAdapter();
    const oldNormalised = normaliser.normalise(oldPath);
    const newNormalised = normaliser.normalise(newPath);
    (dbInstance as unknown as Database.Database)
      .prepare(
        "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
      )
      .run(uuid, oldNormalised, "2026-03-10T10:00:00.000Z", "2026-03-10T10:00:00.000Z");
    (dbInstance as unknown as Database.Database)
      .prepare(
        "INSERT INTO compilation_log (id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled, cache_hit, duration_ms, editor_id, model_id, created_at, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "018f0000-0000-7000-8000-000000000099",
        "intent",
        "refactor",
        1,
        1,
        100,
        50,
        0,
        100,
        "generic",
        null,
        "2026-03-10T10:00:00.000Z",
        uuid,
      );
    const idGenerator = mockIdGenerator(uuid);
    const returned = reconcileProjectId(
      newPath,
      dbInstance,
      clock,
      idGenerator,
      normaliser,
    );
    expect(returned).toBe(toProjectId(uuid));
    const projectRows = (dbInstance as unknown as Database.Database)
      .prepare("SELECT project_root FROM projects WHERE project_id = ?")
      .all(uuid) as readonly { project_root: string }[];
    expect(projectRows[0]?.project_root).toBe(newNormalised);
  });

  it("reconcileProjectId_uuid_not_in_db_insert_returns_id", () => {
    const projectRoot = toAbsolutePath(mkProjectRoot());
    fs.mkdirSync(path.join(projectRoot, ".aic"), { recursive: true, mode: 0o700 });
    const uuid = "018f0000-0000-7000-8000-000000000005";
    fs.writeFileSync(path.join(projectRoot, ".aic", PROJECT_ID_FILENAME), uuid, "utf8");
    const clock = mockClock("2026-03-10T16:00:00.000Z");
    const dbInstance = setupDb(clock);
    const idGenerator = mockIdGenerator(uuid);
    const normaliser = new NodePathAdapter();
    const returned = reconcileProjectId(
      projectRoot,
      dbInstance,
      clock,
      idGenerator,
      normaliser,
    );
    expect(returned).toBe(toProjectId(uuid));
    const rows = (dbInstance as unknown as Database.Database)
      .prepare("SELECT project_id, project_root FROM projects")
      .all() as readonly { project_id: string; project_root: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.project_id).toBe(uuid);
    expect(rows[0]?.project_root).toBe(normaliser.normalise(projectRoot));
  });

  it("reconcileProjectId_file_missing_reuses_existing_root_row", () => {
    const projectRoot = toAbsolutePath(mkProjectRoot());
    const existingUuid = "018f0000-0000-7000-8000-000000000010";
    const clock = mockClock("2026-03-10T17:00:00.000Z");
    const dbInstance = setupDb(clock);
    const normaliser = new NodePathAdapter();
    const normalisedRoot = normaliser.normalise(projectRoot);
    (dbInstance as unknown as Database.Database)
      .prepare(
        "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
      )
      .run(
        existingUuid,
        normalisedRoot,
        "2026-03-10T09:00:00.000Z",
        "2026-03-10T09:00:00.000Z",
      );
    const idGenerator = mockIdGenerator("018f0000-0000-7000-8000-000000000099");
    const returned = reconcileProjectId(
      projectRoot,
      dbInstance,
      clock,
      idGenerator,
      normaliser,
    );
    expect(returned).toBe(toProjectId(existingUuid));
    const filePath = path.join(projectRoot, ".aic", PROJECT_ID_FILENAME);
    expect(fs.readFileSync(filePath, "utf8").trim()).toBe(existingUuid);
    const rows = (dbInstance as unknown as Database.Database)
      .prepare("SELECT project_id, last_seen_at FROM projects")
      .all() as readonly { project_id: string; last_seen_at: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.project_id).toBe(existingUuid);
    expect(rows[0]?.last_seen_at).toBe("2026-03-10T17:00:00.000Z");
  });

  it("reconcileProjectId_orphan_file_realigns_to_root_row", () => {
    const projectRoot = toAbsolutePath(mkProjectRoot());
    const idA = "018f0000-0000-7000-8000-000000000020";
    const idB = "018f0000-0000-7000-8000-000000000021";
    fs.mkdirSync(path.join(projectRoot, ".aic"), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(projectRoot, ".aic", PROJECT_ID_FILENAME), idB, "utf8");
    const clock = mockClock("2026-03-10T18:00:00.000Z");
    const dbInstance = setupDb(clock);
    const normaliser = new NodePathAdapter();
    const normalisedRoot = normaliser.normalise(projectRoot);
    (dbInstance as unknown as Database.Database)
      .prepare(
        "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
      )
      .run(idA, normalisedRoot, "2026-03-10T08:00:00.000Z", "2026-03-10T08:00:00.000Z");
    const idGenerator = mockIdGenerator(idB);
    const returned = reconcileProjectId(
      projectRoot,
      dbInstance,
      clock,
      idGenerator,
      normaliser,
    );
    expect(returned).toBe(toProjectId(idA));
    expect(
      fs.readFileSync(path.join(projectRoot, ".aic", PROJECT_ID_FILENAME), "utf8").trim(),
    ).toBe(idA);
    const rows = (dbInstance as unknown as Database.Database)
      .prepare("SELECT project_id, last_seen_at FROM projects")
      .all() as readonly { project_id: string; last_seen_at: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.project_id).toBe(idA);
    expect(rows[0]?.last_seen_at).toBe("2026-03-10T18:00:00.000Z");
  });
});
