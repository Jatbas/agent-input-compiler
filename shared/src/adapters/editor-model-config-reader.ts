// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import type { EditorModelConfigReader } from "#core/interfaces/editor-model-config-reader.interface.js";
import type { EditorId } from "#core/types/enums.js";
import { EDITOR_ID } from "#core/types/enums.js";

function readModelFromPath(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  try {
    const parsed: { model?: string } = JSON.parse(content) as { model?: string };
    const value = parsed.model;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

export class EditorModelConfigReaderAdapter implements EditorModelConfigReader {
  constructor(private readonly homeDir: string) {}

  read(editorId: EditorId): string | null {
    if (editorId === EDITOR_ID.CURSOR) {
      const fullPath = path.join(this.homeDir, ".cursor", "settings.json");
      return readModelFromPath(fullPath);
    }
    if (editorId === EDITOR_ID.CLAUDE_CODE) {
      const fullPath = path.join(this.homeDir, ".claude", "settings.json");
      return readModelFromPath(fullPath);
    }
    return null;
  }
}
