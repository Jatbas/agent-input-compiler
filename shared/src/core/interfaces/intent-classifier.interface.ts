import type { TaskClassification } from "#core/types/task-classification.js";

export interface IntentClassifier {
  classify(intent: string): TaskClassification;
}
