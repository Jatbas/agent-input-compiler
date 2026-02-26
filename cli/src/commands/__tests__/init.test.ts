import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { initCommand } from "../init.js";
import { InitArgsSchema } from "../../schemas/init-args.js";

describe("initCommand", () => {
  it("config_created_and_aic_dir_0700", async () => {
    const tempDir = fs.mkdtempSync(path.join(tmpdir(), "aic-init-"));
    try {
      const parsed = InitArgsSchema.parse({
        projectRoot: tempDir,
        configPath: null,
        dbPath: null,
        upgrade: false,
      });
      const outChunks: string[] = [];
      const origStdout = process.stdout.write;
      process.stdout.write = (chunk: string | Uint8Array) => {
        outChunks.push(
          typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
        );
        return true;
      };
      try {
        await initCommand(parsed);
        const stdout = outChunks.join("");
        expect(stdout).toContain("Created aic.config.json");
      } finally {
        process.stdout.write = origStdout;
      }
      const configPath = path.join(tempDir, "aic.config.json");
      expect(fs.existsSync(configPath)).toBe(true);
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
        version: number;
        contextBudget: { maxTokens: number };
      };
      expect(config.version).toBe(1);
      expect(config.contextBudget.maxTokens).toBe(8000);
      const aicDir = path.join(tempDir, ".aic");
      expect(fs.existsSync(aicDir)).toBe(true);
      const mode = fs.statSync(aicDir).mode & 0o777;
      expect(mode).toBe(0o700);
    } finally {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("gitignore_created_or_appended", async () => {
    const tempDir = fs.mkdtempSync(path.join(tmpdir(), "aic-init-"));
    try {
      const parsed = InitArgsSchema.parse({
        projectRoot: tempDir,
        configPath: null,
        dbPath: null,
        upgrade: false,
      });

      await initCommand(parsed);
      const gitignorePath = path.join(tempDir, ".gitignore");
      expect(fs.existsSync(gitignorePath)).toBe(true);
      const contentA = fs.readFileSync(gitignorePath, "utf8");
      expect(contentA).toContain(".aic/");
    } finally {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("gitignore_appended_when_exists", async () => {
    const tempDir = fs.mkdtempSync(path.join(tmpdir(), "aic-init-"));
    try {
      const gitignorePath = path.join(tempDir, ".gitignore");
      fs.writeFileSync(gitignorePath, "node_modules/\n", "utf8");
      const parsed = InitArgsSchema.parse({
        projectRoot: tempDir,
        configPath: null,
        dbPath: null,
        upgrade: false,
      });
      await initCommand(parsed);
      const content = fs.readFileSync(gitignorePath, "utf8");
      expect(content).toContain("node_modules/");
      expect(content).toContain(".aic/");
    } finally {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("gitignore_no_duplicate_aic_when_present", async () => {
    const tempDir = fs.mkdtempSync(path.join(tmpdir(), "aic-init-"));
    try {
      const gitignorePath = path.join(tempDir, ".gitignore");
      fs.writeFileSync(gitignorePath, ".aic/\n", "utf8");
      const parsed = InitArgsSchema.parse({
        projectRoot: tempDir,
        configPath: null,
        dbPath: null,
        upgrade: false,
      });
      await initCommand(parsed);
      const content = fs.readFileSync(gitignorePath, "utf8");
      const matches = content.match(/\.aic\/?/g);
      expect(matches).toHaveLength(1);
    } finally {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("config_already_exists_exits_with_message", async () => {
    const tempDir = fs.mkdtempSync(path.join(tmpdir(), "aic-init-"));
    try {
      fs.writeFileSync(path.join(tempDir, "aic.config.json"), "{}", "utf8");
      const parsed = InitArgsSchema.parse({
        projectRoot: tempDir,
        configPath: null,
        dbPath: null,
        upgrade: false,
      });
      const errChunks: string[] = [];
      const origStderr = process.stderr.write;
      process.stderr.write = (chunk: string | Uint8Array) => {
        errChunks.push(
          typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
        );
        return true;
      };
      try {
        await expect(initCommand(parsed)).rejects.toThrow();
        const stderr = errChunks.join("");
        expect(stderr).toContain("Config already exists");
      } finally {
        process.stderr.write = origStderr;
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  it("upgrade_backs_up_and_rewrites", async () => {
    const tempDir = fs.mkdtempSync(path.join(tmpdir(), "aic-init-"));
    try {
      const configPath = path.join(tempDir, "aic.config.json");
      const originalContent = '{"version":1}';
      fs.writeFileSync(configPath, originalContent, "utf8");
      const parsed = InitArgsSchema.parse({
        projectRoot: tempDir,
        configPath: null,
        dbPath: null,
        upgrade: true,
      });
      const outChunks: string[] = [];
      const origStdout = process.stdout.write;
      process.stdout.write = (chunk: string | Uint8Array) => {
        outChunks.push(
          typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
        );
        return true;
      };
      try {
        await initCommand(parsed);
        const stdout = outChunks.join("");
        expect(stdout).toContain("Config upgraded");
        expect(stdout).toContain("Backup saved");
      } finally {
        process.stdout.write = origStdout;
      }
      const bakPath = configPath + ".bak";
      expect(fs.existsSync(bakPath)).toBe(true);
      expect(fs.readFileSync(bakPath, "utf8")).toBe(originalContent);
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
        version: number;
      };
      expect(config.version).toBe(1);
    } finally {
      fs.rmSync(tempDir, { recursive: true });
    }
  });
});
