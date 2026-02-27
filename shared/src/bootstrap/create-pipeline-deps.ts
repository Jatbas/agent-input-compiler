import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { RulePackProvider } from "#core/interfaces/rule-pack-provider.interface.js";
import type { BudgetConfig } from "#core/interfaces/budget-config.interface.js";
import type { HeuristicSelectorConfig } from "#core/interfaces/heuristic-selector-config.interface.js";
import type { PipelineStepsDeps } from "#core/run-pipeline-steps.js";
import type { TokenCount } from "#core/types/units.js";
import { IntentClassifier } from "#pipeline/intent-classifier.js";
import { RulePackResolver } from "#pipeline/rule-pack-resolver.js";
import { BudgetAllocator } from "#pipeline/budget-allocator.js";
import { HeuristicSelector } from "#pipeline/heuristic-selector.js";
import { ExclusionScanner } from "#pipeline/exclusion-scanner.js";
import { SecretScanner } from "#pipeline/secret-scanner.js";
import { PromptInjectionScanner } from "#pipeline/prompt-injection-scanner.js";
import { ContextGuard } from "#pipeline/context-guard.js";
import { WhitespaceNormalizer } from "#pipeline/whitespace-normalizer.js";
import { CommentStripper } from "#pipeline/comment-stripper.js";
import { JsonCompactor } from "#pipeline/json-compactor.js";
import { LockFileSkipper } from "#pipeline/lock-file-skipper.js";
import { ContentTransformerPipeline } from "#pipeline/content-transformer-pipeline.js";
import { SummarisationLadder } from "#pipeline/summarisation-ladder.js";
import { PromptAssembler } from "#pipeline/prompt-assembler.js";
import { TiktokenAdapter } from "#adapters/tiktoken-adapter.js";
import { TypeScriptProvider } from "#adapters/typescript-provider.js";
import { GenericProvider } from "#adapters/generic-provider.js";
import { FastGlobAdapter } from "#adapters/fast-glob-adapter.js";
import { IgnoreAdapter } from "#adapters/ignore-adapter.js";
import { FileSystemRepoMapSupplier } from "#adapters/file-system-repo-map-supplier.js";

export type PipelineDepsWithoutRepoMap = Omit<PipelineStepsDeps, "repoMapSupplier">;

export function createPipelineDeps(
  fileContentReader: FileContentReader,
  rulePackProvider: RulePackProvider,
  budgetConfig: BudgetConfig,
  heuristicSelectorConfig?: HeuristicSelectorConfig,
): PipelineDepsWithoutRepoMap {
  const tiktokenAdapter = new TiktokenAdapter();
  const tokenCounter = (text: string): TokenCount => tiktokenAdapter.countTokens(text);
  const typeScriptProvider = new TypeScriptProvider();
  const genericProvider = new GenericProvider();
  const languageProviders = [typeScriptProvider, genericProvider] as const;
  const intentClassifier = new IntentClassifier();
  const rulePackResolver = new RulePackResolver(rulePackProvider);
  const budgetAllocator = new BudgetAllocator(budgetConfig);
  const heuristicSelector = new HeuristicSelector(
    languageProviders,
    heuristicSelectorConfig ?? { maxFiles: 20 },
  );
  const exclusionScanner = new ExclusionScanner();
  const secretScanner = new SecretScanner();
  const promptInjectionScanner = new PromptInjectionScanner();
  const scanners = [exclusionScanner, secretScanner, promptInjectionScanner] as const;
  const contextGuard = new ContextGuard(scanners, fileContentReader, []);
  const whitespaceNormalizer = new WhitespaceNormalizer();
  const commentStripper = new CommentStripper();
  const jsonCompactor = new JsonCompactor();
  const lockFileSkipper = new LockFileSkipper();
  const transformers = [
    whitespaceNormalizer,
    commentStripper,
    jsonCompactor,
    lockFileSkipper,
  ] as const;
  const contentTransformerPipeline = new ContentTransformerPipeline(
    transformers,
    fileContentReader,
    tokenCounter,
  );
  const summarisationLadder = new SummarisationLadder(
    languageProviders,
    tokenCounter,
    fileContentReader,
  );
  const promptAssembler = new PromptAssembler(fileContentReader);
  return {
    intentClassifier,
    rulePackResolver,
    budgetAllocator,
    contextSelector: heuristicSelector,
    contextGuard,
    contentTransformerPipeline,
    summarisationLadder,
    promptAssembler,
    tokenCounter: tiktokenAdapter,
  };
}

export function createFullPipelineDeps(
  fileContentReader: FileContentReader,
  rulePackProvider: RulePackProvider,
  budgetConfig: BudgetConfig,
  heuristicSelectorConfig?: HeuristicSelectorConfig,
): PipelineStepsDeps {
  const partial = createPipelineDeps(
    fileContentReader,
    rulePackProvider,
    budgetConfig,
    heuristicSelectorConfig,
  );
  const repoMapSupplier = new FileSystemRepoMapSupplier(
    new FastGlobAdapter(),
    new IgnoreAdapter(),
    fileContentReader,
    partial.tokenCounter,
  );
  return { ...partial, repoMapSupplier };
}
