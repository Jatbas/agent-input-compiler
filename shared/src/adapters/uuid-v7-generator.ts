// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { randomFillSync } from "node:crypto";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { IdGenerator } from "#core/interfaces/id-generator.interface.js";
import { AicError } from "#core/errors/aic-error.js";
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

function byteAt(buf: Uint8Array, i: number): number {
  const b = buf[i];
  if (b === undefined) throw new AicError("UuidV7: index out of range", "INTERNAL_ERROR");
  return b;
}

function buildUuidV7Bytes(timestampMs: number, randomBytes: Uint8Array): Uint8Array {
  const ts = uint48BeBytes(timestampMs);
  return new Uint8Array([
    byteAt(ts, 0),
    byteAt(ts, 1),
    byteAt(ts, 2),
    byteAt(ts, 3),
    byteAt(ts, 4),
    byteAt(ts, 5),
    (byteAt(randomBytes, 6) & 0x0f) | VERSION_7,
    byteAt(randomBytes, 7),
    (byteAt(randomBytes, 8) & 0x3f) | VARIANT_RFC,
    byteAt(randomBytes, 9),
    byteAt(randomBytes, 10),
    byteAt(randomBytes, 11),
    byteAt(randomBytes, 12),
    byteAt(randomBytes, 13),
    byteAt(randomBytes, 14),
    byteAt(randomBytes, 15),
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
