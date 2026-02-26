// Temporary stub — remove when real CompilationRunner is wired.
import type { CompilationMeta } from "#core/types/compilation-types.js";
import { toTokenCount, toMilliseconds } from "#core/types/units.js";
import { toPercentage } from "#core/types/scores.js";
import { TASK_CLASS, EDITOR_ID, INCLUSION_TIER } from "#core/types/enums.js";

export const STUB_COMPILATION_META: CompilationMeta = {
  intent: "",
  taskClass: TASK_CLASS.GENERAL,
  filesSelected: 0,
  filesTotal: 0,
  tokensRaw: toTokenCount(0),
  tokensCompiled: toTokenCount(0),
  tokenReductionPct: toPercentage(0),
  cacheHit: false,
  durationMs: toMilliseconds(0),
  modelId: "",
  editorId: EDITOR_ID.GENERIC,
  transformTokensSaved: toTokenCount(0),
  summarisationTiers: {
    [INCLUSION_TIER.L0]: 0,
    [INCLUSION_TIER.L1]: 0,
    [INCLUSION_TIER.L2]: 0,
    [INCLUSION_TIER.L3]: 0,
  },
  guard: null,
};
