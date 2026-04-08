// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SummarisationLadder as ISummarisationLadder } from "@jatbas/aic-core/core/interfaces/summarisation-ladder.interface.js";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type { FileContentReader } from "@jatbas/aic-core/core/interfaces/file-content-reader.interface.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";
import type { CodeChunk } from "@jatbas/aic-core/core/types/code-chunk.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import { getProvider } from "./get-provider.js";

type TierTextFn = (
  content: string,
  provider: LanguageProvider | undefined,
  filePath: string,
) => string;

const TIER_TEXT: Readonly<Record<InclusionTier, TierTextFn>> = {
  [INCLUSION_TIER.L0]: (content) => content,
  [INCLUSION_TIER.L1]: (content, provider, filePath) => {
    if (provider === undefined) {
      return TIER_TEXT[INCLUSION_TIER.L2](content, provider, filePath);
    }
    const chunks = provider.extractSignaturesWithDocs(content);
    return chunks.map((c) => c.content).join("\n");
  },
  [INCLUSION_TIER.L2]: (content, provider) => {
    if (provider !== undefined) {
      const chunks = provider.extractSignaturesOnly(content);
      return chunks.map((c) => c.content).join("\n");
    }
    const matches = content.match(/(?:function|class|def|pub\s+fn)\s+\w+/g) ?? [];
    return matches.join("\n");
  },
  [INCLUSION_TIER.L3]: (content, provider, filePath) => {
    if (provider !== undefined) {
      const names = provider.extractNames(content);
      return filePath + "\n" + names.map((n) => n.name).join(", ");
    }
    return filePath + "\n";
  },
};

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

function buildChunkResolvedContent(
  content: string,
  provider: LanguageProvider,
  subjectTokens: readonly string[],
): string {
  const withDocs = provider.extractSignaturesWithDocs(content);
  const signaturesOnly = provider.extractSignaturesOnly(content);
  const sigBySymbol = signaturesOnly.reduce<Record<string, string>>(
    (acc, c) => ({ ...acc, [c.symbolName]: c.content }),
    {},
  );
  const parts = withDocs.map((chunk: CodeChunk) => {
    const matched = subjectTokens.some((t) =>
      chunk.symbolName.toLowerCase().includes(t.toLowerCase()),
    );
    return matched ? chunk.content : (sigBySymbol[chunk.symbolName] ?? chunk.content);
  });
  return parts.join("\n");
}

export class SummarisationLadder implements ISummarisationLadder {
  constructor(
    private readonly languageProviders: readonly LanguageProvider[],
    private readonly tokenCounter: (text: string) => TokenCount,
    private readonly fileContentReader: FileContentReader,
  ) {}

  async compress(
    files: readonly SelectedFile[],
    budget: TokenCount,
    subjectTokens?: readonly string[],
  ): Promise<readonly SelectedFile[]> {
    const budgetNum = budget;
    const initialTotal = sumTokens(files);
    const useChunkLevel = subjectTokens !== undefined && subjectTokens.length > 0;
    if (!useChunkLevel && initialTotal <= budgetNum) return files;

    const contentMap = new Map<SelectedFile["path"], string>();
    await Promise.all(
      files.map(async (f) => {
        contentMap.set(f.path, await this.fileContentReader.getContent(f.path));
      }),
    );

    if (useChunkLevel) {
      const chunkLevelFiles = files.map((f) => {
        const content = contentMap.get(f.path) ?? "";
        const provider = getProvider(f.path, this.languageProviders);
        if (provider === undefined) return f;
        const resolvedContent = buildChunkResolvedContent(
          content,
          provider,
          subjectTokens,
        );
        const estimatedTokens = this.tokenCounter(resolvedContent);
        return { ...f, resolvedContent, estimatedTokens };
      });
      if (sumTokens(chunkLevelFiles) <= budgetNum) return chunkLevelFiles;
    }

    const sorted = files.toSorted(byRelevanceThenSize);
    const tokenAtTier = (file: SelectedFile, tier: InclusionTier): TokenCount => {
      const filePath = file.path;
      const content = contentMap.get(filePath) ?? "";
      const provider = getProvider(filePath, this.languageProviders);
      const text = TIER_TEXT[tier](content, provider, file.path);
      return this.tokenCounter(text);
    };

    const demoted = demoteLoop(
      sorted.map((f) => ({ ...f })),
      budgetNum,
      tokenAtTier,
      sorted.length * TIER_ORDER.length,
    );

    if (sumTokens(demoted) <= budgetNum) return demoted;

    return dropToFit(demoted.toSorted(byRelevanceThenSize), budgetNum);
  }
}

function sumTokens(files: readonly SelectedFile[]): number {
  return files.reduce((s, f) => s + f.estimatedTokens, 0);
}

function compareDemotionPriority(a: SelectedFile, b: SelectedFile): number {
  const scoreA = a.relevanceScore;
  const scoreB = b.relevanceScore;
  if (scoreA !== scoreB) return scoreA - scoreB;
  const tokA = a.estimatedTokens;
  const tokB = b.estimatedTokens;
  if (tokA !== tokB) return tokB - tokA;
  return a.path.localeCompare(b.path);
}

function byRelevanceThenSize(a: SelectedFile, b: SelectedFile): number {
  return compareDemotionPriority(a, b);
}

type RowIndexHeap = { readonly indices: number[] };

function demotionSmallerHeapSlot(
  heap: RowIndexHeap,
  working: SelectedFile[],
  slotA: number,
  slotB: number,
): number {
  const { indices } = heap;
  const rowIdxA = indices[slotA];
  const rowIdxB = indices[slotB];
  if (rowIdxA === undefined) return slotB;
  if (rowIdxB === undefined) return slotA;
  const fileA = working[rowIdxA];
  const fileB = working[rowIdxB];
  if (fileA === undefined) return slotB;
  if (fileB === undefined) return slotA;
  return compareDemotionPriority(fileA, fileB) <= 0 ? slotA : slotB;
}

function swapHeap(heap: RowIndexHeap, i: number, j: number): void {
  const { indices } = heap;
  const rowAtI = indices[i];
  const rowAtJ = indices[j];
  if (rowAtI === undefined || rowAtJ === undefined) return;
  indices[i] = rowAtJ;
  indices[j] = rowAtI;
}

function siftDownHeap(
  heap: RowIndexHeap,
  working: SelectedFile[],
  heapPos: number,
): void {
  const left = 2 * heapPos + 1;
  const right = 2 * heapPos + 2;
  const n = heap.indices.length;
  const withLeft =
    left < n ? demotionSmallerHeapSlot(heap, working, heapPos, left) : heapPos;
  const best =
    right < n ? demotionSmallerHeapSlot(heap, working, withLeft, right) : withLeft;
  if (best !== heapPos) {
    swapHeap(heap, heapPos, best);
    siftDownHeap(heap, working, best);
  }
}

function siftUpHeap(heap: RowIndexHeap, working: SelectedFile[], heapPos: number): void {
  if (heapPos <= 0) return;
  const parent = Math.floor((heapPos - 1) / 2);
  const { indices } = heap;
  const rowChildIdx = indices[heapPos];
  const rowParentIdx = indices[parent];
  if (rowChildIdx === undefined || rowParentIdx === undefined) return;
  const childFile = working[rowChildIdx];
  const parentFile = working[rowParentIdx];
  if (childFile === undefined || parentFile === undefined) return;
  if (compareDemotionPriority(childFile, parentFile) >= 0) return;
  swapHeap(heap, parent, heapPos);
  siftUpHeap(heap, working, parent);
}

function heapRestoreAt(
  heap: RowIndexHeap,
  working: SelectedFile[],
  heapPos: number,
): void {
  siftUpHeap(heap, working, heapPos);
  siftDownHeap(heap, working, heapPos);
}

function heapifyPositions(
  heap: RowIndexHeap,
  working: SelectedFile[],
  pos: number,
): void {
  if (pos < 0) return;
  siftDownHeap(heap, working, pos);
  heapifyPositions(heap, working, pos - 1);
}

function buildMinHeapIndices(working: SelectedFile[]): RowIndexHeap {
  const indices = Array.from({ length: working.length }, (_, i) => i);
  const heap: RowIndexHeap = { indices };
  const lastParent = Math.floor(indices.length / 2) - 1;
  heapifyPositions(heap, working, lastParent);
  return heap;
}

function heapPeekMin(heap: RowIndexHeap): number | undefined {
  return heap.indices[0];
}

function demoteLoop(
  files: readonly SelectedFile[],
  budgetNum: number,
  tokenAtTier: (file: SelectedFile, tier: InclusionTier) => TokenCount,
  remainingRounds: number,
): readonly SelectedFile[] {
  if (remainingRounds <= 0) return files;
  if (sumTokens(files) <= budgetNum) return files;
  const working: SelectedFile[] = files.map((f) => ({ ...f }));
  const rowHeap = buildMinHeapIndices(working);
  const step = (rounds: number): readonly SelectedFile[] => {
    if (rounds <= 0) return working;
    if (sumTokens(working) <= budgetNum) return working;
    const lowestIdx = heapPeekMin(rowHeap);
    if (lowestIdx === undefined) return working;
    const file = working[lowestIdx];
    if (file === undefined) return working;
    const next = nextTier(file.tier);
    if (next === null) return working;
    const newTokens = tokenAtTier(file, next);
    working[lowestIdx] = { ...file, tier: next, estimatedTokens: newTokens };
    heapRestoreAt(rowHeap, working, 0);
    return step(rounds - 1);
  };
  return step(remainingRounds);
}

function dropToFit(
  sorted: readonly SelectedFile[],
  budgetNum: number,
): readonly SelectedFile[] {
  const prefixSums = sorted.reduce<readonly number[]>((sums, f) => {
    const prev = sums.length > 0 ? (sums[sums.length - 1] ?? 0) : 0;
    return [...sums, prev + f.estimatedTokens];
  }, []);
  const keepCount = prefixSums.filter((s) => s <= budgetNum).length;
  return sorted.slice(0, keepCount);
}
