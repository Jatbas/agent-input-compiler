import * as fs from "node:fs";
import * as path from "node:path";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { GlobProvider } from "#core/interfaces/glob-provider.interface.js";
import type { IgnoreProvider } from "#core/interfaces/ignore-provider.interface.js";
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";
import type { RepoMap, FileEntry } from "#core/types/repo-map.js";
import { toBytes, toTokenCount } from "#core/types/units.js";
import { toISOTimestamp } from "#core/types/identifiers.js";

const BYTES_PER_TOKEN = 4;

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

function tryStatFile(fullPath: string, relativePath: RelativePath): FileEntry | null {
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) return null;
    const ext = path.extname(relativePath).toLowerCase();
    if (isBinaryExtension(ext)) return null;
    const sizeBytes = toBytes(stat.size);
    const estimatedTokens = toTokenCount(Math.ceil(stat.size / BYTES_PER_TOKEN));
    const entry: FileEntry = {
      path: relativePath,
      language: languageFromExtension(ext),
      sizeBytes,
      estimatedTokens,
      lastModified: toISOTimestamp(stat.mtime.toISOString()),
    };
    return entry;
  } catch {
    return null;
  }
}

export class FileSystemRepoMapSupplier implements RepoMapSupplier {
  constructor(
    private readonly globProvider: GlobProvider,
    private readonly ignoreProvider: IgnoreProvider,
  ) {}

  getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap> {
    const patterns = ["**/*", ...DEFAULT_NEGATIVE_PATTERNS];
    const allFiles = this.globProvider.find(patterns, projectRoot);
    const entries = allFiles
      .filter((f) => this.ignoreProvider.accepts(f, projectRoot))
      .reduce<readonly FileEntry[]>((acc, relativePath) => {
        const fullPath = path.join(projectRoot, relativePath);
        const entry = tryStatFile(fullPath, relativePath);
        return entry !== null ? [...acc, entry] : acc;
      }, []);
    const totalTokens = entries.reduce((sum, e) => sum + e.estimatedTokens, 0);
    return Promise.resolve({
      root: projectRoot,
      files: entries,
      totalFiles: entries.length,
      totalTokens: toTokenCount(totalTokens),
    });
  }
}
