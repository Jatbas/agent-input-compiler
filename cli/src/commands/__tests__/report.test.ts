import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { reportCommand } from "../report.js";
import { ReportArgsSchema } from "../../schemas/report-args.js";
import type { StatusRunner } from "@aic/shared/core/interfaces/status-runner.interface.js";
import type { StatusAggregates } from "@aic/shared/core/types/status-types.js";
import { ConfigError } from "@aic/shared/core/errors/config-error.js";

const fixtureAggregates: StatusAggregates = {
  compilationsTotal: 1,
  compilationsToday: 0,
  cacheHitRatePct: 0,
  avgReductionPct: 10,
  totalTokensRaw: 50_000,
  totalTokensCompiled: 49_000,
  totalTokensSaved: 1000,
  telemetryDisabled: false,
  guardByType: {},
  topTaskClasses: [{ taskClass: "refactor", count: 1 }],
  lastCompilation: {
    intent: "fix bug",
    filesSelected: 8,
    filesTotal: 142,
    tokensCompiled: 7200,
    tokenReductionPct: 84,
    created_at: "2026-02-26T12:00:00.000Z",
    editorId: "cursor",
    modelId: "claude-sonnet-4-20250514",
  },
  installationOk: true,
  installationNotes: "",
};

const stubRunner: StatusRunner = {
  status() {
    return Promise.resolve(fixtureAggregates);
  },
};

const zeroCompilationsStub: StatusRunner = {
  status() {
    return Promise.resolve({
      ...fixtureAggregates,
      compilationsTotal: 0,
      lastCompilation: null,
    });
  },
};

const throwingRunner: StatusRunner = {
  status() {
    throw new ConfigError("test");
  },
};

describe("reportCommand", () => {
  it("report_writes_html_file", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-report-"));
    const aicDir = path.join(projectRoot, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "");
    const outputFile = path.join(projectRoot, "report.html");
    try {
      const parsed = ReportArgsSchema.parse({
        projectRoot,
        configPath: null,
        dbPath: null,
        outputPath: outputFile,
      });
      await reportCommand(parsed, stubRunner);
      expect(fs.existsSync(outputFile)).toBe(true);
      const content = fs.readFileSync(outputFile, "utf8");
      expect(content).toMatch(/<!DOCTYPE html>|DOCTYPE/);
      expect(content).toContain("Compilations");
      expect(content).toContain("fix bug");
    } finally {
      fs.rmSync(projectRoot, { recursive: true });
    }
  });

  it("report_no_database_exits_with_message", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-report-no-db-"));
    const outputFile = path.join(projectRoot, "report.html");
    try {
      const parsed = ReportArgsSchema.parse({
        projectRoot,
        configPath: null,
        dbPath: null,
        outputPath: outputFile,
      });
      const acc: { chunks: readonly string[] } = { chunks: [] };
      const origWrite = process.stdout.write;
      process.stdout.write = (chunk: string | Uint8Array) => {
        const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        acc.chunks = [...acc.chunks, s];
        return true;
      };
      try {
        await reportCommand(parsed, stubRunner);
        expect(acc.chunks.join("")).toContain("No AIC database found");
        expect(fs.existsSync(outputFile)).toBe(false);
    } finally {
      process.stdout.write = origWrite;
      }
    } finally {
      fs.rmdirSync(projectRoot);
    }
  });

  it("report_no_compilations_exits_with_message", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-report-zero-"));
    const aicDir = path.join(projectRoot, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "");
    const outputFile = path.join(projectRoot, "report.html");
    try {
      const parsed = ReportArgsSchema.parse({
        projectRoot,
        configPath: null,
        dbPath: null,
        outputPath: outputFile,
      });
      const acc: { chunks: readonly string[] } = { chunks: [] };
      const origWrite = process.stdout.write;
      process.stdout.write = (chunk: string | Uint8Array) => {
        const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        acc.chunks = [...acc.chunks, s];
        return true;
      };
      try {
        await reportCommand(parsed, zeroCompilationsStub);
        expect(acc.chunks.join("")).toContain("No compilations recorded yet");
        expect(fs.existsSync(outputFile)).toBe(false);
      } finally {
        process.stdout.write = origWrite;
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true });
    }
  });

  it("report_uses_default_output_path", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-report-default-"));
    const aicDir = path.join(projectRoot, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "");
    const defaultReportPath = path.join(projectRoot, ".aic", "report.html");
    try {
      const parsed = ReportArgsSchema.parse({
        projectRoot,
        configPath: null,
        dbPath: null,
        outputPath: null,
      });
      await reportCommand(parsed, stubRunner);
      expect(fs.existsSync(defaultReportPath)).toBe(true);
    } finally {
      fs.rmSync(projectRoot, { recursive: true });
    }
  });

  it("report_escapes_html_in_intent", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-report-escape-"));
    const aicDir = path.join(projectRoot, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "");
    const outputFile = path.join(projectRoot, "report.html");
    const scriptRunner: StatusRunner = {
      status() {
        return Promise.resolve({
          ...fixtureAggregates,
          lastCompilation: fixtureAggregates.lastCompilation
            ? { ...fixtureAggregates.lastCompilation, intent: "<script>" }
            : null,
        });
      },
    };
    try {
      const parsed = ReportArgsSchema.parse({
        projectRoot,
        configPath: null,
        dbPath: null,
        outputPath: outputFile,
      });
      await reportCommand(parsed, scriptRunner);
      const content = fs.readFileSync(outputFile, "utf8");
      expect(content).toContain("&lt;script&gt;");
      expect(content).not.toContain("<script>");
    } finally {
      fs.rmSync(projectRoot, { recursive: true });
    }
  });

  it("report_runner_throws_propagates", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-report-throw-"));
    const aicDir = path.join(projectRoot, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "");
    try {
      const parsed = ReportArgsSchema.parse({
        projectRoot,
        configPath: null,
        dbPath: null,
        outputPath: null,
      });
      const stderrAcc: { chunks: readonly string[] } = { chunks: [] };
      const origStderr = process.stderr.write;
      process.stderr.write = (chunk: string | Uint8Array) => {
        const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        stderrAcc.chunks = [...stderrAcc.chunks, s];
        return true;
      };
      try {
        await expect(reportCommand(parsed, throwingRunner)).rejects.toThrow();
        expect(stderrAcc.chunks.join("")).toContain("test");
      } finally {
        process.stderr.write = origStderr;
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true });
    }
  });
});
