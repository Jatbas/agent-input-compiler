// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { SessionStep } from "@jatbas/aic-core/core/types/session-dedup-types.js";
import type { ToolOutput } from "@jatbas/aic-core/core/types/compilation-types.js";
import {
  toSessionId,
  toISOTimestamp,
  toProjectId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toStepIndex, toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import { migration } from "../migrations/001-consolidated-schema.js";
import { SqliteAgenticSessionStore } from "../sqlite-agentic-session-store.js";

const TEST_PROJECT_ID = toProjectId("018f0000-0000-7000-8000-000000000001");

function makeStep(overrides: Partial<SessionStep>): SessionStep {
  return {
    stepIndex: toStepIndex(0),
    stepIntent: null,
    filesSelected: [],
    tiers: {},
    tokensCompiled: toTokenCount(0),
    toolOutputs: [],
    completedAt: toISOTimestamp("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("SqliteAgenticSessionStore", () => {
  let db: Database.Database;

  afterEach(() => {
    if (db) db.close();
  });

  function setup(projectRoot = "/test/project"): SqliteAgenticSessionStore {
    db = new Database(":memory:");
    const execDb = db as unknown as ExecutableDb;
    migration.up(execDb);
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(
      TEST_PROJECT_ID,
      projectRoot,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
    return new SqliteAgenticSessionStore(TEST_PROJECT_ID, execDb);
  }

  it("recordStep_then_getSteps_returns_step", () => {
    const store = setup();
    const sessionId = toSessionId("s1");
    const path = toRelativePath("src/a.ts");
    const step = makeStep({
      stepIndex: toStepIndex(0),
      stepIntent: "add feature",
      filesSelected: [path],
      tiers: { [path]: INCLUSION_TIER.L0 },
      tokensCompiled: toTokenCount(100),
      toolOutputs: [] as readonly ToolOutput[],
      completedAt: toISOTimestamp("2026-01-01T12:00:00.000Z"),
    });
    store.recordStep(sessionId, step);
    const steps = store.getSteps(sessionId);
    expect(steps.length).toBe(1);
    const firstStep = steps[0];
    expect(firstStep).toBeDefined();
    if (!firstStep) return;
    expect(firstStep.stepIndex).toBe(step.stepIndex);
    expect(firstStep.stepIntent).toBe(step.stepIntent);
    expect(firstStep.filesSelected).toEqual([path]);
    expect(firstStep.tiers[path]).toBe(INCLUSION_TIER.L0);
    expect(firstStep.tokensCompiled).toBe(step.tokensCompiled);
    expect(firstStep.completedAt).toBe(step.completedAt);
  });

  it("getSteps_empty_when_no_session", () => {
    const store = setup();
    const steps = store.getSteps(toSessionId("unknown-id"));
    expect(steps).toEqual([]);
  });

  it("getPreviouslyShownFiles_uses_fileLastModified", () => {
    const store = setup();
    const sessionId = toSessionId("s2");
    const path = toRelativePath("src/b.ts");
    const t1 = toISOTimestamp("2026-01-01T10:00:00.000Z");
    const t2 = toISOTimestamp("2026-01-01T12:00:00.000Z");
    store.recordStep(
      sessionId,
      makeStep({
        stepIndex: toStepIndex(0),
        filesSelected: [path],
        tiers: { [path]: INCLUSION_TIER.L0 },
        completedAt: t1,
      }),
    );
    store.recordStep(
      sessionId,
      makeStep({
        stepIndex: toStepIndex(1),
        filesSelected: [path],
        tiers: { [path]: INCLUSION_TIER.L1 },
        completedAt: t2,
      }),
    );
    const afterSecond = store.getPreviouslyShownFiles(sessionId, {
      [path]: toISOTimestamp("2026-01-01T12:00:01.000Z"),
    });
    expect(afterSecond.length).toBe(1);
    const afterFirst = afterSecond[0];
    expect(afterFirst).toBeDefined();
    if (afterFirst) expect(afterFirst.modifiedSince).toBe(true);
    const beforeSecond = store.getPreviouslyShownFiles(sessionId, {
      [path]: toISOTimestamp("2026-01-01T11:00:00.000Z"),
    });
    expect(beforeSecond.length).toBe(1);
    const beforeFirst = beforeSecond[0];
    expect(beforeFirst).toBeDefined();
    if (beforeFirst) expect(beforeFirst.modifiedSince).toBe(false);
  });

  it("getPreviouslyShownFiles_omitted_param_returns_modifiedSince_true", () => {
    const store = setup();
    const sessionId = toSessionId("s3");
    const path = toRelativePath("src/c.ts");
    store.recordStep(
      sessionId,
      makeStep({
        filesSelected: [path],
        tiers: { [path]: INCLUSION_TIER.L0 },
      }),
    );
    const previous = store.getPreviouslyShownFiles(sessionId);
    expect(previous.length).toBe(1);
    const prevFirst = previous[0];
    expect(prevFirst).toBeDefined();
    if (prevFirst) expect(prevFirst.modifiedSince).toBe(true);
  });

  it("recordStep_append_second_step", () => {
    const store = setup();
    const sessionId = toSessionId("s4");
    store.recordStep(
      sessionId,
      makeStep({ stepIndex: toStepIndex(0), stepIntent: "first" }),
    );
    store.recordStep(
      sessionId,
      makeStep({ stepIndex: toStepIndex(1), stepIntent: "second" }),
    );
    const steps = store.getSteps(sessionId);
    expect(steps.length).toBe(2);
    const step0 = steps[0];
    const step1 = steps[1];
    expect(step0).toBeDefined();
    expect(step1).toBeDefined();
    if (step0 && step1) {
      expect(step0.stepIntent).toBe("first");
      expect(step1.stepIntent).toBe("second");
    }
  });

  it("idempotent_empty_steps_json", () => {
    const store = setup();
    const sessionId = toSessionId("s5");
    store.recordStep(
      sessionId,
      makeStep({ stepIndex: toStepIndex(0), stepIntent: "only" }),
    );
    const rows = (db as unknown as ExecutableDb)
      .prepare("SELECT steps_json FROM session_state WHERE session_id = ?")
      .all(sessionId) as { steps_json: string }[];
    expect(rows.length).toBe(1);
    const row0 = rows[0];
    expect(row0).toBeDefined();
    if (!row0) return;
    const parsed = JSON.parse(row0.steps_json) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
  });

  it("sqlite_agentic_session_store_steps_and_record", () => {
    db = new Database(":memory:");
    const execDb = db as unknown as ExecutableDb;
    migration.up(execDb);
    const projectIdA = toProjectId("018f0000-0000-7000-8000-000000000010");
    const projectIdB = toProjectId("018f0000-0000-7000-8000-000000000011");
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(projectIdA, "/proj/a", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(projectIdB, "/proj/b", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    const storeA = new SqliteAgenticSessionStore(projectIdA, execDb);
    const storeB = new SqliteAgenticSessionStore(projectIdB, execDb);
    const sessionA = toSessionId("session-a");
    const sessionB = toSessionId("session-b");
    storeA.recordStep(
      sessionA,
      makeStep({ stepIndex: toStepIndex(0), stepIntent: "from-a" }),
    );
    storeB.recordStep(
      sessionB,
      makeStep({ stepIndex: toStepIndex(0), stepIntent: "from-b" }),
    );
    const stepsA = storeA.getSteps(sessionA);
    const stepsB = storeB.getSteps(sessionB);
    expect(stepsA).toHaveLength(1);
    expect(stepsB).toHaveLength(1);
    expect(stepsA[0]?.stepIntent).toBe("from-a");
    expect(stepsB[0]?.stepIntent).toBe("from-b");
    expect(storeA.getSteps(sessionB)).toHaveLength(0);
    expect(storeB.getSteps(sessionA)).toHaveLength(0);
  });
});
