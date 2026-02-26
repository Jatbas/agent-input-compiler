import { type Brand } from "./brand.js";

// Token count (tiktoken cl100k_base). Always non-negative.
export type TokenCount = Brand<number, "TokenCount">;

// Duration in milliseconds. Always non-negative.
export type Milliseconds = Brand<number, "Milliseconds">;

// Size in bytes. Always non-negative.
export type Bytes = Brand<number, "Bytes">;

// 1-based line number in a source file. Always positive.
export type LineNumber = Brand<number, "LineNumber">;

// 0-based step index within an agentic session. Always non-negative.
export type StepIndex = Brand<number, "StepIndex">;

export function toTokenCount(value: number): TokenCount {
  return value as TokenCount;
}

export function toMilliseconds(value: number): Milliseconds {
  return value as Milliseconds;
}

export function toBytes(value: number): Bytes {
  return value as Bytes;
}

export function toLineNumber(value: number): LineNumber {
  return value as LineNumber;
}

export function toStepIndex(value: number): StepIndex {
  return value as StepIndex;
}
