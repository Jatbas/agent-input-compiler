// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  resolveAicServerId,
  toCursorProjectSlug,
} = require("../resolve-aic-server-id.cjs");

function slug_strips_leading_slash_and_replaces_special_chars() {
  if (toCursorProjectSlug("/Users/jatbas/Desktop/AIC") !== "Users-jatbas-Desktop-AIC") {
    throw new Error("Slug mismatch for /Users/jatbas/Desktop/AIC");
  }
  if (
    toCursorProjectSlug("/Users/jatbas/Desktop/EvalioIndex.com") !==
    "Users-jatbas-Desktop-EvalioIndex-com"
  ) {
    throw new Error("Slug mismatch for dotted path");
  }
  if (
    toCursorProjectSlug("/Users/jatbas/Desktop/Valega-DEV/htdocs") !==
    "Users-jatbas-Desktop-Valega-DEV-htdocs"
  ) {
    throw new Error("Slug mismatch for path with existing hyphens");
  }
  console.log("slug_strips_leading_slash_and_replaces_special_chars: pass");
}

function resolve_finds_project_level_server() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "aic-mcpres-"));
  const projectRoot = "/tmp/test-project";
  const slug = toCursorProjectSlug(projectRoot);
  const mcpsDir = path.join(tmpBase, slug, "mcps");
  const serverDir = path.join(mcpsDir, "project-0-test-project-aic-dev", "tools");
  fs.mkdirSync(serverDir, { recursive: true });
  fs.writeFileSync(path.join(serverDir, "aic_compile.json"), "{}", "utf8");
  try {
    const result = resolveAicServerId(projectRoot, { cursorProjectsDir: tmpBase });
    if (result !== "project-0-test-project-aic-dev") {
      throw new Error(`Expected project-0-test-project-aic-dev, got ${result}`);
    }
    console.log("resolve_finds_project_level_server: pass");
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

function resolve_finds_user_level_server() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "aic-mcpres-"));
  const projectRoot = "/tmp/test-project";
  const slug = toCursorProjectSlug(projectRoot);
  const mcpsDir = path.join(tmpBase, slug, "mcps");
  const serverDir = path.join(mcpsDir, "user-aic", "tools");
  fs.mkdirSync(serverDir, { recursive: true });
  fs.writeFileSync(path.join(serverDir, "aic_compile.json"), "{}", "utf8");
  try {
    const result = resolveAicServerId(projectRoot, { cursorProjectsDir: tmpBase });
    if (result !== "user-aic") {
      throw new Error(`Expected user-aic, got ${result}`);
    }
    console.log("resolve_finds_user_level_server: pass");
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

function resolve_prefers_project_level_over_user_level() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "aic-mcpres-"));
  const projectRoot = "/tmp/test-project";
  const slug = toCursorProjectSlug(projectRoot);
  const mcpsDir = path.join(tmpBase, slug, "mcps");
  const userDir = path.join(mcpsDir, "user-aic", "tools");
  const projDir = path.join(mcpsDir, "project-0-test-aic-dev", "tools");
  fs.mkdirSync(userDir, { recursive: true });
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(path.join(userDir, "aic_compile.json"), "{}", "utf8");
  fs.writeFileSync(path.join(projDir, "aic_compile.json"), "{}", "utf8");
  try {
    const result = resolveAicServerId(projectRoot, { cursorProjectsDir: tmpBase });
    if (result !== "project-0-test-aic-dev") {
      throw new Error(`Expected project-0-test-aic-dev, got ${result}`);
    }
    console.log("resolve_prefers_project_level_over_user_level: pass");
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

function resolve_returns_null_when_no_mcps_dir() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "aic-mcpres-"));
  try {
    const result = resolveAicServerId("/tmp/nonexistent", {
      cursorProjectsDir: tmpBase,
    });
    if (result !== null) {
      throw new Error(`Expected null, got ${result}`);
    }
    console.log("resolve_returns_null_when_no_mcps_dir: pass");
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

function resolve_returns_null_when_no_aic_tools() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "aic-mcpres-"));
  const projectRoot = "/tmp/test-project";
  const slug = toCursorProjectSlug(projectRoot);
  const mcpsDir = path.join(tmpBase, slug, "mcps");
  const otherDir = path.join(mcpsDir, "cursor-ide-browser", "tools");
  fs.mkdirSync(otherDir, { recursive: true });
  fs.writeFileSync(path.join(otherDir, "other_tool.json"), "{}", "utf8");
  try {
    const result = resolveAicServerId(projectRoot, { cursorProjectsDir: tmpBase });
    if (result !== null) {
      throw new Error(`Expected null, got ${result}`);
    }
    console.log("resolve_returns_null_when_no_aic_tools: pass");
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

function resolve_ignores_non_directory_entries() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "aic-mcpres-"));
  const projectRoot = "/tmp/test-project";
  const slug = toCursorProjectSlug(projectRoot);
  const mcpsDir = path.join(tmpBase, slug, "mcps");
  fs.mkdirSync(mcpsDir, { recursive: true });
  fs.writeFileSync(path.join(mcpsDir, "not-a-dir.json"), "{}", "utf8");
  try {
    const result = resolveAicServerId(projectRoot, { cursorProjectsDir: tmpBase });
    if (result !== null) {
      throw new Error(`Expected null, got ${result}`);
    }
    console.log("resolve_ignores_non_directory_entries: pass");
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  }
}

slug_strips_leading_slash_and_replaces_special_chars();
resolve_finds_project_level_server();
resolve_finds_user_level_server();
resolve_prefers_project_level_over_user_level();
resolve_returns_null_when_no_mcps_dir();
resolve_returns_null_when_no_aic_tools();
resolve_ignores_non_directory_entries();
console.log("All tests passed.");
