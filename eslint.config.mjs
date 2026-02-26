import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import checkFile from "eslint-plugin-check-file";
import globals from "globals";

// ─── Reusable no-restricted-syntax patterns ─────────────────────────
// Extracted as composable variables so overrides that redefine the rule
// can include the full set without losing base patterns.

const BARE_ERROR = {
  selector: 'ThrowStatement > NewExpression[callee.name="Error"]',
  message:
    "Use an AicError subclass instead of bare Error. See .cursor/rules/aic-errors.mdc.",
};

const ARRAY_MUTATIONS = [
  {
    selector:
      'CallExpression[callee.property.name="push"][callee.object.type!="ThisExpression"]',
    message: "Array.push() mutates in place. Use spread [...arr, item] or concat.",
  },
  {
    selector: 'CallExpression[callee.property.name="splice"]',
    message: "Array.splice() mutates in place. Use filter/slice/spread.",
  },
  {
    selector: 'CallExpression[callee.property.name="pop"]',
    message: "Array.pop() mutates in place. Use slice(0, -1).",
  },
  {
    selector: 'CallExpression[callee.property.name="shift"]',
    message: "Array.shift() mutates in place. Use slice(1) or destructuring.",
  },
  {
    selector: 'CallExpression[callee.property.name="unshift"]',
    message: "Array.unshift() mutates in place. Use spread [item, ...arr].",
  },
];

const DATE_RESTRICTIONS = [
  {
    selector: 'CallExpression[callee.object.name="Date"][callee.property.name="now"]',
    message:
      "Use Clock interface instead of Date.now(). Only system-clock.ts may access Date directly.",
  },
  {
    selector: 'NewExpression[callee.name="Date"]',
    message:
      "Use Clock interface instead of new Date(). Only system-clock.ts may access Date directly.",
  },
];

const MATH_RANDOM = {
  selector: 'CallExpression[callee.object.name="Math"][callee.property.name="random"]',
  message: "Use crypto.randomFillSync or an injected RandomSource. No Math.random().",
};

const NEW_DATABASE = {
  selector: 'NewExpression[callee.name="Database"]',
  message:
    "Receive the Database instance via constructor injection. Only composition roots (mcp/src/server.ts, cli/src/commands/) may call new Database(). See DIP.",
};

const IF_CHAIN_BAN = {
  selector:
    'IfStatement:not(IfStatement > .alternate)[alternate.type="IfStatement"][alternate.alternate.type="IfStatement"]',
  message:
    "If/else-if chain with 3+ branches is banned. Use a Record<Enum, Handler> dispatch map or a handler array.",
};

const ISP_ONE_INTERFACE_PER_FILE = {
  selector:
    "ExportNamedDeclaration:has(TSInterfaceDeclaration) ~ ExportNamedDeclaration:has(TSInterfaceDeclaration)",
  message:
    "One interface per *.interface.ts file (ISP). Split each interface into its own file.",
};

const CORE_PIPELINE_EXTRA = [
  {
    selector: 'CallExpression[callee.property.name="sort"]',
    message: "Array.sort() mutates in place. Use toSorted() or [...arr].sort().",
  },
  {
    selector: 'CallExpression[callee.property.name="reverse"]',
    message: "Array.reverse() mutates in place. Use toReversed() or [...arr].reverse().",
  },
  {
    selector: "UnaryExpression[operator='delete']",
    message: "delete mutates objects. Use object rest/spread to omit properties.",
  },
];

// ─── #alias whitelist per layer ─────────────────────────────────────
// minimatch treats # as a comment, so no-restricted-imports can't match
// #alias paths. Instead, whitelist allowed aliases per layer using
// negative lookahead. Any NEW alias added to package.json is auto-banned
// everywhere except where explicitly allowed — zero maintenance.

function allowOnlyHashAliases(allowed, layerName) {
  const lookahead = allowed.map((a) => `${a}\\/`).join("|");
  return {
    selector: `ImportDeclaration[source.value=/^#(?!${lookahead})/]`,
    message: `${layerName} may only use #${allowed.join("/, #")}/ aliases. Other aliases are not allowed in this layer.`,
  };
}

const CORE_HASH_WHITELIST = allowOnlyHashAliases(["core"], "core/pipeline");
const STORAGE_HASH_WHITELIST = allowOnlyHashAliases(["core", "storage"], "storage");
const ADAPTER_HASH_WHITELIST = allowOnlyHashAliases(["core"], "adapters");

// ─── Composed rule sets ─────────────────────────────────────────────

const BASE_RESTRICTED = [
  BARE_ERROR,
  ...ARRAY_MUTATIONS,
  ...DATE_RESTRICTIONS,
  MATH_RANDOM,
  IF_CHAIN_BAN,
];

const CORE_PIPELINE_RESTRICTED = [
  ...BASE_RESTRICTED,
  ...CORE_PIPELINE_EXTRA,
  CORE_HASH_WHITELIST,
];

const STORAGE_RESTRICTED = [...BASE_RESTRICTED, NEW_DATABASE, STORAGE_HASH_WHITELIST];

const INTERFACE_FILE_RESTRICTED = [
  ...CORE_PIPELINE_RESTRICTED,
  ISP_ONE_INTERFACE_PER_FILE,
];

const SYSTEM_CLOCK_RESTRICTED = [BARE_ERROR, ...ARRAY_MUTATIONS, MATH_RANDOM];

// ─── Reusable import restriction patterns ───────────────────────────
const BAN_RELATIVE_PARENT = {
  group: ["../**"],
  message:
    "Use #alias subpath imports (#core/, #adapters/, #storage/, #pipeline/) instead of relative parent paths.",
};

// ─── Config ─────────────────────────────────────────────────────────

export default tseslint.config(
  // ─── Global ignores ────────────────────────────────────────────────
  {
    ignores: [
      "node_modules/",
      "dist/",
      ".cursor/",
      ".claude/",
      "documentation/",
      "*.md",
      "*.mjs",
      "*.js",
      "*.cjs",
      "vitest.config.ts",
    ],
  },

  // ─── Anti-bypass: no inline eslint-disable comments allowed ────────
  {
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
  },

  // ─── Base config for all TypeScript files ──────────────────────────
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "check-file": checkFile,
    },
    rules: {
      // ── File naming: kebab-case ──
      "check-file/filename-naming-convention": [
        "error",
        { "**/*.ts": "+([0-9a-z])*(-+([0-9a-z]))" },
        { ignoreMiddleExtensions: true },
      ],

      // ── SRP: one class per file ──
      "max-classes-per-file": ["error", 1],

      // ── Type safety ──
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/strict-boolean-expressions": "warn",

      // ── Immutability ──
      "no-var": "error",
      "prefer-const": "error",
      "no-param-reassign": ["error", { props: true }],
      "@typescript-eslint/prefer-readonly": "error",

      // ── Mutations, determinism, bare Error (global baseline) ──
      "no-restricted-syntax": ["error", ...BASE_RESTRICTED],

      // ── Import hygiene ──
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // ── No relative parent imports: use #alias subpath imports ──
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../**"],
              message:
                "Use #alias subpath imports (#core/, #adapters/, #storage/, #pipeline/) instead of relative parent paths.",
            },
          ],
        },
      ],

      // ── Comments: single-line only, no block comments, no JSDoc ──
      "multiline-comment-style": ["error", "separate-lines", { checkJSDoc: true }],
      "no-warning-comments": [
        "warn",
        { terms: ["fixme", "hack", "xxx"], location: "start" },
      ],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": true,
          "ts-nocheck": true,
        },
      ],
      "spaced-comment": ["error", "always", { markers: ["/"] }],

      // ── General quality ──
      "no-console": "warn",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },

  // ─── Hexagonal boundary: core/ and pipeline/ ──────────────────────
  {
    files: ["shared/src/core/**/*.ts", "shared/src/pipeline/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "fs", message: "Use a FileSystem interface in core/." },
            {
              name: "node:fs",
              message: "Use a FileSystem interface in core/.",
            },
            {
              name: "node:fs/promises",
              message: "Use a FileSystem interface in core/.",
            },
            { name: "path", message: "Use a PathResolver interface in core/." },
            {
              name: "node:path",
              message: "Use a PathResolver interface in core/.",
            },
            {
              name: "child_process",
              message: "No child_process in core/pipeline.",
            },
            {
              name: "node:child_process",
              message: "No child_process in core/pipeline.",
            },
            { name: "process", message: "No process access in core/pipeline." },
            {
              name: "node:process",
              message: "No process access in core/pipeline.",
            },
            { name: "os", message: "No os access in core/pipeline." },
            { name: "node:os", message: "No os access in core/pipeline." },
            {
              name: "crypto",
              message: "Use a Hasher interface in core/pipeline.",
            },
            {
              name: "node:crypto",
              message: "Use a Hasher interface in core/pipeline.",
            },
            {
              name: "better-sqlite3",
              message:
                "Use CacheStore/TelemetryStore interfaces. SQL lives in storage/ only.",
            },
            {
              name: "tiktoken",
              message: "Use the Tokenizer interface.",
            },
            {
              name: "fast-glob",
              message: "Use the GlobProvider interface.",
            },
            {
              name: "ignore",
              message: "Use the IgnoreProvider interface.",
            },
            {
              name: "typescript",
              message: "Use LanguageProvider interface.",
            },
            {
              name: "zod",
              message:
                "Zod validates at boundaries only (MCP/CLI/config). Core/pipeline trusts branded types. See ADR-009.",
            },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            {
              group: ["**/adapters/**"],
              message:
                "Core/pipeline must not import adapters. Depend on interfaces only.",
            },
            {
              group: ["**/storage/**"],
              message:
                "Core/pipeline must not import storage. Depend on store interfaces only.",
            },
            {
              group: ["@aic/cli", "@aic/cli/*", "**/cli/**"],
              message: "Core/pipeline must not import CLI code.",
            },
            {
              group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"],
              message: "Core/pipeline must not import MCP code.",
            },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...CORE_PIPELINE_RESTRICTED],
    },
  },

  // ─── Storage boundary ─────────────────────────────────────────────
  // Storage receives an open Database — no FS ops, no Zod, no external
  // libraries that have their own adapter. Only better-sqlite3 is allowed.
  {
    files: ["shared/src/storage/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "node:fs",
              message: "Storage receives an open Database. Composition root handles FS.",
            },
            {
              name: "fs",
              message: "Storage receives an open Database. Composition root handles FS.",
            },
            {
              name: "node:fs/promises",
              message: "Storage receives an open Database. Composition root handles FS.",
            },
            {
              name: "node:path",
              message: "Storage receives an open Database. Composition root handles FS.",
            },
            {
              name: "path",
              message: "Storage receives an open Database. Composition root handles FS.",
            },
            {
              name: "node:crypto",
              message: "Use a Hasher interface. Crypto is wrapped in adapters/.",
            },
            {
              name: "crypto",
              message: "Use a Hasher interface. Crypto is wrapped in adapters/.",
            },
            {
              name: "zod",
              message: "Zod validates at boundaries only (MCP/CLI/config). See ADR-009.",
            },
            {
              name: "tiktoken",
              message:
                "Use the Tokenizer interface. External libs are wrapped in adapters/.",
            },
            {
              name: "fast-glob",
              message:
                "Use the GlobProvider interface. External libs are wrapped in adapters/.",
            },
            {
              name: "ignore",
              message:
                "Use the IgnoreProvider interface. External libs are wrapped in adapters/.",
            },
            {
              name: "typescript",
              message: "Use LanguageProvider interface.",
            },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            {
              group: ["**/pipeline/**"],
              message: "Storage must not import pipeline code.",
            },
            {
              group: ["**/adapters/**"],
              message: "Storage must not import adapters.",
            },
            {
              group: ["@aic/cli", "@aic/cli/*", "**/cli/**"],
              message: "Storage must not import CLI code.",
            },
            {
              group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"],
              message: "Storage must not import MCP code.",
            },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...STORAGE_RESTRICTED],
    },
  },

  // ─── SqliteCacheStore: allow node:fs and node:path for cache blob I/O ───
  {
    files: ["shared/src/storage/sqlite-cache-store.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "node:crypto",
              message: "Use a Hasher interface. Crypto is wrapped in adapters/.",
            },
            {
              name: "crypto",
              message: "Use a Hasher interface. Crypto is wrapped in adapters/.",
            },
            {
              name: "zod",
              message: "Zod validates at boundaries only (MCP/CLI/config). See ADR-009.",
            },
            {
              name: "tiktoken",
              message:
                "Use the Tokenizer interface. External libs are wrapped in adapters/.",
            },
            {
              name: "fast-glob",
              message:
                "Use the GlobProvider interface. External libs are wrapped in adapters/.",
            },
            {
              name: "ignore",
              message:
                "Use the IgnoreProvider interface. External libs are wrapped in adapters/.",
            },
            {
              name: "typescript",
              message: "Use LanguageProvider interface.",
            },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            {
              group: ["**/pipeline/**"],
              message: "Storage must not import pipeline code.",
            },
            {
              group: ["**/adapters/**"],
              message: "Storage must not import adapters.",
            },
            {
              group: ["@aic/cli", "@aic/cli/*", "**/cli/**"],
              message: "Storage must not import CLI code.",
            },
            {
              group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"],
              message: "Storage must not import MCP code.",
            },
          ],
        },
      ],
    },
  },

  // ─── Migration files: must use ExecutableDb, not better-sqlite3 ───
  // Migrations define schema changes via the core interface. They must
  // not depend on the concrete Database type from better-sqlite3.
  {
    files: ["shared/src/storage/migrations/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "better-sqlite3",
              message:
                "Migration files must type db as ExecutableDb (core interface), not Database (better-sqlite3).",
            },
            {
              name: "node:fs",
              message: "Storage receives an open Database. Composition root handles FS.",
            },
            {
              name: "fs",
              message: "Storage receives an open Database. Composition root handles FS.",
            },
            {
              name: "node:fs/promises",
              message: "Storage receives an open Database. Composition root handles FS.",
            },
            {
              name: "node:path",
              message: "Storage receives an open Database. Composition root handles FS.",
            },
            {
              name: "path",
              message: "Storage receives an open Database. Composition root handles FS.",
            },
            {
              name: "node:crypto",
              message: "Use a Hasher interface. Crypto is wrapped in adapters/.",
            },
            {
              name: "crypto",
              message: "Use a Hasher interface. Crypto is wrapped in adapters/.",
            },
            {
              name: "zod",
              message: "Zod validates at boundaries only (MCP/CLI/config). See ADR-009.",
            },
            {
              name: "tiktoken",
              message:
                "Use the Tokenizer interface. External libs are wrapped in adapters/.",
            },
            {
              name: "fast-glob",
              message:
                "Use the GlobProvider interface. External libs are wrapped in adapters/.",
            },
            {
              name: "ignore",
              message:
                "Use the IgnoreProvider interface. External libs are wrapped in adapters/.",
            },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            {
              group: ["**/pipeline/**"],
              message: "Storage must not import pipeline code.",
            },
            {
              group: ["**/adapters/**"],
              message: "Storage must not import adapters.",
            },
            {
              group: ["@aic/cli", "@aic/cli/*", "**/cli/**"],
              message: "Storage must not import CLI code.",
            },
            {
              group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"],
              message: "Storage must not import MCP code.",
            },
          ],
        },
      ],
    },
  },

  // ─── Interface files: one interface per file (ISP) ────────────────
  {
    files: ["**/*.interface.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...INTERFACE_FILE_RESTRICTED],
    },
  },

  // ─── CLI boundary ───────────────────────────────────────────────────
  // CLI imports adapters from @aic/shared — never external libs directly.
  // Exception: zod (CLI parser is a validation boundary per ADR-009).
  {
    files: ["cli/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "tiktoken",
              message:
                "Import the Tokenizer adapter from @aic/shared, not tiktoken directly.",
            },
            {
              name: "fast-glob",
              message:
                "Import the GlobProvider adapter from @aic/shared, not fast-glob directly.",
            },
            {
              name: "ignore",
              message:
                "Import the IgnoreProvider adapter from @aic/shared, not ignore directly.",
            },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            {
              group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"],
              message: "CLI must not import MCP code.",
            },
          ],
        },
      ],
    },
  },

  // ─── MCP boundary ─────────────────────────────────────────────────
  // MCP imports adapters from @aic/shared — never external libs directly.
  // Exception: zod (MCP handlers are a validation boundary per ADR-009).
  {
    files: ["mcp/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "tiktoken",
              message:
                "Import the Tokenizer adapter from @aic/shared, not tiktoken directly.",
            },
            {
              name: "fast-glob",
              message:
                "Import the GlobProvider adapter from @aic/shared, not fast-glob directly.",
            },
            {
              name: "ignore",
              message:
                "Import the IgnoreProvider adapter from @aic/shared, not ignore directly.",
            },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            {
              group: ["@aic/cli", "@aic/cli/*", "**/cli/**"],
              message: "MCP must not import CLI code.",
            },
          ],
        },
      ],
    },
  },

  // ─── Adapter boundary: no CLI/MCP/storage/pipeline/sqlite/zod ─────
  {
    files: ["shared/src/adapters/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "better-sqlite3",
              message: "SQL lives in storage/ only. Adapters don't use SQLite.",
            },
            {
              name: "zod",
              message: "Zod validates at boundaries only (MCP/CLI/config). See ADR-009.",
            },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            {
              group: ["@aic/cli", "@aic/cli/*", "**/cli/**"],
              message: "Adapters must not import CLI code.",
            },
            {
              group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"],
              message: "Adapters must not import MCP code.",
            },
            {
              group: ["**/storage/**"],
              message: "Adapters must not import storage code.",
            },
            {
              group: ["**/pipeline/**"],
              message: "Adapters must not import pipeline code.",
            },
          ],
        },
      ],
      "no-restricted-syntax": ["error", ...BASE_RESTRICTED, ADAPTER_HASH_WHITELIST],
    },
  },

  // ─── Adapters: only tiktoken-adapter.ts may import tiktoken ─────────
  {
    files: ["shared/src/adapters/**/*.ts"],
    ignores: ["shared/src/adapters/tiktoken-adapter.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "better-sqlite3",
              message: "SQL lives in storage/ only. Adapters don't use SQLite.",
            },
            {
              name: "zod",
              message: "Zod validates at boundaries only (MCP/CLI/config). See ADR-009.",
            },
            {
              name: "tiktoken",
              message: "Only tiktoken-adapter.ts may import tiktoken.",
            },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            {
              group: ["@aic/cli", "@aic/cli/*", "**/cli/**"],
              message: "Adapters must not import CLI code.",
            },
            {
              group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"],
              message: "Adapters must not import MCP code.",
            },
            {
              group: ["**/storage/**"],
              message: "Adapters must not import storage code.",
            },
            {
              group: ["**/pipeline/**"],
              message: "Adapters must not import pipeline code.",
            },
          ],
        },
      ],
    },
  },

  // ─── Adapters: only fast-glob-adapter.ts may import fast-glob ─────
  {
    files: ["shared/src/adapters/**/*.ts"],
    ignores: [
      "shared/src/adapters/fast-glob-adapter.ts",
      "shared/src/adapters/tiktoken-adapter.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "better-sqlite3",
              message: "SQL lives in storage/ only. Adapters don't use SQLite.",
            },
            {
              name: "zod",
              message: "Zod validates at boundaries only (MCP/CLI/config). See ADR-009.",
            },
            {
              name: "tiktoken",
              message: "Only tiktoken-adapter.ts may import tiktoken.",
            },
            {
              name: "fast-glob",
              message: "Only fast-glob-adapter.ts may import fast-glob.",
            },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            {
              group: ["@aic/cli", "@aic/cli/*", "**/cli/**"],
              message: "Adapters must not import CLI code.",
            },
            {
              group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"],
              message: "Adapters must not import MCP code.",
            },
            {
              group: ["**/storage/**"],
              message: "Adapters must not import storage code.",
            },
            {
              group: ["**/pipeline/**"],
              message: "Adapters must not import pipeline code.",
            },
          ],
        },
      ],
    },
  },

  // ─── Adapters: only ignore-adapter.ts may import ignore ───────────
  {
    files: ["shared/src/adapters/**/*.ts"],
    ignores: [
      "shared/src/adapters/ignore-adapter.ts",
      "shared/src/adapters/fast-glob-adapter.ts",
      "shared/src/adapters/tiktoken-adapter.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "better-sqlite3",
              message: "SQL lives in storage/ only. Adapters don't use SQLite.",
            },
            {
              name: "zod",
              message: "Zod validates at boundaries only (MCP/CLI/config). See ADR-009.",
            },
            {
              name: "tiktoken",
              message: "Only tiktoken-adapter.ts may import tiktoken.",
            },
            {
              name: "fast-glob",
              message: "Only fast-glob-adapter.ts may import fast-glob.",
            },
            {
              name: "ignore",
              message: "Only ignore-adapter.ts may import ignore.",
            },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            {
              group: ["@aic/cli", "@aic/cli/*", "**/cli/**"],
              message: "Adapters must not import CLI code.",
            },
            {
              group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"],
              message: "Adapters must not import MCP code.",
            },
            {
              group: ["**/storage/**"],
              message: "Adapters must not import storage code.",
            },
            {
              group: ["**/pipeline/**"],
              message: "Adapters must not import pipeline code.",
            },
          ],
        },
      ],
    },
  },

  // ─── Adapters: only typescript-provider.ts may import typescript ───
  // Other adapters (tiktoken, fast-glob, ignore) are ignored so they keep their
  // own block; only typescript-provider is allowed to import typescript.
  {
    files: ["shared/src/adapters/**/*.ts"],
    ignores: [
      "shared/src/adapters/typescript-provider.ts",
      "shared/src/adapters/tiktoken-adapter.ts",
      "shared/src/adapters/fast-glob-adapter.ts",
      "shared/src/adapters/ignore-adapter.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "better-sqlite3",
              message: "SQL lives in storage/ only. Adapters don't use SQLite.",
            },
            {
              name: "zod",
              message: "Zod validates at boundaries only (MCP/CLI/config). See ADR-009.",
            },
            {
              name: "tiktoken",
              message: "Only tiktoken-adapter.ts may import tiktoken.",
            },
            {
              name: "fast-glob",
              message: "Only fast-glob-adapter.ts may import fast-glob.",
            },
            {
              name: "ignore",
              message: "Only ignore-adapter.ts may import ignore.",
            },
            {
              name: "typescript",
              message: "Only typescript-provider.ts may import typescript.",
            },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            {
              group: ["@aic/cli", "@aic/cli/*", "**/cli/**"],
              message: "Adapters must not import CLI code.",
            },
            {
              group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"],
              message: "Adapters must not import MCP code.",
            },
            {
              group: ["**/storage/**"],
              message: "Adapters must not import storage code.",
            },
            {
              group: ["**/pipeline/**"],
              message: "Adapters must not import pipeline code.",
            },
          ],
        },
      ],
    },
  },

  // ─── system-clock.ts exemption: allow new Date() and Date.now() ───
  // Must come AFTER adapter boundary so it overrides the adapter's rules.
  {
    files: ["shared/src/adapters/system-clock.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...SYSTEM_CLOCK_RESTRICTED,
        ADAPTER_HASH_WHITELIST,
      ],
    },
  },

  // ─── Test files: relax rules ──────────────────────────────────────
  // Tests need freedom to import setup deps (node:fs, better-sqlite3, etc.)
  {
    files: ["**/*.test.ts", "**/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "max-classes-per-file": "off",
      "no-console": "off",
      "no-param-reassign": "off",
      "no-restricted-syntax": "off",
      "no-restricted-imports": "off",
    },
  },

  // ─── Prettier compat (must be last) ────────────────────────────────
  eslintConfigPrettier,
);
