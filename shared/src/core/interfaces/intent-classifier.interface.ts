// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";

export interface IntentClassifier {
  classify(intent: string): TaskClassification;
}
