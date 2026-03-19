// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import {
  isValidModelId,
  isValidConversationId,
  isValidEditorId,
  isValidTimestamp,
} from "../cache-field-validators.js";

describe("cache_field_validators", () => {
  describe("isValidModelId", () => {
    it("passes for 1–256 printable ASCII chars", () => {
      expect(isValidModelId("a")).toBe(true);
      expect(isValidModelId("x".repeat(256))).toBe(true);
    });
    it("fails for empty", () => {
      expect(isValidModelId("")).toBe(false);
      expect(isValidModelId("   ")).toBe(false);
    });
    it("fails for 257 chars", () => {
      expect(isValidModelId("x".repeat(257))).toBe(false);
    });
    it("fails for control char", () => {
      expect(isValidModelId("a\x00b")).toBe(false);
      expect(isValidModelId("\n")).toBe(false);
    });
    it("fails for non-string", () => {
      expect(isValidModelId(null as unknown as string)).toBe(false);
      expect(isValidModelId(undefined as unknown as string)).toBe(false);
      expect(isValidModelId(1 as unknown as string)).toBe(false);
    });
  });

  describe("isValidConversationId", () => {
    it("passes for 0–128 chars", () => {
      expect(isValidConversationId("")).toBe(true);
      expect(isValidConversationId("   ")).toBe(true);
      expect(isValidConversationId("x".repeat(128))).toBe(true);
    });
    it("fails for 129 chars", () => {
      expect(isValidConversationId("x".repeat(129))).toBe(false);
    });
  });

  describe("isValidEditorId", () => {
    it("passes for 1–20 chars", () => {
      expect(isValidEditorId("cursor")).toBe(true);
      expect(isValidEditorId("x".repeat(20))).toBe(true);
    });
    it("fails for 21 chars", () => {
      expect(isValidEditorId("x".repeat(21))).toBe(false);
    });
    it("fails for empty", () => {
      expect(isValidEditorId("")).toBe(false);
      expect(isValidEditorId("   ")).toBe(false);
    });
  });

  describe("isValidTimestamp", () => {
    it("passes for 1–32 printable ASCII", () => {
      expect(isValidTimestamp("2025-01-01T00:00:00.000Z")).toBe(true);
      expect(isValidTimestamp("x".repeat(32))).toBe(true);
    });
    it("fails for 33 chars", () => {
      expect(isValidTimestamp("x".repeat(33))).toBe(false);
    });
    it("fails for non-string", () => {
      expect(isValidTimestamp(null as unknown as string)).toBe(false);
      expect(isValidTimestamp(123 as unknown as string)).toBe(false);
    });
  });
});
