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
    let bestClass: TaskClass = TASK_CLASS.GENERAL;
    let bestCount = 0;
    let bestMatched: readonly string[] = [];

    for (const taskClass of ORDERED_CLASSES) {
      const keywords = KEYWORDS[taskClass];
      const matched = keywords.filter((kw) => lower.includes(kw));
      const count = matched.length;
      if (count > bestCount) {
        bestCount = count;
        bestClass = taskClass;
        bestMatched = matched;
      }
    }

    if (bestCount === 0) {
      return {
        taskClass: TASK_CLASS.GENERAL,
        confidence: toConfidence(0),
        matchedKeywords: [],
      };
    }

    const totalInClass = KEYWORDS[bestClass as Exclude<TaskClass, "general">].length;
    const raw = bestCount / totalInClass;
    const confidence = toConfidence(raw > 1 ? 1 : raw);
    return {
      taskClass: bestClass,
      confidence,
      matchedKeywords: [...bestMatched],
    };
  }
}
