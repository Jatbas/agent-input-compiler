// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { Parser } from "web-tree-sitter";

export async function initTreeSitter(): Promise<void> {
  await Parser.init();
}
