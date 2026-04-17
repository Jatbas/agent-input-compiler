# Task 999-ax97: FNV String Hasher Adapter

**Status:** proposed
**Recipe:** adapter
**Owner:** executor

## Goal

Wrap `fast-fnv` behind a new `StringHasher` core interface so the pipeline can compute FNV-1a hashes of file paths without importing the library outside a single adapter file.

## Architecture Notes

- Library is synchronous; the adapter constructor takes no parameters.
- ESLint `no-restricted-imports` must preserve every existing adapter-boundary path and pattern when the new entry is added.
- No new branded type — `FnvDigest` exists at `shared/src/core/types/fnv-digest.ts`.

## Interface / Signature

```ts
export interface StringHasher {
  hash(input: string): FnvDigest;
}
```

```ts
export class FastFnvStringHasher implements StringHasher {
  hash(input: string): FnvDigest;
}
```

## Dependent Types

- Tier 0 — `FnvDigest` (`shared/src/core/types/fnv-digest.ts`).
- Tier 2 — `StringHasher` interface.

## Files

| Action | Path                                                           | Reason                                   |
| ------ | -------------------------------------------------------------- | ---------------------------------------- |
| Create | `shared/src/core/interfaces/string-hasher.interface.ts`        | New interface                            |
| Create | `shared/src/adapters/fast-fnv-string-hasher.ts`                | Library wrapper                          |
| Create | `shared/src/adapters/__tests__/fast-fnv-string-hasher.test.ts` | Unit test                                |
| Modify | `eslint.config.mjs`                                            | Add `fast-fnv` to adapter-boundary rules |

## Steps

1. Create `shared/src/core/interfaces/string-hasher.interface.ts` containing `StringHasher`. No other exports.
2. Create `shared/src/adapters/fast-fnv-string-hasher.ts`. Import `fast-fnv`; implement `hash(input)` returning `FnvDigest`. No async.
3. Modify `eslint.config.mjs`: add `fast-fnv` to the banned imports — copy every existing banned path unchanged into the new entry. Allow the import only from `shared/src/adapters/fast-fnv-string-hasher.ts`.
4. Create `shared/src/adapters/__tests__/fast-fnv-string-hasher.test.ts` with: known-fixture hash, determinism, empty-string.
5. Verify: `pnpm lint && pnpm typecheck && pnpm test shared/src/adapters/__tests__/fast-fnv-string-hasher.test.ts`.

## Tests

- Known-fixture: hashing `"abc"` returns the published FNV-1a 32-bit digest.
- Determinism: two calls with the same input return identical digests.
- Empty input: hashing `""` returns the FNV-1a offset-basis constant.

## Config Changes

- `eslint.config.mjs`: add `fast-fnv` to `no-restricted-imports` with every existing banned entry preserved; allow the import only from the new adapter file.
- No environment variables, no runtime config.

## Acceptance criteria

- [ ] `StringHasher` interface exists at the stated path with the exact signature.
- [ ] `FastFnvStringHasher` is the only file importing `fast-fnv`.
- [ ] Three tests pass: known-fixture, determinism, empty-string.
- [ ] `pnpm lint` exits 0.
