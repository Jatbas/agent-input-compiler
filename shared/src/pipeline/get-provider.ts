import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";

export function getProvider(
  path: string,
  providers: readonly LanguageProvider[],
): LanguageProvider | undefined {
  const ext = path.slice(path.lastIndexOf("."));
  return providers.find((p) =>
    p.extensions.some((e) => e.toLowerCase() === ext.toLowerCase()),
  );
}
