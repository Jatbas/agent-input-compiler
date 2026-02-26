import type { ExecutableDb } from "./executable-db.interface.js";

export interface Migration {
  readonly id: string;
  up(db: ExecutableDb): void;
  down(db: ExecutableDb): void;
}
