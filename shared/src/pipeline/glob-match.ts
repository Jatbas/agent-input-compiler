// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

function pathMatchesLeadingDoubleStarTail(path: string, tail: string): boolean {
  const tailRe = tail.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
  return new RegExp("^(.*/)?" + tailRe + "$").test(path);
}

// Pure glob matching for pipeline use — no I/O, no external deps.
export function matchesGlob(path: string, pattern: string): boolean {
  if (pattern.startsWith("**/") && !pattern.includes("**", 2)) {
    return pathMatchesLeadingDoubleStarTail(path, pattern.slice(3));
  }
  if (pattern.includes("**")) {
    const parts = pattern.split("**").map((s) => s.replace(/\*/g, "[^/]*"));
    const prefix = parts[0] ?? "";
    const suffix = parts[1] ?? "";
    if (prefix.length > 0 && suffix.length > 0)
      return path.startsWith(prefix) && path.endsWith(suffix);
    if (prefix.length > 0) return path.startsWith(prefix);
    if (suffix.length > 0) return path.endsWith(suffix);
    return true;
  }
  const re = new RegExp(
    "^" + pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$",
  );
  return re.test(path);
}
