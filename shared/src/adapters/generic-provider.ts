import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import { toRelativePath } from "#core/types/paths.js";
import { toLineNumber, toTokenCount } from "#core/types/units.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";

// Best-effort regex: line starts with function/class/def/fn/pub fn (multi-language).
const SIGNATURE_LINE_RE =
  /^\s*(?:function\s+(\w+)|class\s+(\w+)|def\s+(\w+)|(?:pub\s+)?fn\s+(\w+))/;

// Export-like patterns: export const X, export function X, export class X, export { a, b }.
const EXPORT_DECL_RE = /^\s*export\s+(?:const|let|var)\s+(\w+)/gm;
const EXPORT_FN_RE = /^\s*export\s+function\s+(\w+)/gm;
const EXPORT_CLASS_RE = /^\s*export\s+class\s+(\w+)/gm;
const EXPORT_NAMED_RE = /^\s*export\s*\{\s*([^}]+)\s*\}/gm;

const EMPTY_PATH = toRelativePath("");

export class GenericProvider implements LanguageProvider {
  readonly id = "generic";
  readonly extensions: readonly FileExtension[];

  constructor() {
    this.extensions = [];
  }

  parseImports(_fileContent: string, _filePath: RelativePath): readonly ImportRef[] {
    return [];
  }

  extractSignaturesWithDocs(_fileContent: string): readonly CodeChunk[] {
    return [];
  }

  extractSignaturesOnly(fileContent: string): readonly CodeChunk[] {
    try {
      const lines = fileContent.split("\n");
      const chunks = lines.reduce<readonly CodeChunk[]>((acc, line, i) => {
        const m = SIGNATURE_LINE_RE.exec(line);
        if (m === null) return acc;
        const symbolName = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
        if (symbolName === "") return acc;
        const isClass = m[2] !== undefined && m[2] !== "";
        const lineNum = i + 1;
        const chunk: CodeChunk = {
          filePath: EMPTY_PATH,
          symbolName,
          symbolType: isClass ? SYMBOL_TYPE.CLASS : SYMBOL_TYPE.FUNCTION,
          startLine: toLineNumber(lineNum),
          endLine: toLineNumber(lineNum),
          content: line,
          tokenCount: toTokenCount(0),
        };
        return [...acc, chunk];
      }, []);
      return chunks;
    } catch {
      return [];
    }
  }

  extractNames(fileContent: string): readonly ExportedSymbol[] {
    try {
      const seen = new Set<string>();
      let out: readonly ExportedSymbol[] = [];

      function add(name: string, kind: "const" | "function" | "class"): void {
        if (name === "" || seen.has(name)) return;
        seen.add(name);
        const symbolKind =
          kind === "class"
            ? SYMBOL_KIND.CLASS
            : kind === "function"
              ? SYMBOL_KIND.FUNCTION
              : SYMBOL_KIND.CONST;
        out = [...out, { name, kind: symbolKind }];
      }

      let m: RegExpExecArray | null;
      EXPORT_DECL_RE.lastIndex = 0;
      while ((m = EXPORT_DECL_RE.exec(fileContent)) !== null) {
        const name = m[1];
        if (name !== undefined) add(name, "const");
      }
      EXPORT_FN_RE.lastIndex = 0;
      while ((m = EXPORT_FN_RE.exec(fileContent)) !== null) {
        const name = m[1];
        if (name !== undefined) add(name, "function");
      }
      EXPORT_CLASS_RE.lastIndex = 0;
      while ((m = EXPORT_CLASS_RE.exec(fileContent)) !== null) {
        const name = m[1];
        if (name !== undefined) add(name, "class");
      }
      EXPORT_NAMED_RE.lastIndex = 0;
      while ((m = EXPORT_NAMED_RE.exec(fileContent)) !== null) {
        const list = m[1];
        if (list === undefined) continue;
        const names = list.split(",").map((s) => {
          const t = s.trim().split(/\s+as\s+/);
          return (t[0] ?? "").trim();
        });
        for (const name of names) {
          if (name.length > 0) add(name, "const");
        }
      }
      return out;
    } catch {
      return [];
    }
  }
}
