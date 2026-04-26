// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { openDatabase, closeDatabase } from "@jatbas/aic-core/storage/open-database.js";
import { SystemClock } from "@jatbas/aic-core/adapters/system-clock.js";
import { NodePathAdapter } from "@jatbas/aic-core/adapters/node-path-adapter.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import { runCliDiagnosticsAndExit } from "../cli-diagnostics.js";

describe("cli-diagnostics", () => {
  const originalHome = process.env["HOME"];
  const originalCwd = process.cwd();

  afterEach(() => {
    process.env["HOME"] = originalHome;
    process.chdir(originalCwd);
    vi.restoreAllMocks();
  });

  it("cli_status_unknown_project_exits_1", async () => {
    const homeTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-home-"));
    const aicDir = path.join(homeTmp, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const dbPath = path.join(aicDir, "aic.sqlite");
    const clock = new SystemClock();
    const db = openDatabase(dbPath, clock);
    closeDatabase(db);
    process.env["HOME"] = homeTmp;
    const projectTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-proj-"));
    process.chdir(projectTmp);
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    runCliDiagnosticsAndExit(["status"]);
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(1);
    });
    expect(stderrSpy.mock.calls.some((c) => String(c[0]).includes("not known"))).toBe(
      true,
    );
    fs.rmSync(homeTmp, { recursive: true, force: true });
    fs.rmSync(projectTmp, { recursive: true, force: true });
  });

  it("cli_projects_prints_header", async () => {
    const homeTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-home-"));
    const aicDir = path.join(homeTmp, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const dbPath = path.join(aicDir, "aic.sqlite");
    const clock = new SystemClock();
    const db = openDatabase(dbPath, clock);
    const pid = toProjectId("018f0000-0000-7000-8000-00000000aa01");
    const projectTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-proj-"));
    const normalised = new NodePathAdapter().normalise(toAbsolutePath(projectTmp));
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(pid, normalised, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    closeDatabase(db);
    process.env["HOME"] = homeTmp;
    process.chdir(projectTmp);
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((msg) => {
      chunks.push(String(msg));
      return true;
    });
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false }) as typeof globalThis.fetch;
    runCliDiagnosticsAndExit(["projects"]);
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(0);
    });
    expect(chunks.join("")).toContain("Projects =");
    fs.rmSync(homeTmp, { recursive: true, force: true });
    fs.rmSync(projectTmp, { recursive: true, force: true });
  });

  it("cli_status_respects_project_flag_when_cwd_unknown", async () => {
    const homeTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-home-"));
    const aicDir = path.join(homeTmp, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const dbPath = path.join(aicDir, "aic.sqlite");
    const clock = new SystemClock();
    const db = openDatabase(dbPath, clock);
    const pid = toProjectId("018f0000-0000-7000-8000-00000000aa02");
    const pathA = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-path-a-"));
    const pathB = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-path-b-"));
    const normalised = new NodePathAdapter().normalise(toAbsolutePath(pathA));
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(pid, normalised, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    closeDatabase(db);
    process.env["HOME"] = homeTmp;
    process.chdir(pathB);
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((msg) => {
      chunks.push(String(msg));
      return true;
    });
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false }) as typeof globalThis.fetch;
    runCliDiagnosticsAndExit(["status", "--project", pathA]);
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(0);
    });
    expect(chunks.join("")).toContain("Status = project-level AIC status.");
    fs.rmSync(homeTmp, { recursive: true, force: true });
    fs.rmSync(pathA, { recursive: true, force: true });
    fs.rmSync(pathB, { recursive: true, force: true });
  });

  it("cli_status_nd_window_ok", async () => {
    const homeTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-home-"));
    const aicDir = path.join(homeTmp, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const dbPath = path.join(aicDir, "aic.sqlite");
    const clock = new SystemClock();
    const db = openDatabase(dbPath, clock);
    const pid = toProjectId("018f0000-0000-7000-8000-00000000aa04");
    const pathA = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-path-a-"));
    const normalised = new NodePathAdapter().normalise(toAbsolutePath(pathA));
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(pid, normalised, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    closeDatabase(db);
    process.env["HOME"] = homeTmp;
    process.chdir(pathA);
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((msg) => {
      chunks.push(String(msg));
      return true;
    });
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false }) as typeof globalThis.fetch;
    runCliDiagnosticsAndExit(["status", "90d", "--project", pathA]);
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(0);
    });
    const joined = chunks.join("");
    expect(joined).toContain("Time range");
    expect(joined).toContain("Last 90 days");
    fs.rmSync(homeTmp, { recursive: true, force: true });
    fs.rmSync(pathA, { recursive: true, force: true });
  });

  it("cli_last_respects_project_flag_when_cwd_unknown", async () => {
    const homeTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-home-"));
    const aicDir = path.join(homeTmp, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const dbPath = path.join(aicDir, "aic.sqlite");
    const clock = new SystemClock();
    const db = openDatabase(dbPath, clock);
    const pid = toProjectId("018f0000-0000-7000-8000-00000000aa03");
    const pathA = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-path-a-"));
    const pathB = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-path-b-"));
    const normalised = new NodePathAdapter().normalise(toAbsolutePath(pathA));
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(pid, normalised, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    closeDatabase(db);
    process.env["HOME"] = homeTmp;
    process.chdir(pathB);
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((msg) => {
      chunks.push(String(msg));
      return true;
    });
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    runCliDiagnosticsAndExit(["last", "--project", pathA]);
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(0);
    });
    expect(chunks.join("")).toContain("Last = most recent compilation.");
    fs.rmSync(homeTmp, { recursive: true, force: true });
    fs.rmSync(pathA, { recursive: true, force: true });
    fs.rmSync(pathB, { recursive: true, force: true });
  });

  it("cli_quality_window_lines", async () => {
    const homeTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-home-"));
    const aicDir = path.join(homeTmp, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const dbPath = path.join(aicDir, "aic.sqlite");
    const clock = new SystemClock();
    const db = openDatabase(dbPath, clock);
    const pid = toProjectId("018f0000-0000-7000-8000-00000000aa05");
    const projectTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-proj-"));
    const normalised = new NodePathAdapter().normalise(toAbsolutePath(projectTmp));
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(pid, normalised, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    closeDatabase(db);
    process.env["HOME"] = homeTmp;
    process.chdir(projectTmp);
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((msg) => {
      chunks.push(String(msg));
      return true;
    });
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    runCliDiagnosticsAndExit(["quality", "--project", projectTmp]);
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(0);
    });
    const out = chunks.join("");
    const physicalLines = out.split("\n").filter((line) => line.length > 0);
    expect(physicalLines.length).toBeLessThanOrEqual(45);
    expect(out).toContain("Last 7 days");
    fs.rmSync(homeTmp, { recursive: true, force: true });
    fs.rmSync(projectTmp, { recursive: true, force: true });
  });

  it("cli_quality_zero_compilations_omits_sections", async () => {
    const homeTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-home-"));
    const aicDir = path.join(homeTmp, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const dbPath = path.join(aicDir, "aic.sqlite");
    const clock = new SystemClock();
    const db = openDatabase(dbPath, clock);
    const pid = toProjectId("018f0000-0000-7000-8000-00000000aa06");
    const projectTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-proj-"));
    const normalised = new NodePathAdapter().normalise(toAbsolutePath(projectTmp));
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(pid, normalised, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    closeDatabase(db);
    process.env["HOME"] = homeTmp;
    process.chdir(projectTmp);
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((msg) => {
      chunks.push(String(msg));
      return true;
    });
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    runCliDiagnosticsAndExit(["quality", "--project", projectTmp]);
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(0);
    });
    const out = chunks.join("");
    expect(out).not.toMatch(/\nTier mix\n/);
    expect(out).not.toMatch(/Task class mix\s+count\s+share\s+budget/);
    expect(out).not.toContain("Daily compilations");
    fs.rmSync(homeTmp, { recursive: true, force: true });
    fs.rmSync(projectTmp, { recursive: true, force: true });
  });

  it("cli_last_prints_compiled_in_row", async () => {
    const homeTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-home-"));
    const aicDir = path.join(homeTmp, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const dbPath = path.join(aicDir, "aic.sqlite");
    const clock = new SystemClock();
    const db = openDatabase(dbPath, clock);
    const pid = toProjectId("018f0000-0000-7000-8000-00000000aa07");
    const projectTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-proj-"));
    const normalised = new NodePathAdapter().normalise(toAbsolutePath(projectTmp));
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(pid, normalised, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    closeDatabase(db);
    process.env["HOME"] = homeTmp;
    process.chdir(projectTmp);
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((msg) => {
      chunks.push(String(msg));
      return true;
    });
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    runCliDiagnosticsAndExit(["last", "--project", projectTmp]);
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(0);
    });
    expect(chunks.join("")).toContain("Compiled in");
    fs.rmSync(homeTmp, { recursive: true, force: true });
    fs.rmSync(projectTmp, { recursive: true, force: true });
  });

  it("cli_status_prints_session_time_row", async () => {
    const homeTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-home-"));
    const aicDir = path.join(homeTmp, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const dbPath = path.join(aicDir, "aic.sqlite");
    const clock = new SystemClock();
    const db = openDatabase(dbPath, clock);
    const pid = toProjectId("018f0000-0000-7000-8000-00000000aa08");
    const projectTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-proj-"));
    const normalised = new NodePathAdapter().normalise(toAbsolutePath(projectTmp));
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(pid, normalised, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    closeDatabase(db);
    process.env["HOME"] = homeTmp;
    process.chdir(projectTmp);
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((msg) => {
      chunks.push(String(msg));
      return true;
    });
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false }) as typeof globalThis.fetch;
    runCliDiagnosticsAndExit(["status", "--project", projectTmp]);
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(0);
    });
    expect(chunks.join("")).toContain("Sessions total time");
    fs.rmSync(homeTmp, { recursive: true, force: true });
    fs.rmSync(projectTmp, { recursive: true, force: true });
  });

  it("cli_chat_summary_prints_elapsed_row", async () => {
    const homeTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-home-"));
    const aicDir = path.join(homeTmp, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const dbPath = path.join(aicDir, "aic.sqlite");
    const clock = new SystemClock();
    const db = openDatabase(dbPath, clock);
    const pid = toProjectId("018f0000-0000-7000-8000-00000000aa09");
    const projectTmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cli-proj-"));
    const normalised = new NodePathAdapter().normalise(toAbsolutePath(projectTmp));
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(pid, normalised, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    closeDatabase(db);
    process.env["HOME"] = homeTmp;
    process.chdir(projectTmp);
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((msg) => {
      chunks.push(String(msg));
      return true;
    });
    const exitMock = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    runCliDiagnosticsAndExit(["chat-summary", "--project", projectTmp]);
    await vi.waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(0);
    });
    expect(chunks.join("")).toContain("Session time");
    fs.rmSync(homeTmp, { recursive: true, force: true });
    fs.rmSync(projectTmp, { recursive: true, force: true });
  });
});
