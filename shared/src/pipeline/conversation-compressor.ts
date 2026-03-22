// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ConversationCompressor } from "@jatbas/aic-core/core/interfaces/conversation-compressor.interface.js";
import type { SessionStep } from "@jatbas/aic-core/core/types/session-dedup-types.js";

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
      const stepLine = `${i + 1}) ${trimmed} — ${step.filesSelected.length} files, ${step.tokensCompiled} tokens`;
      if (step.toolOutputs.length === 0) return stepLine;
      const byType = step.toolOutputs.reduce<Record<string, number>>((acc, o) => {
        const fileCount = o.relatedFiles?.length ?? 0;
        return { ...acc, [o.type]: (acc[o.type] ?? 0) + fileCount };
      }, {});
      const outputLines = Object.entries(byType).map(
        ([type, count]) => `  → ${type}: ${count} files`,
      );
      return [stepLine, ...outputLines].join("\n");
    });
    return header + lines.join("\n");
  }
}
