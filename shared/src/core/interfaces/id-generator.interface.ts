import type { UUIDv7 } from "#core/types/identifiers.js";

export interface IdGenerator {
  generate(): UUIDv7;
}
