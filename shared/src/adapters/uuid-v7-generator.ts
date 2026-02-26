import { randomFillSync } from "node:crypto";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { IdGenerator } from "#core/interfaces/id-generator.interface.js";
import { toUUIDv7 } from "#core/types/identifiers.js";

const UUID_BYTES = 16;
const VERSION_7 = 0x70;
const VARIANT_RFC = 0x80;

function uint48BeBytes(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 40) & 0xff,
    (value >>> 32) & 0xff,
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function toHexString(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatUuid(hex: string): string {
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function buildUuidV7Bytes(timestampMs: number, randomBytes: Uint8Array): Uint8Array {
  const ts = uint48BeBytes(timestampMs);
  return new Uint8Array([
    ts[0]!,
    ts[1]!,
    ts[2]!,
    ts[3]!,
    ts[4]!,
    ts[5]!,
    (randomBytes[6]! & 0x0f) | VERSION_7,
    randomBytes[7]!,
    (randomBytes[8]! & 0x3f) | VARIANT_RFC,
    randomBytes[9]!,
    randomBytes[10]!,
    randomBytes[11]!,
    randomBytes[12]!,
    randomBytes[13]!,
    randomBytes[14]!,
    randomBytes[15]!,
  ]);
}

export class UuidV7Generator implements IdGenerator {
  constructor(private readonly clock: Clock) {}

  generate(): ReturnType<typeof toUUIDv7> {
    const random = new Uint8Array(UUID_BYTES);
    randomFillSync(random);
    const ms = Date.parse(this.clock.now());
    const bytes = buildUuidV7Bytes(ms, random);
    return toUUIDv7(formatUuid(toHexString(bytes)));
  }
}
