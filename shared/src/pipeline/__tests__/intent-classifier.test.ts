// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { IntentClassifier } from "../intent-classifier.js";
import { TASK_CLASS } from "@jatbas/aic-core/core/types/enums.js";

describe("IntentClassifier", () => {
  const classifier = new IntentClassifier();

  it("returns refactor for refactor keyword set", () => {
    expect(classifier.classify("refactor the module").taskClass).toBe(
      TASK_CLASS.REFACTOR,
    );
    expect(classifier.classify("restructure the code").taskClass).toBe(
      TASK_CLASS.REFACTOR,
    );
    expect(classifier.classify("clean up the file").taskClass).toBe(TASK_CLASS.REFACTOR);
  });

  it("returns bugfix for bugfix keyword set", () => {
    expect(classifier.classify("fix the bug").taskClass).toBe(TASK_CLASS.BUGFIX);
    expect(classifier.classify("repair the error").taskClass).toBe(TASK_CLASS.BUGFIX);
  });

  it("returns feature for feature keyword set", () => {
    expect(classifier.classify("add a new feature").taskClass).toBe(TASK_CLASS.FEATURE);
    expect(classifier.classify("implement login").taskClass).toBe(TASK_CLASS.FEATURE);
  });

  it("returns docs for docs keyword set", () => {
    expect(classifier.classify("document the API").taskClass).toBe(TASK_CLASS.DOCS);
    expect(classifier.classify("update readme").taskClass).toBe(TASK_CLASS.DOCS);
  });

  it("returns test for test keyword set", () => {
    expect(classifier.classify("add unit test").taskClass).toBe(TASK_CLASS.TEST);
    expect(classifier.classify("improve coverage").taskClass).toBe(TASK_CLASS.TEST);
  });

  it("returns general with confidence 0 when no keywords match", () => {
    const result = classifier.classify("do something random with the codebase");
    expect(result.taskClass).toBe(TASK_CLASS.GENERAL);
    expect(result.confidence).toBe(0);
    expect(result.matchedKeywords).toEqual([]);
    expect(result).toHaveProperty("subjectTokens");
  });

  it("tie-breaks to alphabetical first when multiple classes match same count", () => {
    const result = classifier.classify("fix add");
    expect(result.taskClass).toBe(TASK_CLASS.BUGFIX);
  });

  it("returns highest-count class when multi-keyword intent matches several", () => {
    const result = classifier.classify("fix the bug and add a test");
    expect(result.taskClass).toBe(TASK_CLASS.BUGFIX);
    expect(result.matchedKeywords).toContain("fix");
    expect(result.matchedKeywords).toContain("bug");
    expect(result).toHaveProperty("subjectTokens");
  });

  it("is case insensitive", () => {
    expect(classifier.classify("REFACTOR this").taskClass).toBe(TASK_CLASS.REFACTOR);
    expect(classifier.classify("Fix the Bug").taskClass).toBe(TASK_CLASS.BUGFIX);
  });

  it("richer_keywords_refactor", () => {
    expect(classifier.classify("migrate the module").taskClass).toBe(TASK_CLASS.REFACTOR);
    expect(classifier.classify("extract helper").taskClass).toBe(TASK_CLASS.REFACTOR);
  });

  it("richer_keywords_bugfix", () => {
    expect(classifier.classify("debug the crash").taskClass).toBe(TASK_CLASS.BUGFIX);
    expect(classifier.classify("resolve the exception").taskClass).toBe(
      TASK_CLASS.BUGFIX,
    );
  });

  it("richer_keywords_feature", () => {
    expect(classifier.classify("extend the API").taskClass).toBe(TASK_CLASS.FEATURE);
    expect(classifier.classify("enable feature flag").taskClass).toBe(TASK_CLASS.FEATURE);
  });

  it("richer_keywords_docs", () => {
    expect(classifier.classify("update changelog").taskClass).toBe(TASK_CLASS.DOCS);
    expect(classifier.classify("add docstring").taskClass).toBe(TASK_CLASS.DOCS);
  });

  it("richer_keywords_test", () => {
    expect(classifier.classify("stub the service").taskClass).toBe(TASK_CLASS.TEST);
    expect(classifier.classify("e2e test").taskClass).toBe(TASK_CLASS.TEST);
  });

  it("subject_tokens_extracted_from_intent", () => {
    const result = classifier.classify("fix the auth module login bug");
    expect(result.subjectTokens).toContain("auth");
    expect(result.subjectTokens).toContain("module");
    expect(result.subjectTokens).toContain("login");
    expect(result.subjectTokens).not.toContain("fix");
    expect(result.subjectTokens).not.toContain("bug");
    expect(result.subjectTokens).not.toContain("the");
  });

  it("subject_tokens_empty_when_only_keywords", () => {
    const result = classifier.classify("fix bug");
    expect(result.subjectTokens).toEqual([]);
  });

  it("subject_tokens_present_for_general_task", () => {
    const result = classifier.classify("hello world");
    expect(result.subjectTokens).toContain("hello");
    expect(result.subjectTokens).toContain("world");
  });

  it("subject_tokens_deduplicates", () => {
    const result = classifier.classify("fix auth auth bug");
    expect(result.subjectTokens).toEqual(["auth"]);
  });
});
