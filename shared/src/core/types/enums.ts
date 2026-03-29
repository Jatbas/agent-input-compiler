// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// String literal unions and as const objects for AIC enumerations (not TS enum).
export const TASK_CLASS = {
  REFACTOR: "refactor",
  BUGFIX: "bugfix",
  FEATURE: "feature",
  DOCS: "docs",
  TEST: "test",
  GENERAL: "general",
} as const;
export type TaskClass = (typeof TASK_CLASS)[keyof typeof TASK_CLASS];

export const EDITOR_ID = {
  CURSOR: "cursor",
  CLAUDE_CODE: "claude-code",
  CURSOR_CLAUDE_CODE: "cursor-claude-code",
  GENERIC: "generic",
} as const;
export type EditorId = (typeof EDITOR_ID)[keyof typeof EDITOR_ID];

export const MODEL_PROVIDER = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  OLLAMA: "ollama",
  CUSTOM: "custom",
} as const;
export type ModelProvider = (typeof MODEL_PROVIDER)[keyof typeof MODEL_PROVIDER];

export const INCLUSION_TIER = {
  L0: "L0",
  L1: "L1",
  L2: "L2",
  L3: "L3",
} as const;
export type InclusionTier = (typeof INCLUSION_TIER)[keyof typeof INCLUSION_TIER];

export const SYMBOL_TYPE = {
  FUNCTION: "function",
  CLASS: "class",
  METHOD: "method",
  INTERFACE: "interface",
} as const;
export type SymbolType = (typeof SYMBOL_TYPE)[keyof typeof SYMBOL_TYPE];

export const SYMBOL_KIND = {
  CLASS: "class",
  FUNCTION: "function",
  INTERFACE: "interface",
  TYPE: "type",
  CONST: "const",
} as const;
export type SymbolKind = (typeof SYMBOL_KIND)[keyof typeof SYMBOL_KIND];

export const TOOL_OUTPUT_TYPE = {
  TEST_RESULT: "test-result",
  LINT_ERROR: "lint-error",
  BUILD_OUTPUT: "build-output",
  COMMAND_OUTPUT: "command-output",
} as const;
export type ToolOutputType = (typeof TOOL_OUTPUT_TYPE)[keyof typeof TOOL_OUTPUT_TYPE];

export const OUTPUT_FORMAT = {
  UNIFIED_DIFF: "unified-diff",
  FULL_FILE: "full-file",
  MARKDOWN: "markdown",
  JSON: "json",
  PLAIN: "plain",
} as const;
export type OutputFormat = (typeof OUTPUT_FORMAT)[keyof typeof OUTPUT_FORMAT];

export const GUARD_SEVERITY = {
  BLOCK: "block",
  WARN: "warn",
} as const;
export type GuardSeverity = (typeof GUARD_SEVERITY)[keyof typeof GUARD_SEVERITY];

export const GUARD_FINDING_TYPE = {
  SECRET: "secret",
  EXCLUDED_FILE: "excluded-file",
  PROMPT_INJECTION: "prompt-injection",
  COMMAND_INJECTION: "command-injection",
} as const;
export type GuardFindingType =
  (typeof GUARD_FINDING_TYPE)[keyof typeof GUARD_FINDING_TYPE];

export const PIPELINE_EVENT_TYPE = {
  COMPILATION_START: "compilation:start",
  COMPILATION_COMPLETE: "compilation:complete",
  COMPILATION_CACHE_HIT: "compilation:cache-hit",
  STEP_CLASSIFY_COMPLETE: "step:classify:complete",
  STEP_RULES_COMPLETE: "step:rules:complete",
  STEP_BUDGET_COMPLETE: "step:budget:complete",
  STEP_CONTEXT_COMPLETE: "step:context:complete",
  STEP_GUARD_COMPLETE: "step:guard:complete",
  STEP_TRANSFORM_COMPLETE: "step:transform:complete",
  STEP_LADDER_COMPLETE: "step:ladder:complete",
  STEP_ASSEMBLE_COMPLETE: "step:assemble:complete",
  STEP_EXECUTE_COMPLETE: "step:execute:complete",
  STEP_EXECUTE_ERROR: "step:execute:error",
} as const;
export type PipelineEventType =
  (typeof PIPELINE_EVENT_TYPE)[keyof typeof PIPELINE_EVENT_TYPE];

export const RULES_FINDING_SEVERITY = {
  ERROR: "error",
  WARN: "warn",
  INFO: "info",
} as const;
export type RulesFindingSeverity =
  (typeof RULES_FINDING_SEVERITY)[keyof typeof RULES_FINDING_SEVERITY];

export const STOP_REASON = {
  GRACEFUL: "graceful",
  CRASH: "crash",
} as const;
export type StopReason = (typeof STOP_REASON)[keyof typeof STOP_REASON];

export const TRIGGER_SOURCE = {
  SESSION_START: "session_start",
  PROMPT_SUBMIT: "prompt_submit",
  TOOL_GATE: "tool_gate",
  SUBAGENT_START: "subagent_start",
  SUBAGENT_STOP: "subagent_stop",
  CLI: "cli",
  MODEL_INITIATED: "model_initiated",
  HOOK: "hook",
  INTERNAL_TEST: "internal_test",
} as const;
export type TriggerSource = (typeof TRIGGER_SOURCE)[keyof typeof TRIGGER_SOURCE];
