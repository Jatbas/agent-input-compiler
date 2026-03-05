import * as path from "node:path";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { GlobProvider } from "#core/interfaces/glob-provider.interface.js";
import type { IgnoreProvider } from "#core/interfaces/ignore-provider.interface.js";
import type { AbsolutePath } from "#core/types/paths.js";
import type { RepoMap, FileEntry } from "#core/types/repo-map.js";
import { toTokenCount } from "#core/types/units.js";

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mov",
  ".webm",
  ".zip",
  ".gz",
  ".tar",
  ".rar",
  ".7z",
  ".bz2",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".sqlite",
  ".db",
  ".sqlite3",
  ".wasm",
  ".map",
]);

const EXTENSION_TO_LANGUAGE: Readonly<Record<string, string>> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".md": "markdown",
  ".mdx": "markdown",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".css": "css",
  ".scss": "scss",
  ".html": "html",
  ".xml": "xml",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".rb": "ruby",
  ".swift": "swift",
  ".kt": "kotlin",
  ".sql": "sql",
  ".graphql": "graphql",
  ".proto": "protobuf",
  ".vue": "vue",
  ".svelte": "svelte",
};

const DEFAULT_NEGATIVE_PATTERNS: readonly string[] = [
  "!node_modules/**",
  "!.git/**",
  "!dist/**",
  "!build/**",
  "!coverage/**",
  "!.aic/**",
  "!.next/**",
  "!.nuxt/**",
  "!__pycache__/**",
  "!.tsbuildinfo",
];

function languageFromExtension(ext: string): string {
  return EXTENSION_TO_LANGUAGE[ext] ?? (ext.length > 1 ? ext.slice(1) : "unknown");
}

function isBinaryExtension(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext);
}

export class FileSystemRepoMapSupplier implements RepoMapSupplier {
  constructor(
    private readonly globProvider: GlobProvider,
    private readonly ignoreProvider: IgnoreProvider,
  ) {}

  getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap> {
    const patterns = ["**/*", ...DEFAULT_NEGATIVE_PATTERNS];
    const withStats = this.globProvider.findWithStats(patterns, projectRoot);
    const entries = withStats
      .filter((e) => this.ignoreProvider.accepts(e.path, projectRoot))
      .reduce<readonly FileEntry[]>((acc, entry) => {
        const ext = path.extname(entry.path).toLowerCase();
        if (isBinaryExtension(ext)) return acc;
        const language = languageFromExtension(ext);
        const estimatedTokens = toTokenCount(Math.ceil(entry.sizeBytes / 4));
        return [
          ...acc,
          {
            path: entry.path,
            language,
            sizeBytes: entry.sizeBytes,
            estimatedTokens,
            lastModified: entry.lastModified,
          },
        ];
      }, []);
    const totalTokensRaw = entries.reduce((sum, e) => sum + e.estimatedTokens, 0);
    return Promise.resolve({
      root: projectRoot,
      files: entries,
      totalFiles: entries.length,
      totalTokens: toTokenCount(totalTokensRaw),
    });
  }
}
