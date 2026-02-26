import type { SummarisationLadder as ISummarisationLadder } from "#core/interfaces/summarisation-ladder.interface.js";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { TokenCount } from "#core/types/units.js";
import type { InclusionTier } from "#core/types/enums.js";
import type { RelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

const TIER_ORDER: readonly InclusionTier[] = [
  INCLUSION_TIER.L0,
  INCLUSION_TIER.L1,
  INCLUSION_TIER.L2,
  INCLUSION_TIER.L3,
];

function nextTier(tier: InclusionTier): InclusionTier | null {
  const i = TIER_ORDER.indexOf(tier);
  return i >= 0 && i < TIER_ORDER.length - 1 ? (TIER_ORDER[i + 1] ?? null) : null;
}

function getProvider(
  path: string,
  providers: readonly LanguageProvider[],
): LanguageProvider | undefined {
  const ext = path.slice(path.lastIndexOf("."));
  return providers.find((p) =>
    p.extensions.some((e) => (e as string).toLowerCase() === ext.toLowerCase()),
  );
}

export class SummarisationLadder implements ISummarisationLadder {
  constructor(
    private readonly languageProviders: readonly LanguageProvider[],
    private readonly tokenCounter: (text: string) => TokenCount,
    private readonly fileContentReader: FileContentReader,
  ) {}

  compress(files: readonly SelectedFile[], budget: TokenCount): readonly SelectedFile[] {
    const budgetNum = budget as number;
    let total = files.reduce((s, f) => s + (f.estimatedTokens as number), 0);
    if (total <= budgetNum) return files;

    const sorted = files.toSorted((a, b) => {
      const scoreA = a.relevanceScore as number;
      const scoreB = b.relevanceScore as number;
      if (scoreA !== scoreB) return scoreA - scoreB;
      const tokA = a.estimatedTokens as number;
      const tokB = b.estimatedTokens as number;
      if (tokA !== tokB) return tokB - tokA;
      return (a.path as string).localeCompare(b.path as string);
    });

    let current: readonly SelectedFile[] = sorted.map((f) => ({ ...f }));
    const tokenAtTier = (file: SelectedFile, tier: InclusionTier): TokenCount => {
      const path = file.path as RelativePath;
      const content = this.fileContentReader.getContent(path);
      const provider = getProvider(path as string, this.languageProviders);
      let text: string;
      if (tier === INCLUSION_TIER.L0) text = content;
      else if (tier === INCLUSION_TIER.L1) {
        if (provider === undefined) return tokenAtTier(file, INCLUSION_TIER.L2);
        const chunks = provider.extractSignaturesWithDocs(content);
        text = chunks.map((c) => c.content).join("\n");
      } else if (tier === INCLUSION_TIER.L2) {
        if (provider !== undefined) {
          const chunks = provider.extractSignaturesOnly(content);
          text = chunks.map((c) => c.content).join("\n");
        } else {
          const matches = content.match(/(?:function|class|def|pub\s+fn)\s+\w+/g) ?? [];
          text = matches.join("\n");
        }
      } else {
        if (provider !== undefined) {
          const names = provider.extractNames(content);
          text = (file.path as string) + "\n" + names.map((n) => n.name).join(", ");
        } else {
          text = (file.path as string) + "\n";
        }
      }
      return this.tokenCounter(text);
    };

    for (let round = 0; round < current.length * TIER_ORDER.length; round++) {
      total = current.reduce((s, f) => s + (f.estimatedTokens as number), 0);
      if (total <= budgetNum) break;

      const lowestIdx = current.reduce((best, _f, i) => {
        const score =
          (current[i]!.relevanceScore as number) -
          (current[best]!.relevanceScore as number);
        if (score !== 0) return score < 0 ? i : best;
        const tok =
          (current[best]!.estimatedTokens as number) -
          (current[i]!.estimatedTokens as number);
        if (tok !== 0) return tok > 0 ? best : i;
        return (current[i]!.path as string).localeCompare(current[best]!.path as string) <
          0
          ? i
          : best;
      }, 0);
      const file = current[lowestIdx]!;
      const next = nextTier(file.tier);
      if (next === null) break;
      const newTokens = tokenAtTier(file, next);
      current = current.map((f, i) =>
        i === lowestIdx ? { ...f, tier: next, estimatedTokens: newTokens } : f,
      );
    }

    total = current.reduce((s, f) => s + (f.estimatedTokens as number), 0);
    if (total <= budgetNum) return current;

    let drop: readonly SelectedFile[] = current.toSorted((a, b) => {
      const scoreA = a.relevanceScore as number;
      const scoreB = b.relevanceScore as number;
      if (scoreA !== scoreB) return scoreA - scoreB;
      const tokA = a.estimatedTokens as number;
      const tokB = b.estimatedTokens as number;
      if (tokA !== tokB) return tokB - tokA;
      return (a.path as string).localeCompare(b.path as string);
    });
    while (drop.length > 0) {
      const sum = drop.reduce((s, f) => s + (f.estimatedTokens as number), 0);
      if (sum <= budgetNum) break;
      drop = drop.slice(0, -1);
    }
    return drop;
  }
}
