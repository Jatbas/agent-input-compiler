// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { isAbiMismatch, formatRemediation } from "../preflight.js";

describe("preflight.isAbiMismatch", () => {
  it("matches the canonical Node error phrase", () => {
    const message =
      "The module '/path/better_sqlite3.node' was compiled against a different Node.js version using NODE_MODULE_VERSION 137.";
    expect(isAbiMismatch(message)).toBe(true);
  });

  it("matches on NODE_MODULE_VERSION alone", () => {
    expect(isAbiMismatch("NODE_MODULE_VERSION 127 required")).toBe(true);
  });

  it("matches on the compiled-against phrase alone", () => {
    expect(isAbiMismatch("error: was compiled against a different Node.js binary")).toBe(
      true,
    );
  });

  it("does not match unrelated errors", () => {
    expect(isAbiMismatch("Cannot find module 'better-sqlite3'")).toBe(false);
    expect(isAbiMismatch("EACCES: permission denied")).toBe(false);
    expect(isAbiMismatch("")).toBe(false);
  });
});

describe("preflight.formatRemediation", () => {
  it("includes the node version, ABI, pnpm remediation, and original error", () => {
    const out = formatRemediation(
      "The module was compiled against NODE_MODULE_VERSION 137",
      "v22.10.0",
    );
    expect(out).toContain("v22.10.0");
    expect(out).toContain(process.versions.modules);
    expect(out).toContain("pnpm install");
    expect(out).toContain("npx -y @jatbas/aic");
    expect(out).toContain(".nvmrc");
    expect(out).toContain("NODE_MODULE_VERSION 137");
  });

  it("ends with a trailing newline so stderr is clean", () => {
    const out = formatRemediation("detail", "v24.7.0");
    expect(out.endsWith("\n")).toBe(true);
  });
});
