# Documentation-writer request

**Target:** `documentation/technical/storage-layer.md`

**Mode:** update

**Context:**

- The document at `documentation/technical/storage-layer.md:45` claims "every store uses `INTEGER AUTOINCREMENT`" — this is factually wrong; entity stores use UUIDv7.
- The document does not mention per-project isolation (an important invariant).
- The opening paragraph is 14 sentences long.

**Expected output:** a Change Specification document (NOT the edited doc — the Change Specification is the planning artifact) that lists each required edit with current text, required text, rationale, and evidence citation.
