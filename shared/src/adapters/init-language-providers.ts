import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import { toAbsolutePath } from "#core/types/paths.js";
import { FastGlobAdapter } from "./fast-glob-adapter.js";
import { initTreeSitter } from "./tree-sitter-init.js";
import { PythonProvider } from "./python-provider.js";
import { GoProvider } from "./go-provider.js";
import { RustProvider } from "./rust-provider.js";
import { JavaProvider } from "./java-provider.js";
import { RubyProvider } from "./ruby-provider.js";
import { PhpProvider } from "./php-provider.js";
import { CssProvider } from "./css-provider.js";
import { HtmlJsxProvider } from "./html-jsx-provider.js";
import { ShellScriptProvider } from "./shell-script-provider.js";

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
  const rs = projectHasExtension(projectRoot, ".rs") ? [await RustProvider.create()] : [];
  const java = projectHasExtension(projectRoot, ".java")
    ? [await JavaProvider.create()]
    : [];
  const rb = projectHasExtension(projectRoot, ".rb") ? [new RubyProvider()] : [];
  const php = projectHasExtension(projectRoot, ".php") ? [new PhpProvider()] : [];
  const css = projectHasExtension(projectRoot, ".css") ? [new CssProvider()] : [];
  const html = projectHasExtension(projectRoot, ".html") ? [new HtmlJsxProvider()] : [];
  const sh =
    projectHasExtension(projectRoot, ".sh") || projectHasExtension(projectRoot, ".bash")
      ? [new ShellScriptProvider()]
      : [];
  return [...py, ...go, ...rs, ...java, ...rb, ...php, ...css, ...html, ...sh];
}
