export interface ConfigStore {
  getLatestHash(): string | null;
  writeSnapshot(configHash: string, configJson: string): void;
}
