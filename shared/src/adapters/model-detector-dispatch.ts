import type { ModelDetector } from "#core/interfaces/model-detector.interface.js";
import type { ModelEnvHints } from "#core/types/model-env-hints.js";
import type { EditorId } from "#core/types/enums.js";
import { EDITOR_ID } from "#core/types/enums.js";

type DetectFn = (hints: ModelEnvHints) => string | null;

const DETECT_STRATEGIES: Record<EditorId, DetectFn> = {
  [EDITOR_ID.CURSOR]: (hints) => hints.cursorModel ?? null,
  [EDITOR_ID.CLAUDE_CODE]: (hints) => hints.anthropicModel ?? null,
  [EDITOR_ID.GENERIC]: () => null,
};

export class ModelDetectorDispatch implements ModelDetector {
  constructor(private readonly hints: ModelEnvHints) {}

  detect(editorId: EditorId): string | null {
    const strategy = DETECT_STRATEGIES[editorId];
    return strategy(this.hints);
  }
}
