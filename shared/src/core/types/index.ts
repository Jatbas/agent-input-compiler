// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

export { type Brand } from "./brand.js";

export {
  type AbsolutePath,
  type RelativePath,
  type FilePath,
  type GlobPattern,
  type FileExtension,
  toAbsolutePath,
  toRelativePath,
  toFilePath,
  toGlobPattern,
  toFileExtension,
} from "./paths.js";

export {
  type TokenCount,
  type Milliseconds,
  type Bytes,
  type LineNumber,
  type StepIndex,
  toTokenCount,
  toMilliseconds,
  toBytes,
  toLineNumber,
  toStepIndex,
} from "./units.js";

export {
  type Percentage,
  type Confidence,
  type RelevanceScore,
  toPercentage,
  toConfidence,
  toRelevanceScore,
} from "./scores.js";

export {
  type ISOTimestamp,
  type UUIDv7,
  type SessionId,
  type ConversationId,
  type RepoId,
  type SemanticVersion,
  toISOTimestamp,
  toUUIDv7,
  toSessionId,
  toConversationId,
  toRepoId,
  toSemanticVersion,
} from "./identifiers.js";

export {
  TASK_CLASS,
  type TaskClass,
  EDITOR_ID,
  type EditorId,
  MODEL_PROVIDER,
  type ModelProvider,
  INCLUSION_TIER,
  type InclusionTier,
  SYMBOL_TYPE,
  type SymbolType,
  SYMBOL_KIND,
  type SymbolKind,
  TOOL_OUTPUT_TYPE,
  type ToolOutputType,
  OUTPUT_FORMAT,
  type OutputFormat,
  GUARD_SEVERITY,
  type GuardSeverity,
  GUARD_FINDING_TYPE,
  type GuardFindingType,
  PIPELINE_EVENT_TYPE,
  type PipelineEventType,
  RULES_FINDING_SEVERITY,
  type RulesFindingSeverity,
} from "./enums.js";

export type { PathWithStat } from "./path-with-stat.js";
export type { ImportRef } from "./import-ref.js";
export type { CodeChunk } from "./code-chunk.js";
export type { ExportedSymbol } from "./exported-symbol.js";
export type { TaskClassification } from "./task-classification.js";
export type { RulePack } from "./rule-pack.js";
export type { SelectedFile, ContextResult } from "./selected-file.js";
export type { GuardFinding, GuardResult } from "./guard-types.js";
export type {
  TransformContext,
  TransformResult,
  TransformMetadata,
} from "./transform-types.js";
export type { FileEntry, RepoMap } from "./repo-map.js";
export type { CompilationLogEntry } from "./compilation-log-entry.js";
export type {
  ToolOutput,
  CompilationRequest,
  CompilationMeta,
  CachedCompilation,
} from "./compilation-types.js";
export type { TelemetryEvent } from "./telemetry-types.js";
export type { InspectRequest, PipelineTrace } from "./inspect-types.js";
export type { ResolvedConfig } from "./resolved-config.js";
export { defaultResolvedConfig } from "./resolved-config.js";
