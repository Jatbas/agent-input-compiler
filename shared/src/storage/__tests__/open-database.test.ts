// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { mkdtempSync, rmSync, symlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as os from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { ConfigError } from "../../core/errors/config-error.js";
import { toFilePath } from "../../core/types/paths.js";
import { SystemClock } from "../../adapters/system-clock.js";
import { openDatabase, closeDatabase, openDatabaseReadOnly } from "../open-database.js";

describe("open-database containment", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it("rejects_open_database_when_resolved_db_path_escapes_containment_root", () => {
    const root = mkdtempSync(join(os.tmpdir(), "aic-odb-root-"));
    const outside = mkdtempSync(join(os.tmpdir(), "aic-odb-out-"));
    dirs.push(root, outside);
    const logicalAic = join(root, ".aic");
    symlinkSync(outside, logicalAic);
    const trapFile = join(root, "trap.sqlite");
    writeFileSync(trapFile, "");
    symlinkSync(trapFile, join(outside, "aic.sqlite"));
    const dbPath = join(root, ".aic", "aic.sqlite");
    const clock = new SystemClock();
    expect(() =>
      openDatabase(dbPath, clock, {
        mustStayWithinDir: toFilePath(logicalAic),
      }),
    ).toThrow(ConfigError);
  });

  it("opens_file_backed_database_when_resolved_path_stays_inside_containment_root", () => {
    const root = mkdtempSync(join(os.tmpdir(), "aic-odb-ok-"));
    dirs.push(root);
    const globalAicDir = join(root, ".aic");
    mkdirSync(globalAicDir, { recursive: true });
    const dbPath = join(globalAicDir, "db.sqlite");
    const clock = new SystemClock();
    const db = openDatabase(dbPath, clock, {
      mustStayWithinDir: toFilePath(globalAicDir),
    });
    closeDatabase(db);
  });

  it("rejects_open_database_read_only_when_resolved_db_path_escapes_containment_root", () => {
    const root = mkdtempSync(join(os.tmpdir(), "aic-odb-ro-"));
    const outside = mkdtempSync(join(os.tmpdir(), "aic-odb-ro-out-"));
    dirs.push(root, outside);
    const logicalAic = join(root, ".aic");
    symlinkSync(outside, logicalAic);
    const trapFile = join(root, "trap.sqlite");
    writeFileSync(trapFile, "");
    symlinkSync(trapFile, join(outside, "aic.sqlite"));
    const dbPath = join(root, ".aic", "aic.sqlite");
    expect(() =>
      openDatabaseReadOnly(dbPath, {
        mustStayWithinDir: toFilePath(logicalAic),
      }),
    ).toThrow(ConfigError);
  });
});
