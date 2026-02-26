import { describe, it, expect } from "vitest";
import { IntentClassifier } from "./intent-classifier.js";
import { TASK_CLASS } from "#core/types/enums.js";

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
  });

  it("is case insensitive", () => {
    expect(classifier.classify("REFACTOR this").taskClass).toBe(TASK_CLASS.REFACTOR);
    expect(classifier.classify("Fix the Bug").taskClass).toBe(TASK_CLASS.BUGFIX);
  });
});
