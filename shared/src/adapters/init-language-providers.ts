import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import { toAbsolutePath } from "#core/types/paths.js";
import { FastGlobAdapter } from "./fast-glob-adapter.js";
import { initTreeSitter } from "./tree-sitter-init.js";
import { PythonProvider } from "./python-provider.js";
import { GoProvider } from "./go-provider.js";

function projectHasExtension(projectRoot: string, ext: string): boolean {
  const glob = new FastGlobAdapter();
  return (
    glob.find(
      [`**/*${ext}`, `!node_modules/**`, `!.git/**`, `!.aic/**`],
      toAbsolutePath(projectRoot),
    ).length > 0
  );
}

export async function initLanguageProviders(
  projectRoot: string,
): Promise<readonly LanguageProvider[]> {
  await initTreeSitter();
  const py = projectHasExtension(projectRoot, ".py")
    ? [await PythonProvider.create()]
    : [];
  const go = projectHasExtension(projectRoot, ".go") ? [await GoProvider.create()] : [];
  return [...py, ...go];
}
