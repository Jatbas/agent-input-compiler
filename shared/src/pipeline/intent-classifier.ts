import type { IntentClassifier as IIntentClassifier } from "#core/interfaces/intent-classifier.interface.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { TaskClass } from "#core/types/enums.js";
import { TASK_CLASS } from "#core/types/enums.js";
import { toConfidence } from "#core/types/scores.js";

const KEYWORDS: Readonly<Record<Exclude<TaskClass, "general">, readonly string[]>> = {
  [TASK_CLASS.REFACTOR]: [
    "refactor",
    "restructure",
    "reorganize",
    "clean up",
    "simplify",
  ],
  [TASK_CLASS.BUGFIX]: ["fix", "bug", "broken", "error", "crash", "issue", "repair"],
  [TASK_CLASS.FEATURE]: ["add", "create", "implement", "build", "new", "introduce"],
  [TASK_CLASS.DOCS]: ["document", "readme", "jsdoc", "comment", "explain", "describe"],
  [TASK_CLASS.TEST]: ["test", "spec", "coverage", "assert", "mock", "unit test"],
} as const;

const ORDERED_CLASSES: readonly Exclude<TaskClass, "general">[] = [
  TASK_CLASS.BUGFIX,
  TASK_CLASS.DOCS,
  TASK_CLASS.FEATURE,
  TASK_CLASS.REFACTOR,
  TASK_CLASS.TEST,
];

export class IntentClassifier implements IIntentClassifier {
  classify(intent: string): TaskClassification {
    const lower = intent.toLowerCase();
    const best = ORDERED_CLASSES.reduce<{
      readonly taskClass: TaskClass;
      readonly count: number;
      readonly matched: readonly string[];
    }>(
      (acc, taskClass) => {
        const matched = KEYWORDS[taskClass].filter((kw) => lower.includes(kw));
        return matched.length > acc.count
          ? { taskClass, count: matched.length, matched }
          : acc;
      },
      { taskClass: TASK_CLASS.GENERAL, count: 0, matched: [] },
    );

    if (best.count === 0) {
      return {
        taskClass: TASK_CLASS.GENERAL,
        confidence: toConfidence(0),
        matchedKeywords: [],
      };
    }

    const totalInClass = KEYWORDS[best.taskClass as Exclude<TaskClass, "general">].length;
    const raw = best.count / totalInClass;
    const confidence = toConfidence(raw > 1 ? 1 : raw);
    return {
      taskClass: best.taskClass,
      confidence,
      matchedKeywords: [...best.matched],
    };
  }
}
