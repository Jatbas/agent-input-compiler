// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// Updated by mcp/scripts/fetch-model-context-windows.cjs at release time.
export const MODEL_CONTEXT_WINDOWS: Readonly<Record<string, number>> = {
  "claude-3-5-sonnet": 200000,
  "claude-3-opus": 200000,
  "claude-haiku-4-5": 200000,
  "claude-opus-4": 200000,
  "claude-opus-4-6": 200000,
  "claude-sonnet-4": 200000,
  "claude-sonnet-4-6": 200000,
  "gemini-2-0-flash": 1048576,
  "gemini-2-5-flash": 1048576,
  "gemini-2-5-pro": 1048576,
  "gpt-4-1": 1047576,
  "gpt-4-1-mini": 1047576,
  "gpt-4-1-nano": 1047576,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
} as const;
