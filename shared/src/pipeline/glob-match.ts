// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

function pathMatchesLeadingDoubleStarTail(path: string, tail: string): boolean {
  const tailRe = tail.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
  return new RegExp("^(.*/)?" + tailRe + "$").test(path);
}

function escapeRegexLiteralChunk(chunk: string): string {
  return chunk.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function globStarFreeSegmentToRegex(segment: string): string {
  return segment.split("*").map(escapeRegexLiteralChunk).join("[^/]*");
}

function matchesGlobStarFreePath(path: string, pattern: string): boolean {
  return new RegExp("^" + globStarFreeSegmentToRegex(pattern) + "$").test(path);
}

function boundaryIndices(path: string): readonly number[] {
  const fromSlashes = [...path.matchAll(/\//g)].map((m) =>
    typeof m.index === "number" ? m.index + 1 : 0,
  );
  return [...new Set([0, ...fromSlashes, path.length])].toSorted((a, b) => a - b);
}

function matchesBoundaryLeft(left: string, before: string): boolean {
  if (before.includes("**")) return matchesGlobWithDoubleStars(left, before);
  if (before.startsWith("/")) {
    const tail = before.slice(1);
    return new RegExp("^(.*/)?" + globStarFreeSegmentToRegex(tail) + "$").test(left);
  }
  const body = globStarFreeSegmentToRegex(before);
  const exact = new RegExp("^" + body + "$");
  if (exact.test(left)) return true;
  return new RegExp("^" + body + "/$").test(left);
}

function matchAfterDoubleStar(path: string, after: string): boolean {
  if (after === "") return true;
  const patterns = after.startsWith("/")
    ? ([after, after.slice(1)] as const)
    : ([after] as const);
  return boundaryIndices(path).some((k) => {
    const tail = path.slice(k);
    return patterns.some((p) => matchesGlobWithDoubleStars(tail, p));
  });
}

function matchesGlobWithDoubleStars(path: string, pattern: string): boolean {
  const starIdx = pattern.indexOf("**");
  if (starIdx === -1) return matchesGlobStarFreePath(path, pattern);
  const before = pattern.slice(0, starIdx);
  const after = pattern.slice(starIdx + 2);
  if (before === "") return matchAfterDoubleStar(path, after);
  return boundaryIndices(path).some((k) => {
    const left = path.slice(0, k);
    const right = path.slice(k);
    return matchesBoundaryLeft(left, before) && matchAfterDoubleStar(right, after);
  });
}

// Pure glob matching for pipeline use — no I/O, no external deps.
export function matchesGlob(path: string, pattern: string): boolean {
  if (pattern.startsWith("**/") && !pattern.includes("**", 2)) {
    return pathMatchesLeadingDoubleStarTail(path, pattern.slice(3));
  }
  if (pattern.includes("**")) return matchesGlobWithDoubleStars(path, pattern);
  const re = new RegExp(
    "^" + pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$",
  );
  return re.test(path);
}
