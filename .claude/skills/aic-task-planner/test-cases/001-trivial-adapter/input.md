# Planning request

**Task:** Wrap `fast-fnv` behind a new `string-hasher.interface.ts` core interface so the pipeline can compute FNV-1a hashes of file paths without importing the library anywhere else.

**Constraints:**

- The library is synchronous.
- The returned digest is 32-bit; use the existing `FnvDigest` branded type at `shared/src/core/types/fnv-digest.ts`.
- The pipeline must not import `fast-fnv` directly — only the new adapter may.

**Expected recipe:** `adapter` (this is the task classification the planner MUST produce).

**Expected output:** a single task file at `documentation/tasks/<id>-<slug>.md` following the canonical adapter task structure.
