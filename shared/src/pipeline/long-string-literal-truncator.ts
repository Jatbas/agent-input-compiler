import type { ContentTransformer } from "#core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

const MAX_STRING_LITERAL_LENGTH = 200;
const DOUBLE_QUOTED_RE = /"(?:[^"\\]|\\.)*"/g;
const SINGLE_QUOTED_RE = /'(?:[^'\\]|\\.)*'/g;

function replaceLongLiteral(match: string): string {
  const inner = match.slice(1, -1);
  if (inner.length <= MAX_STRING_LITERAL_LENGTH) return match;
  const quote = match[0];
  return `${quote}[string literal truncated: ${inner.length} chars]${quote}`;
}

export class LongStringLiteralTruncator implements ContentTransformer {
  readonly id = "long-string-literal-truncator";
  readonly fileExtensions: readonly FileExtension[] = [];

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    if (content.length === 0) return content;
    return content
      .replace(DOUBLE_QUOTED_RE, replaceLongLiteral)
      .replace(SINGLE_QUOTED_RE, replaceLongLiteral);
  }
}
