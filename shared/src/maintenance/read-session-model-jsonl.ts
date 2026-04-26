// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { closeSync, fstatSync, openSync, readFileSync, readSync } from "node:fs";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { joinUnderProjectAic } from "@jatbas/aic-core/storage/ensure-aic-dir.js";
import {
  reduceSessionModelJsonlState,
  selectSessionModelIdFromJsonlContent,
} from "./select-session-model-from-jsonl.js";

// 262144: 24h retention plus append-only growth keeps hot-path reads bounded
const SESSION_MODEL_JSONL_MAX_TAIL_BYTES = 262144;

function openSessionModelsJsonlReadFd(jsonlPath: string): number | null {
  try {
    return openSync(jsonlPath, "r");
  } catch {
    return null;
  }
}

function jsonlSuffixFromTailChunk(startOffset: number, tailUtf8: string): string {
  if (startOffset === 0) {
    return tailUtf8;
  }
  const nl = tailUtf8.indexOf("\n");
  if (nl === -1) {
    return "";
  }
  return tailUtf8.slice(nl + 1);
}

export function readSessionModelIdFromSessionModelsJsonl(
  projectRoot: AbsolutePath,
  conversationId: string | null,
  editorId: string,
): string | null {
  const jsonlPath = joinUnderProjectAic(projectRoot, "session-models.jsonl");
  const fdOrNull = openSessionModelsJsonlReadFd(jsonlPath);
  if (fdOrNull === null) {
    return null;
  }
  const fd = fdOrNull;
  try {
    const { size } = fstatSync(fd);
    if (size === 0) {
      return null;
    }
    const start = Math.max(0, size - SESSION_MODEL_JSONL_MAX_TAIL_BYTES);
    const readLen = Math.min(SESSION_MODEL_JSONL_MAX_TAIL_BYTES, size - start);
    const buffer = Buffer.alloc(SESSION_MODEL_JSONL_MAX_TAIL_BYTES);
    const bytesRead = readSync(fd, buffer, 0, readLen, start);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    const suffix = jsonlSuffixFromTailChunk(start, text);
    const suffixState = reduceSessionModelJsonlState(suffix, conversationId, editorId);
    const cid = typeof conversationId === "string" ? conversationId.trim() : "";
    if (cid.length > 0 && suffixState.match === null) {
      return selectSessionModelIdFromJsonlContent(
        readFileSync(jsonlPath, "utf8"),
        conversationId,
        editorId,
      );
    }
    if (cid.length === 0 && suffixState.last === null && size > 0) {
      return selectSessionModelIdFromJsonlContent(
        readFileSync(jsonlPath, "utf8"),
        conversationId,
        editorId,
      );
    }
    return suffixState.match ?? suffixState.last;
  } catch {
    return null;
  } finally {
    try {
      closeSync(fd);
    } catch {
      // ignore close errors
    }
  }
}
