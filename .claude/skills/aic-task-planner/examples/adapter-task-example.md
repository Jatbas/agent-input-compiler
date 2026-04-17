# Task 999-ax99: Sodium Hash Adapter

**Status:** approved
**Recipe:** adapter
**Owner:** executor

## Goal

Wrap `libsodium-wrappers` behind a new `crypto-hasher.interface.ts` core interface, so the pipeline can compute deterministic BLAKE2b hashes without importing the library anywhere other than a single adapter file.

## Architecture Notes

- The library is synchronous after `sodium.ready`. The adapter's constructor accepts a `Clock` only if hash metadata needs timestamps; this task does not, so the constructor is parameterless.
- The library is the first cryptography library introduced; the per-library ESLint `no-restricted-imports` block must be added alongside the existing adapter-boundary paths. Flat-config overrides REPLACE the previous `rules` value — every existing adapter-boundary path/pattern is copied unchanged into the new entry.
- No new branded type is required; the interface returns `HashDigest`, already defined in `shared/src/core/types/hash-digest.ts`.

## Interface / Signature

```ts
// shared/src/core/interfaces/crypto-hasher.interface.ts
import type { HashDigest } from "../types/hash-digest.js";

export interface CryptoHasher {
  hash(input: string): HashDigest;
}
```

```ts
// shared/src/adapters/sodium-crypto-hasher.ts (signature only)
export class SodiumCryptoHasher implements CryptoHasher {
  static create(): Promise<SodiumCryptoHasher>;
  hash(input: string): HashDigest;
}
```

## Dependent Types

- Tier 0 — `HashDigest` (branded `string`), path `shared/src/core/types/hash-digest.ts`, field used: value.
- Tier 2 — `CryptoHasher` interface — implemented; no new types introduced.

## Files

| Action | Path                                                         | Reason                                             |
| ------ | ------------------------------------------------------------ | -------------------------------------------------- |
| Create | `shared/src/core/interfaces/crypto-hasher.interface.ts`      | New interface                                      |
| Create | `shared/src/adapters/sodium-crypto-hasher.ts`                | Library wrapper                                    |
| Create | `shared/src/adapters/__tests__/sodium-crypto-hasher.test.ts` | Unit test                                          |
| Modify | `eslint.config.mjs`                                          | Add `libsodium-wrappers` to adapter-boundary rules |

## Steps

1. Create the interface at `shared/src/core/interfaces/crypto-hasher.interface.ts` containing the `CryptoHasher` interface exactly as in "Interface / Signature". No other exports.
2. Create `shared/src/adapters/sodium-crypto-hasher.ts`. It imports `libsodium-wrappers` behind an `await sodium.ready`, then exposes a synchronous `hash(input: string): HashDigest`. Use the async factory pattern `static async create(): Promise<SodiumCryptoHasher>` because `sodium.ready` is async. The class's public surface is `create` + `hash`; no other public methods.
3. Modify `eslint.config.mjs`: in the `no-restricted-imports` block for core/pipeline, add `libsodium-wrappers` to the banned imports — copy every existing banned path unchanged into the new entry. Add a second block allowing the import only from `shared/src/adapters/sodium-crypto-hasher.ts`.
4. Create `shared/src/adapters/__tests__/sodium-crypto-hasher.test.ts` with: happy-path hash of a known string matches the published BLAKE2b fixture, repeated calls return the same digest (determinism), empty-string input returns the documented BLAKE2b-of-empty constant. Use `SodiumCryptoHasher.create()` in `beforeAll`.
5. Final verification: run `pnpm lint && pnpm typecheck && pnpm test shared/src/adapters/__tests__/sodium-crypto-hasher.test.ts`. All green.

## Tests

- Happy path: hashing the string `"abc"` returns the published BLAKE2b-256 fixture digest.
- Determinism: two consecutive calls with the same input return the same digest (bitwise equal).
- Empty input: hashing `""` returns the documented BLAKE2b-of-empty constant.

All three tests run under Vitest using `SodiumCryptoHasher.create()` in `beforeAll`.

## Config Changes

- `eslint.config.mjs`: add `libsodium-wrappers` to the core/pipeline `no-restricted-imports` banned list, copying every existing entry unchanged into the rewritten rule.
- No environment variables, no runtime config, no schema migrations.

## Acceptance criteria

- [ ] `CryptoHasher` interface exists at the stated path with exactly the signature above.
- [ ] `SodiumCryptoHasher` is the only file that imports `libsodium-wrappers` (verified by ESLint and grep).
- [ ] Three tests pass: known-fixture, determinism, empty-string.
- [ ] `pnpm lint` exits 0 after the ESLint block is updated.
- [ ] No `new SodiumCryptoHasher()` call exists; callers use `SodiumCryptoHasher.create()`.

## Why this example

Shows:

- Recipe = `adapter` with a justified async factory (library initialisation is async, API is sync).
- ESLint per-library block with explicit preservation clause (the common failure mode).
- Minimal Dependent Types section (Tier 0 + Tier 2, no invention).
- Files table has exactly 4 entries — one Create per file, one Modify for config.
- Steps are one-file-per-step with a final verification step.
- Acceptance criteria are **achievable by the stated steps** — no "tests pass" without the tests being created.
