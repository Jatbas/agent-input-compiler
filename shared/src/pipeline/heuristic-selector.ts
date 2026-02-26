import type { ContextSelector } from "#core/interfaces/context-selector.interface.js";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { TokenCount } from "#core/types/units.js";
import type { ContextResult } from "#core/types/selected-file.js";
import type { FileEntry } from "#core/types/repo-map.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import { INCLUSION_TIER } from "#core/types/enums.js";
import { toRelevanceScore } from "#core/types/scores.js";
import { toTokenCount } from "#core/types/units.js";

function matchesGlob(path: string, pattern: string): boolean {
  const p = pattern as string;
  if (p.includes("**")) {
    const parts = p.split("**").map((s) => s.replace(/\*/g, "[^/]*"));
    const prefix = parts[0] ?? "";
    const suffix = parts[1] ?? "";
    if (prefix.length > 0 && suffix.length > 0)
      return path.startsWith(prefix) && path.endsWith(suffix);
    if (prefix.length > 0) return path.startsWith(prefix);
    if (suffix.length > 0) return path.endsWith(suffix);
    return true;
  }
  const re = new RegExp("^" + p.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$");
  return re.test(path);
}

function pathRelevance(path: string, keywords: readonly string[]): number {
  if (keywords.length === 0) return 0;
  const lower = path.toLowerCase();
  const hits = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  return Math.min(1, hits.length / keywords.length);
}

function minMaxNorm(values: readonly number[], value: number): number {
  if (values.length === 0) return 0;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return 1;
  return (value - min) / (max - min);
}

export interface HeuristicSelectorConfig {
  readonly maxFiles: number;
  readonly weights?: {
    readonly pathRelevance: number;
    readonly importProximity: number;
    readonly recency: number;
    readonly sizePenalty: number;
  };
}

const DEFAULT_WEIGHTS = {
  pathRelevance: 0.4,
  importProximity: 0.3,
  recency: 0.2,
  sizePenalty: 0.1,
};

export class HeuristicSelector implements ContextSelector {
  constructor(
    private readonly languageProviders: readonly LanguageProvider[],
    private readonly config: HeuristicSelectorConfig,
  ) {}

  selectContext(
    task: TaskClassification,
    repo: RepoMap,
    budget: TokenCount,
    rulePack: RulePack,
  ): ContextResult {
    const weights = this.config.weights ?? DEFAULT_WEIGHTS;
    const maxFiles = this.config.maxFiles;

    const candidates = repo.files.filter((f) => {
      const path = f.path as string;
      if (
        rulePack.includePatterns.length > 0 &&
        !rulePack.includePatterns.some((pat) => matchesGlob(path, pat as string))
      )
        return false;
      if (rulePack.excludePatterns.some((pat) => matchesGlob(path, pat as string)))
        return false;
      return true;
    });

    const pathRelevances = candidates.map((f) =>
      pathRelevance(f.path as string, task.matchedKeywords),
    );
    const recencyValues = candidates.map((f) => f.lastModified as string);
    const tokenValues = candidates.map((f) => f.estimatedTokens as number);

    const recencyNorm = (i: number): number => {
      const sorted = recencyValues.toSorted();
      const val = recencyValues[i] ?? "";
      const idx = sorted.indexOf(val);
      if (sorted.length <= 1) return 1;
      return idx / (sorted.length - 1);
    };
    const sizePenaltyNorm = (i: number): number =>
      1 - minMaxNorm(tokenValues, tokenValues[i] ?? 0);

    const scored: readonly { entry: FileEntry; score: number }[] = candidates.map(
      (entry, i) => {
        const pathRel = pathRelevances[i] ?? 0;
        const importProx = 0;
        const rec = recencyNorm(i);
        const sizeP = sizePenaltyNorm(i);
        let score =
          pathRel * weights.pathRelevance +
          importProx * weights.importProximity +
          rec * weights.recency +
          sizeP * weights.sizePenalty;

        const path = entry.path as string;
        rulePack.heuristic?.boostPatterns.forEach((pat) => {
          if (matchesGlob(path, pat as string)) score += 0.2;
        });
        rulePack.heuristic?.penalizePatterns.forEach((pat) => {
          if (matchesGlob(path, pat as string)) score -= 0.2;
        });
        score = Math.max(0, Math.min(1, score));
        return { entry, score };
      },
    );

    const sorted = scored.toSorted((a, b) => b.score - a.score);

    const budgetNum = budget as number;
    const { files, totalTokens: totalTokensNum } = sorted.reduce<{
      readonly files: readonly SelectedFile[];
      readonly totalTokens: number;
    }>(
      (acc, { entry, score }) => {
        if (acc.files.length >= maxFiles) return acc;
        const tokens = entry.estimatedTokens as number;
        if (acc.totalTokens + tokens > budgetNum) return acc;
        return {
          files: [
            ...acc.files,
            {
              path: entry.path,
              language: entry.language,
              estimatedTokens: entry.estimatedTokens,
              relevanceScore: toRelevanceScore(score),
              tier: INCLUSION_TIER.L0,
            },
          ],
          totalTokens: acc.totalTokens + tokens,
        };
      },
      { files: [], totalTokens: 0 },
    );

    const truncated = files.length < candidates.length || totalTokensNum >= budgetNum;
    return {
      files,
      totalTokens: toTokenCount(totalTokensNum),
      truncated,
    };
  }
}
