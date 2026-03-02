import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { RulePackProvider } from "#core/interfaces/rule-pack-provider.interface.js";
import type { BudgetConfig } from "#core/interfaces/budget-config.interface.js";
import type { HeuristicSelectorConfig } from "#core/interfaces/heuristic-selector-config.interface.js";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { PipelineStepsDeps } from "#core/run-pipeline-steps.js";
import type { FileExtension } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";
import { toFileExtension } from "#core/types/paths.js";
import { IntentClassifier } from "#pipeline/intent-classifier.js";
import { RulePackResolver } from "#pipeline/rule-pack-resolver.js";
import { BudgetAllocator } from "#pipeline/budget-allocator.js";
import { HeuristicSelector } from "#pipeline/heuristic-selector.js";
import { ImportGraphProximityScorer } from "#pipeline/import-graph-proximity-scorer.js";
import { ExclusionScanner } from "#pipeline/exclusion-scanner.js";
import { SecretScanner } from "#pipeline/secret-scanner.js";
import { PromptInjectionScanner } from "#pipeline/prompt-injection-scanner.js";
import { ContextGuard } from "#pipeline/context-guard.js";
import { Base64InlineDataStripper } from "#pipeline/base64-inline-data-stripper.js";
import { LongStringLiteralTruncator } from "#pipeline/long-string-literal-truncator.js";
import { DocstringTrimmer } from "#pipeline/docstring-trimmer.js";
import { LicenseHeaderStripper } from "#pipeline/license-header-stripper.js";
import { WhitespaceNormalizer } from "#pipeline/whitespace-normalizer.js";
import { CommentStripper } from "#pipeline/comment-stripper.js";
import { JsonCompactor } from "#pipeline/json-compactor.js";
import { LockFileSkipper } from "#pipeline/lock-file-skipper.js";
import { CssVariableSummarizer } from "#pipeline/css-variable-summarizer.js";
import { TypeDeclarationCompactor } from "#pipeline/type-declaration-compactor.js";
import { ContentTransformerPipeline } from "#pipeline/content-transformer-pipeline.js";
import { SummarisationLadder } from "#pipeline/summarisation-ladder.js";
import { PromptAssembler } from "#pipeline/prompt-assembler.js";
import { IntentAwareFileDiscoverer } from "#pipeline/intent-aware-file-discoverer.js";
import { TiktokenAdapter } from "#adapters/tiktoken-adapter.js";
import { TypeScriptProvider } from "#adapters/typescript-provider.js";
import { GenericImportProvider } from "#adapters/generic-import-provider.js";
import { GenericProvider } from "#adapters/generic-provider.js";
import { FastGlobAdapter } from "#adapters/fast-glob-adapter.js";
import { IgnoreAdapter } from "#adapters/ignore-adapter.js";
import { FileSystemRepoMapSupplier } from "#adapters/file-system-repo-map-supplier.js";

export type PipelineDepsWithoutRepoMap = Omit<PipelineStepsDeps, "repoMapSupplier">;

const WHITESPACE_EXCLUDED_EXTENSIONS: readonly FileExtension[] = [
  toFileExtension(".md"),
  toFileExtension(".mdx"),
  toFileExtension(".py"),
  toFileExtension(".yml"),
  toFileExtension(".yaml"),
];

export function createPipelineDeps(
  fileContentReader: FileContentReader,
  rulePackProvider: RulePackProvider,
  budgetConfig: BudgetConfig,
  additionalProviders?: readonly LanguageProvider[],
  heuristicSelectorConfig?: HeuristicSelectorConfig,
): PipelineDepsWithoutRepoMap {
  const tiktokenAdapter = new TiktokenAdapter();
  const tokenCounter = (text: string): TokenCount => tiktokenAdapter.countTokens(text);
  const typeScriptProvider = new TypeScriptProvider();
  const genericImportProvider = new GenericImportProvider();
  const genericProvider = new GenericProvider();
  const languageProviders = [
    typeScriptProvider,
    ...(additionalProviders ?? []),
    genericImportProvider,
    genericProvider,
  ] as const;
  const intentClassifier = new IntentClassifier();
  const rulePackResolver = new RulePackResolver(rulePackProvider);
  const budgetAllocator = new BudgetAllocator(budgetConfig);
  const importProximityScorer = new ImportGraphProximityScorer(
    fileContentReader,
    languageProviders,
  );
  const heuristicSelector = new HeuristicSelector(
    languageProviders,
    heuristicSelectorConfig ?? { maxFiles: 20 },
    importProximityScorer,
  );
  const exclusionScanner = new ExclusionScanner();
  const secretScanner = new SecretScanner();
  const promptInjectionScanner = new PromptInjectionScanner();
  const scanners = [exclusionScanner, secretScanner, promptInjectionScanner] as const;
  const contextGuard = new ContextGuard(scanners, fileContentReader, []);
  const whitespaceNormalizer = new WhitespaceNormalizer(WHITESPACE_EXCLUDED_EXTENSIONS);
  const commentStripper = new CommentStripper();
  const jsonCompactor = new JsonCompactor();
  const lockFileSkipper = new LockFileSkipper();
  const cssVariableSummarizer = new CssVariableSummarizer();
  const typeDeclarationCompactor = new TypeDeclarationCompactor();
  const licenseHeaderStripper = new LicenseHeaderStripper();
  const base64InlineDataStripper = new Base64InlineDataStripper();
  const longStringLiteralTruncator = new LongStringLiteralTruncator();
  const docstringTrimmer = new DocstringTrimmer();
  const transformers = [
    licenseHeaderStripper,
    base64InlineDataStripper,
    longStringLiteralTruncator,
    docstringTrimmer,
    whitespaceNormalizer,
    commentStripper,
    jsonCompactor,
    lockFileSkipper,
    cssVariableSummarizer,
    typeDeclarationCompactor,
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
  const intentAwareFileDiscoverer = new IntentAwareFileDiscoverer();
  return {
    intentClassifier,
    rulePackResolver,
    budgetAllocator,
    contextSelector: heuristicSelector,
    contextGuard,
    contentTransformerPipeline,
    summarisationLadder,
    promptAssembler,
    intentAwareFileDiscoverer,
    tokenCounter: tiktokenAdapter,
  };
}

export function createFullPipelineDeps(
  fileContentReader: FileContentReader,
  rulePackProvider: RulePackProvider,
  budgetConfig: BudgetConfig,
  additionalProviders?: readonly LanguageProvider[],
  heuristicSelectorConfig?: HeuristicSelectorConfig,
): PipelineStepsDeps {
  const partial = createPipelineDeps(
    fileContentReader,
    rulePackProvider,
    budgetConfig,
    additionalProviders,
    heuristicSelectorConfig,
  );
  const repoMapSupplier = new FileSystemRepoMapSupplier(
    new FastGlobAdapter(),
    new IgnoreAdapter(),
  );
  return { ...partial, repoMapSupplier };
}
