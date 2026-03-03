import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { statusCommand } from "../status.js";
import { StatusArgsSchema } from "../../schemas/status-args.js";
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

describe("statusCommand", () => {
  it("valid_args_stdout_stub", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-status-stub-"));
    const aicDir = path.join(projectRoot, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "");
    try {
      const parsed = StatusArgsSchema.parse({
        projectRoot,
        configPath: null,
        dbPath: null,
      });
      const acc: { chunks: readonly string[] } = { chunks: [] };
      const origWrite = process.stdout.write;
      process.stdout.write = (chunk: string | Uint8Array) => {
        const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        acc.chunks = [...acc.chunks, s];
        return true;
      };
      try {
        await statusCommand(parsed, stubRunner);
        const out = acc.chunks.join("");
        expect(out).toContain("Compilations");
        expect(out).toContain("fix bug");
      } finally {
        process.stdout.write = origWrite;
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true });
    }
  });

  it("no_database_message_exit0", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-status-no-db-"));
    try {
      const parsed = StatusArgsSchema.parse({
        projectRoot,
        configPath: null,
        dbPath: null,
      });
      const acc: { chunks: readonly string[] } = { chunks: [] };
      const origWrite = process.stdout.write;
      process.stdout.write = (chunk: string | Uint8Array) => {
        const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        acc.chunks = [...acc.chunks, s];
        return true;
      };
      try {
        await statusCommand(parsed, stubRunner);
        expect(acc.chunks.join("")).toContain("No AIC database found");
      } finally {
        process.stdout.write = origWrite;
      }
    } finally {
      fs.rmdirSync(projectRoot);
    }
  });

  it("no_compilations_message", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-status-zero-comp-"));
    const aicDir = path.join(projectRoot, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "");
    try {
      const parsed = StatusArgsSchema.parse({
        projectRoot,
        configPath: null,
        dbPath: null,
      });
      const acc: { chunks: readonly string[] } = { chunks: [] };
      const origWrite = process.stdout.write;
      process.stdout.write = (chunk: string | Uint8Array) => {
        const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        acc.chunks = [...acc.chunks, s];
        return true;
      };
      try {
        await statusCommand(parsed, zeroCompilationsStub);
        expect(acc.chunks.join("")).toContain("No compilations recorded yet");
      } finally {
        process.stdout.write = origWrite;
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true });
    }
  });

  it("runner_throws_aic_error", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-status-throw-"));
    const aicDir = path.join(projectRoot, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "");
    try {
      const parsed = StatusArgsSchema.parse({
        projectRoot,
        configPath: null,
        dbPath: null,
      });
      const stderrAcc: { chunks: readonly string[] } = { chunks: [] };
      const origStderr = process.stderr.write;
      process.stderr.write = (chunk: string | Uint8Array) => {
        const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        stderrAcc.chunks = [...stderrAcc.chunks, s];
        return true;
      };
      try {
        await expect(statusCommand(parsed, throwingRunner)).rejects.toThrow();
        expect(stderrAcc.chunks.join("")).toContain("test");
      } finally {
        process.stderr.write = origStderr;
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true });
    }
  });

  it("budget_utilization_shown_with_default_budget", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-status-budget-default-"));
    const aicDir = path.join(projectRoot, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "");
    try {
      const parsed = StatusArgsSchema.parse({
        projectRoot,
        configPath: null,
        dbPath: null,
      });
      const acc: { chunks: readonly string[] } = { chunks: [] };
      const origWrite = process.stdout.write;
      process.stdout.write = (chunk: string | Uint8Array) => {
        const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        acc.chunks = [...acc.chunks, s];
        return true;
      };
      try {
        await statusCommand(parsed, stubRunner);
        const out = acc.chunks.join("");
        expect(out).toContain("Budget utilization");
        expect(out).toContain("90%");
        expect(out.includes("7,200/8,000") || out.includes("7200/8000")).toBe(true);
      } finally {
        process.stdout.write = origWrite;
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true });
    }
  });

  it("budget_utilization_dash_when_no_last_compilation", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-status-budget-nolast-"));
    const aicDir = path.join(projectRoot, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "");
    const runnerNoLast: StatusRunner = {
      status() {
        return Promise.resolve({
          ...fixtureAggregates,
          compilationsTotal: 1,
          lastCompilation: null,
        });
      },
    };
    try {
      const parsed = StatusArgsSchema.parse({
        projectRoot,
        configPath: null,
        dbPath: null,
      });
      const acc: { chunks: readonly string[] } = { chunks: [] };
      const origWrite = process.stdout.write;
      process.stdout.write = (chunk: string | Uint8Array) => {
        const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        acc.chunks = [...acc.chunks, s];
        return true;
      };
      try {
        await statusCommand(parsed, runnerNoLast);
        expect(acc.chunks.join("")).toContain("Budget utilization: —");
      } finally {
        process.stdout.write = origWrite;
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true });
    }
  });

  it("budget_utilization_uses_config_when_present", async () => {
    const projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-status-budget-config-"));
    const aicDir = path.join(projectRoot, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "");
    fs.writeFileSync(
      path.join(projectRoot, "aic.config.json"),
      '{"contextBudget":{"maxTokens":10000}}',
    );
    const configPath = path.join(projectRoot, "aic.config.json");
    const runnerWithLast: StatusRunner = {
      status() {
        return Promise.resolve({
          ...fixtureAggregates,
          lastCompilation: fixtureAggregates.lastCompilation
            ? { ...fixtureAggregates.lastCompilation, tokensCompiled: 7200 }
            : null,
        });
      },
    };
    try {
      const parsed = StatusArgsSchema.parse({
        projectRoot,
        configPath,
        dbPath: null,
      });
      const acc: { chunks: readonly string[] } = { chunks: [] };
      const origWrite = process.stdout.write;
      process.stdout.write = (chunk: string | Uint8Array) => {
        const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
        acc.chunks = [...acc.chunks, s];
        return true;
      };
      try {
        await statusCommand(parsed, runnerWithLast);
        const out = acc.chunks.join("");
        expect(out).toContain("72%");
        expect(out.includes("7,200/10,000") || out.includes("7200/10000")).toBe(true);
      } finally {
        process.stdout.write = origWrite;
      }
    } finally {
      fs.rmSync(projectRoot, { recursive: true });
    }
  });
});
