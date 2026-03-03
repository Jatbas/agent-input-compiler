# Task 078: SchemaFileCompactor

> **Status:** Done
> **Phase:** L (Transformers & Guard)
> **Layer:** pipeline
> **Depends on:** (none — Phase L transformers are independent)

## Goal

Implement a ContentTransformer that compacts schema-definition files (JSON Schema, GraphQL, Prisma, Proto) by stripping metadata and comments while preserving structure, reducing tokens for context compilation.

## Architecture Notes

- Implements existing ContentTransformer interface. No new interface.
- ADR-010: use branded types (RelativePath, FileExtension, InclusionTier) from core/types.
- Pipeline transformer: no constructor params, no external package; pure string/JSON/line logic. Non-format-specific (`fileExtensions = []`); detection by content (JSON with `$schema` or `$ref` at root) or by path extension (`.graphql`, `.gql`, `.prisma`, `.proto`).
- JSON Schema: parse JSON, recursively strip `description`, `title`, `examples`, `$comment`, `default` from all nested objects; re-serialize with JSON.stringify. Structural keys (e.g. `type`, `properties`, `required`, `$ref`, `$defs`, `enum`) preserved.
- GraphQL/Prisma/Proto: strip comment lines and description blocks via line-based string logic; preserve type/model/message definitions.
- JsonCompactor runs first (format-specific for `.json`); SchemaFileCompactor runs after (non-format-specific), detects JSON Schema by content and strips metadata. No duplication.
- Wiring: Insert SchemaFileCompactor after envExampleRedactor, before htmlToMarkdownTransformer in the transformers array.

## Files

| Action | Path |
| ------ | ---- |
| Create | `shared/src/pipeline/schema-file-compactor.ts` |
| Create | `shared/src/pipeline/__tests__/schema-file-compactor.test.ts` |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate SchemaFileCompactor and add after envExampleRedactor, before htmlToMarkdownTransformer) |

## Interface / Signature

```typescript
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface ContentTransformer {
  readonly id: string;
  readonly fileExtensions: readonly FileExtension[];
  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

```typescript
export class SchemaFileCompactor implements ContentTransformer {
  readonly id = "schema-file-compactor";
  readonly fileExtensions: readonly FileExtension[] = [];

  transform(
    content: string,
    _tier: InclusionTier,
    filePath: RelativePath,
  ): string;
}
```

## Dependent Types

### Tier 0 — verbatim

Interface and parameter types are defined by ContentTransformer (RelativePath, InclusionTier, FileExtension from core).

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `FileExtension` | `shared/src/core/types/paths.ts` | `toFileExtension(raw)` |
| `RelativePath` | `shared/src/core/types/paths.ts` | `toRelativePath(raw)` |
| `InclusionTier` | `shared/src/core/types/enums.ts` | Use `INCLUSION_TIER.L0` etc. |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Implement SchemaFileCompactor

Create `shared/src/pipeline/schema-file-compactor.ts`.

- Imports: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`; `FileExtension`, `RelativePath` from `#core/types/paths.js`; `InclusionTier` from `#core/types/enums.js`.
- Module constant: `EMPTY_EXTENSIONS: readonly FileExtension[] = []`.
- Metadata keys to strip from JSON Schema: `const SCHEMA_METADATA_KEYS: readonly string[] = ["description", "title", "examples", "$comment", "default"]`.
- Helper `getExtension(path: RelativePath): string`: if path ends with `.d.ts` return `.d.ts`; else return path.slice(path.lastIndexOf(".")) or "" (same logic as content-transformer-pipeline getExtension).
- Helper `isJsonSchemaRoot(obj: unknown): boolean`: true when obj is a non-null object and (`"$schema" in obj` or `"$ref" in obj`).
- Helper `stripJsonSchemaMetadata(obj: unknown): unknown`: if obj is null or not an object, return obj. If Array.isArray(obj), return obj.map(stripJsonSchemaMetadata). Otherwise build a new object from Object.entries(obj): for each [key, value], if key is in SCHEMA_METADATA_KEYS skip the key; else set key to stripJsonSchemaMetadata(value). Return the new object (immutable; no mutation of parsed structure).
- Helper `compactJsonSchema(content: string): string`: try { const parsed = JSON.parse(content.trim()); if (!isJsonSchemaRoot(parsed)) return content; return JSON.stringify(stripJsonSchemaMetadata(parsed)); } catch { return content; }.
- Helper `isSchemaPath(path: RelativePath): boolean`: const ext = getExtension(path).toLowerCase(); return ext === ".graphql" || ext === ".gql" || ext === ".prisma" || ext === ".proto".
- Helper `stripLineComments(content: string, lineCommentStart: string): string`: split by "\n", filter out lines that after trim start with lineCommentStart, join "\n".
- Helper `stripBlockComments(content: string, open: string, close: string): string`: remove substrings between open and close (for block comments use "/*" and "*/"), handling nested content only to the first close; keep rest. Use a single pass (no regex that could miss nested); prefer reduce or explicit index scan.
- Helper `compactGraphql(content: string): string`: strip lines starting with # (after trim); strip triple-quote description blocks ("""...""" on one or more lines). Return trimmed result with blank lines collapsed to at most one.
- Helper `compactPrisma(content: string): string`: strip lines starting with // or ///; strip block comments /* */. Return trimmed result.
- Helper `compactProto(content: string): string`: strip lines starting with //; strip block comments /* */. Return trimmed result.
- In `transform(content, _tier, filePath)`: if content.length === 0 return content. Try compactJsonSchema(content) — if result is not equal to content (i.e. was JSON Schema), return result. If isSchemaPath(filePath): if path ends with .graphql or .gql return compactGraphql(content); if path ends with .prisma return compactPrisma(content); if path ends with .proto return compactProto(content). Return content unchanged otherwise. Explicit return type `string`. Max 60 lines per function; extract helpers as needed.

**Verify:** `pnpm typecheck` passes. File exists and exports `SchemaFileCompactor`.

### Step 2: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`:

- Add named import: `SchemaFileCompactor` from `#pipeline/schema-file-compactor.js`.
- After the line that creates `envExampleRedactor`, add: `const schemaFileCompactor = new SchemaFileCompactor();`
- In the `transformers` array, insert `schemaFileCompactor` after `envExampleRedactor` and before `htmlToMarkdownTransformer`. Resulting order: `licenseHeaderStripper`, `base64InlineDataStripper`, `longStringLiteralTruncator`, `docstringTrimmer`, `importDeduplicator`, `whitespaceNormalizer`, `testStructureExtractor`, `commentStripper`, `jsonCompactor`, `lockFileSkipper`, `minifiedCodeSkipper`, `autoGeneratedSkipper`, `envExampleRedactor`, `schemaFileCompactor`, `htmlToMarkdownTransformer`, `yamlCompactor`, `svgDescriber`, `cssVariableSummarizer`, `typeDeclarationCompactor`.

**Verify:** `pnpm typecheck` passes. Grep for `schemaFileCompactor` in create-pipeline-deps.ts shows one declaration and one use in the array.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/schema-file-compactor.test.ts`.

- Imports: `describe`, `it`, `expect` from `vitest`; `SchemaFileCompactor` from `../schema-file-compactor.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Tests:
  - **json_schema_description_fields_stripped:** filePath = toRelativePath("schema/user.json"), content = `{"$schema":"http://json-schema.org/draft-07/schema","type":"object","description":"User model","properties":{"name":{"description":"Full name","type":"string"}}}`. After transform, output has no "description" keys; has "type", "properties", "$schema".
  - **json_schema_examples_stripped:** filePath = toRelativePath("api/schema.json"), content = `{"$schema":"http://json-schema.org/draft-07/schema","examples":[1,2,3],"type":"string"}`. After transform, output has no "examples" key; has "type".
  - **json_schema_nested_metadata_stripped:** filePath = toRelativePath("schemas/root.json"), content = `{"$ref":"#/definitions/Foo","definitions":{"Foo":{"title":"Foo","description":"Bar","properties":{"a":{"default":1}}}}}`. After transform, nested "title", "description", "default" removed; "definitions", "$ref", "properties" preserved.
  - **graphql_descriptions_stripped:** filePath = toRelativePath("schema.graphql"), content = `type User """User type""" { id: ID } # comment`. After transform, triple-quote description and hash comment removed; "type User" and "{ id: ID }" preserved.
  - **prisma_comments_stripped:** filePath = toRelativePath("prisma/schema.prisma"), content = `// comment\nmodel User { id Int }\n/// doc`. After transform, comment lines removed; "model User" and "{ id Int }" preserved.
  - **proto_comments_stripped:** filePath = toRelativePath("api/service.proto"), content = `// comment\nmessage Foo { string x = 1; }`. After transform, comment line removed; "message Foo" preserved.
  - **non_schema_json_unchanged:** filePath = toRelativePath("package.json"), content = `{"name":"pkg","version":"1.0.0"}`. After transform, result is exactly content (no $schema or $ref at root).
  - **non_schema_path_unchanged:** filePath = toRelativePath("src/index.ts"), content = `const x = 1`. After transform, result is exactly content.
  - **empty_content_returns_unchanged:** filePath = toRelativePath("schema.json"), content = "". After transform, result is "".
  - **invalid_json_returns_unchanged:** filePath = toRelativePath("bad.json"), content = `{ invalid `. After transform, result is exactly content.
  - **safety_python_indentation_preserved:** filePath = toRelativePath("src/main.py"), content = "def f():\n  pass". After transform, result is unchanged.
  - **safety_yaml_structure_unchanged:** filePath = toRelativePath("config.yml"), content = "key:\n  nested: 1". After transform, result is unchanged.
  - **safety_jsx_structure_unchanged:** filePath = toRelativePath("src/App.tsx"), content = "<div>x</div>". After transform, result is unchanged.

**Verify:** `pnpm test shared/src/pipeline/__tests__/schema-file-compactor.test.ts` passes.

### Step 4: Benchmark verification

Run: `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`

The benchmark test auto-ratchets `test/benchmarks/baseline.json`: if the actual token count is lower than the stored baseline, the test writes the new values to disk automatically. No manual editing of `baseline.json` is needed. Read the test output and note whether the baseline was ratcheted or unchanged.

**Verify:** `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` passes. Baseline reflects current pipeline output.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| json_schema_description_fields_stripped | JSON with $schema and description fields → descriptions removed, structure preserved |
| json_schema_examples_stripped | JSON with $schema and examples → examples removed |
| json_schema_nested_metadata_stripped | Deeply nested JSON Schema → description/title/examples/$comment/default stripped recursively |
| graphql_descriptions_stripped | GraphQL """...""" and # comments stripped, types preserved |
| prisma_comments_stripped | Prisma // and /// comments stripped, models preserved |
| proto_comments_stripped | Proto // and block comments stripped, messages preserved |
| non_schema_json_unchanged | JSON without $schema or $ref at root returned unchanged |
| non_schema_path_unchanged | Non-schema path (.ts) returned unchanged |
| empty_content_returns_unchanged | Empty string in, empty string out |
| invalid_json_returns_unchanged | Malformed JSON returned unchanged |
| safety_python_indentation_preserved | Non-matching .py path leaves content unchanged |
| safety_yaml_structure_unchanged | Non-matching .yml path leaves content unchanged |
| safety_jsx_structure_unchanged | Non-matching .tsx path leaves content unchanged |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Interface matches signature exactly
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code (only `const`; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
