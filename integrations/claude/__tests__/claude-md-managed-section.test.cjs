// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const installScript = path.join(__dirname, "..", "install.cjs");
const repoPkgPath = path.join(__dirname, "..", "..", "..", "package.json");

const CLAUDE_MD_OPENING_LINE =
  "<!-- BEGIN AIC MANAGED SECTION — do not edit between these markers -->";
const CLAUDE_MD_CLOSING_LINE = "<!-- END AIC MANAGED SECTION -->";
const INVALID_MANAGED_VERSION = "0.0.0-aic-test-invalid";

function loadRepoPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(repoPkgPath, "utf8"));
  if (typeof pkg.version !== "string") {
    throw new Error("Expected string package.version");
  }
  return pkg.version;
}

function buildTestEnv(tmpHome) {
  const env = { ...process.env };
  env.HOME = tmpHome;
  delete env.CURSOR_PROJECT_DIR;
  delete env.CLAUDE_PROJECT_DIR;
  return env;
}

function runInstall(projectRoot) {
  execFileSync("node", [installScript], {
    cwd: projectRoot,
    env: buildTestEnv(projectRoot),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readProjectClaudeMd(projectRoot) {
  return fs.readFileSync(path.join(projectRoot, ".claude", "CLAUDE.md"), "utf8");
}

function managedBlockWithInnerVersion(innerVersion) {
  return `${CLAUDE_MD_OPENING_LINE}\n<!-- AIC rule version: ${innerVersion} -->\n# placeholder\n${CLAUDE_MD_CLOSING_LINE}\n`;
}

function fresh_install_claude_md_has_markers() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-claude-md-fresh-"),
  );
  try {
    const expectedVersion = loadRepoPackageVersion();
    runInstall(tmpDir);
    const raw = readProjectClaudeMd(tmpDir);
    if (!raw.includes(CLAUDE_MD_OPENING_LINE)) {
      throw new Error("Expected opening marker line");
    }
    if (!raw.includes(CLAUDE_MD_CLOSING_LINE)) {
      throw new Error("Expected closing marker line");
    }
    if (!raw.includes("BEGIN AIC MANAGED SECTION")) {
      throw new Error("Expected BEGIN AIC MANAGED SECTION text");
    }
    const verLine = `<!-- AIC rule version: ${expectedVersion} -->`;
    if (!raw.includes(verLine)) {
      throw new Error("Expected version line for repo package version");
    }
    console.log("fresh_install_claude_md_has_markers: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function upgrade_replaces_managed_preserves_surrounding() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-claude-md-upgrade-"),
  );
  try {
    const expectedVersion = loadRepoPackageVersion();
    const prefix = "USER_PREFIX_LINE_A\n";
    const suffix = "\nUSER_SUFFIX_LINE_Z";
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    const initial = `${prefix}${managedBlockWithInnerVersion(INVALID_MANAGED_VERSION)}${suffix}`;
    fs.writeFileSync(path.join(claudeDir, "CLAUDE.md"), initial, "utf8");
    runInstall(tmpDir);
    const after = readProjectClaudeMd(tmpDir);
    if (!after.startsWith(prefix)) {
      throw new Error("Expected prefix unchanged");
    }
    if (!after.endsWith(suffix)) {
      throw new Error("Expected suffix unchanged");
    }
    const verLine = `<!-- AIC rule version: ${expectedVersion} -->`;
    if (!after.includes(verLine)) {
      throw new Error("Expected upgraded inner version");
    }
    const openings = after.split(CLAUDE_MD_OPENING_LINE).length - 1;
    if (openings !== 1) {
      throw new Error(`Expected exactly one opening marker, got ${String(openings)}`);
    }
    console.log("upgrade_replaces_managed_preserves_surrounding: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function same_version_skips_write() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-claude-md-mtime-"),
  );
  try {
    runInstall(tmpDir);
    const mdPath = path.join(tmpDir, ".claude", "CLAUDE.md");
    const m1 = fs.statSync(mdPath).mtimeMs;
    runInstall(tmpDir);
    const m2 = fs.statSync(mdPath).mtimeMs;
    if (m1 !== m2) {
      throw new Error(`Expected unchanged mtimeMs, got ${String(m1)} vs ${String(m2)}`);
    }
    console.log("same_version_skips_write: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function legacy_without_markers_appends_managed() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-claude-md-legacy-"),
  );
  try {
    const expectedVersion = loadRepoPackageVersion();
    const userOnly = "user line one\nuser line two\n";
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, "CLAUDE.md"), userOnly, "utf8");
    runInstall(tmpDir);
    const after = readProjectClaudeMd(tmpDir);
    const expectedHead = `${userOnly.replace(/\n+$/, "")}\n\n${CLAUDE_MD_OPENING_LINE}`;
    if (!after.startsWith(expectedHead)) {
      throw new Error("Expected original user lines, blank line, then opening marker");
    }
    if (!after.includes(CLAUDE_MD_CLOSING_LINE)) {
      throw new Error("Expected managed closing marker");
    }
    const verLine = `<!-- AIC rule version: ${expectedVersion} -->`;
    if (!after.includes(verLine)) {
      throw new Error("Expected managed version from package.json");
    }
    console.log("legacy_without_markers_appends_managed: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function empty_file_writes_managed_only() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-claude-md-empty-"),
  );
  try {
    const expectedVersion = loadRepoPackageVersion();
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, "CLAUDE.md"), "", "utf8");
    runInstall(tmpDir);
    const after = readProjectClaudeMd(tmpDir);
    if (
      !after.includes(CLAUDE_MD_OPENING_LINE) ||
      !after.includes(CLAUDE_MD_CLOSING_LINE)
    ) {
      throw new Error("Expected both marker lines");
    }
    if (!after.includes("BEGIN AIC MANAGED SECTION")) {
      throw new Error("Expected BEGIN marker text");
    }
    const verLine = `<!-- AIC rule version: ${expectedVersion} -->`;
    if (!after.includes(verLine)) {
      throw new Error("Expected version line");
    }
    const openings = after.split(CLAUDE_MD_OPENING_LINE).length - 1;
    if (openings !== 1) {
      throw new Error(`Expected one opening marker, got ${String(openings)}`);
    }
    console.log("empty_file_writes_managed_only: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function content_before_and_after_preserved_on_upgrade() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-claude-md-surround-"),
  );
  try {
    const expectedVersion = loadRepoPackageVersion();
    const before = "line before managed\n";
    const afterUser = "\nline after managed\n";
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    const initial = `${before}${managedBlockWithInnerVersion(INVALID_MANAGED_VERSION)}${afterUser}`;
    fs.writeFileSync(path.join(claudeDir, "CLAUDE.md"), initial, "utf8");
    runInstall(tmpDir);
    const after = readProjectClaudeMd(tmpDir);
    if (!after.startsWith(before)) {
      throw new Error("Expected content before markers preserved");
    }
    if (!after.endsWith(afterUser)) {
      throw new Error("Expected content after markers preserved");
    }
    const verLine = `<!-- AIC rule version: ${expectedVersion} -->`;
    if (!after.includes(verLine)) {
      throw new Error("Expected upgraded version inside managed section");
    }
    console.log("content_before_and_after_preserved_on_upgrade: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

fresh_install_claude_md_has_markers();
upgrade_replaces_managed_preserves_surrounding();
same_version_skips_write();
legacy_without_markers_appends_managed();
empty_file_writes_managed_only();
content_before_and_after_preserved_on_upgrade();
