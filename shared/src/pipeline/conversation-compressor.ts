// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ConversationCompressor } from "#core/interfaces/conversation-compressor.interface.js";
import type { SessionStep } from "#core/types/session-dedup-types.js";

export class ConversationCompressorImpl implements ConversationCompressor {
  constructor() {}

  compress(steps: readonly SessionStep[]): string {
    if (steps.length === 0) return "";
    const header = "Steps completed:\n";
    const lines = steps.map((step, i) => {
      const trimmed =
        step.stepIntent !== null && step.stepIntent.trim() !== ""
          ? step.stepIntent.trim()
          : `Step ${i + 1}`;
      return `${i + 1}) ${trimmed} — ${step.filesSelected.length} files, ${step.tokensCompiled} tokens`;
    });
    return header + lines.join("\n");
  }
}
