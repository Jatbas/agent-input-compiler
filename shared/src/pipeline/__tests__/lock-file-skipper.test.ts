import { describe, it, expect } from "vitest";
import { LockFileSkipper } from "../lock-file-skipper.js";
import { toRelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

describe("LockFileSkipper", () => {
  it("lock_file_returns_placeholder", () => {
    const skipper = new LockFileSkipper();
    const content = "# yarn lockfile v1\nresolved...";
    const result = skipper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("yarn.lock"),
    );
    expect(result.startsWith("[Lock file:")).toBe(true);
    expect(result).toContain("yarn.lock");
  });

  it("non_lock_path_returns_unchanged", () => {
    const skipper = new LockFileSkipper();
    const content = "regular content";
    const result = skipper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("src/app.ts"),
    );
    expect(result).toBe("regular content");
  });

  it("package_lock_json_returns_placeholder", () => {
    const skipper = new LockFileSkipper();
    const content = '{"lockfileVersion": 3}';
    const result = skipper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("package-lock.json"),
    );
    expect(result.startsWith("[Lock file:")).toBe(true);
    expect(result).toContain("package-lock.json");
  });

  it("shrinkwrap_returns_placeholder", () => {
    const skipper = new LockFileSkipper();
    const content = '{"name":"pkg"}';
    const result = skipper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("npm-shrinkwrap.json"),
    );
    expect(result.startsWith("[Lock file:")).toBe(true);
    expect(result).toContain("npm-shrinkwrap.json");
  });

  it("empty_lock_file_returns_placeholder", () => {
    const skipper = new LockFileSkipper();
    const content = "";
    const result = skipper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("yarn.lock"),
    );
    expect(result).toMatch(/\[Lock file: yarn\.lock, 0 bytes — skipped\]/);
  });

  it("safety_lock_placeholder_format", () => {
    const skipper = new LockFileSkipper();
    const content = "content";
    const result = skipper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("pnpm-lock.yaml"),
    );
    expect(result).toBe("[Lock file: pnpm-lock.yaml, 7 bytes — skipped]");
  });
});
