// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

export interface ConfigStore {
  getLatestHash(): string | null;
  writeSnapshot(configHash: string, configJson: string): void;
}
