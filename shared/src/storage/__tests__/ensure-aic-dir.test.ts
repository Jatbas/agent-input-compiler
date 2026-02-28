import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir, platform } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { toAbsolutePath } from "#core/types/paths.js";
import { ensureAicDir } from "../ensure-aic-dir.js";

describe("ensureAicDir", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  function makeTmpDir(): string {
    return mkdtempSync(join(realpathSync(tmpdir()), "aic-test-gitignore-"));
  }

  it("creates .aic directory with 0700 permissions", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    ensureAicDir(toAbsolutePath(tmp));
    const aicPath = join(tmp, ".aic");
    expect(existsSync(aicPath)).toBe(true);
    if (platform() !== "win32") {
      const mode = statSync(aicPath).mode & 0o777;
      expect(mode).toBe(0o700);
    }
  });

  it("creates .gitignore with .aic/ when no .gitignore exists", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toBe(".aic/\n");
  });

  it("appends .aic/ to existing .gitignore", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(join(tmp, ".gitignore"), "node_modules/\n", "utf8");
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toBe("node_modules/\n.aic/\n");
  });

  it("appends with newline separator when file does not end with newline", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(join(tmp, ".gitignore"), "node_modules/", "utf8");
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toBe("node_modules/\n.aic/\n");
  });

  it("does not duplicate when .aic/ already present", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(join(tmp, ".gitignore"), "node_modules/\n.aic/\n", "utf8");
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toBe("node_modules/\n.aic/\n");
  });

  it("does not duplicate when .aic (without slash) already present", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    writeFileSync(join(tmp, ".gitignore"), ".aic\ndist/\n", "utf8");
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toBe(".aic\ndist/\n");
  });

  it("is idempotent on repeated calls", () => {
    const tmp = makeTmpDir();
    dirs[dirs.length] = tmp;
    ensureAicDir(toAbsolutePath(tmp));
    ensureAicDir(toAbsolutePath(tmp));
    ensureAicDir(toAbsolutePath(tmp));
    const content = readFileSync(join(tmp, ".gitignore"), "utf8");
    expect(content).toBe(".aic/\n");
  });
});
