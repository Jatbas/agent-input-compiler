import type { ContentTransformer } from "#core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import { toFileExtension } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

const HTML_EXTENSIONS: readonly FileExtension[] = [
  toFileExtension(".html"),
  toFileExtension(".htm"),
];

function stripScriptAndStyle(content: string): string {
  return content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
}

const BLOCK_REPLACEMENTS: readonly [RegExp, (inner: string) => string][] = [
  [/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (inner) => `# ${inner.trim()}\n`],
  [/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (inner) => `## ${inner.trim()}\n`],
  [/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (inner) => `### ${inner.trim()}\n`],
  [/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (inner) => `#### ${inner.trim()}\n`],
  [/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (inner) => `##### ${inner.trim()}\n`],
  [/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (inner) => `###### ${inner.trim()}\n`],
  [/<p[^>]*>([\s\S]*?)<\/p>/gi, (inner) => `${inner.trim()}\n\n`],
  [/<li[^>]*>([\s\S]*?)<\/li>/gi, (inner) => `- ${inner.trim()}\n`],
  [/<br\s*\/?>/gi, () => "\n"],
];

function blockTagsToMarkdown(content: string): string {
  return BLOCK_REPLACEMENTS.reduce(
    (acc, [re, replacer]) =>
      acc.replace(re, (_: string, inner: string) => replacer(inner)),
    content,
  );
}

function applyOneInlinePass(content: string): string {
  return content
    .replace(
      /<a\s+href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_, url: string, text: string) => `[${text.trim()}](${url})`,
    )
    .replace(
      /<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi,
      (_, inner: string) => `**${inner.trim()}**`,
    )
    .replace(
      /<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi,
      (_, inner: string) => `*${inner.trim()}*`,
    )
    .replace(
      /<code[^>]*>([\s\S]*?)<\/code>/gi,
      (_, inner: string) => `\`${inner.trim()}\``,
    );
}

function inlineTagsToMarkdown(content: string, passesLeft: number): string {
  if (passesLeft <= 0) return content;
  const next = applyOneInlinePass(content);
  return next === content
    ? content
    : inlineTagsToMarkdown(next, passesLeft - 1);
}

function stripRemainingTags(content: string): string {
  return content.replace(/<[^>]+>/g, "");
}

function normalizeWhitespace(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function htmlToMarkdown(content: string): string {
  const withoutBlocks = stripScriptAndStyle(content);
  const withBlocks = blockTagsToMarkdown(withoutBlocks);
  const withInline = inlineTagsToMarkdown(withBlocks, 10);
  const withoutTags = stripRemainingTags(withInline);
  return normalizeWhitespace(withoutTags);
}

export class HtmlToMarkdownTransformer implements ContentTransformer {
  readonly id = "html-to-markdown-transformer";
  readonly fileExtensions: readonly FileExtension[] = HTML_EXTENSIONS;

  transform(
    content: string,
    _tier: InclusionTier,
    _filePath: RelativePath,
  ): string {
    if (content.length === 0) return content;
    return htmlToMarkdown(content);
  }
}
