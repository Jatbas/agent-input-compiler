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
import { SwiftProvider } from "./swift-provider.js";
import { KotlinProvider } from "./kotlin-provider.js";
import { DartProvider } from "./dart-provider.js";

async function projectHasExtension(projectRoot: string, ext: string): Promise<boolean> {
  const glob = new FastGlobAdapter();
  const paths = await glob.find(
    [`**/*${ext}`, `!node_modules/**`, `!.git/**`, `!.aic/**`],
    toAbsolutePath(projectRoot),
  );
  return paths.length > 0;
}

export async function initLanguageProviders(
  projectRoot: string,
): Promise<readonly LanguageProvider[]> {
  await initTreeSitter();
  const py = (await projectHasExtension(projectRoot, ".py"))
    ? [await PythonProvider.create()]
    : [];
  const go = (await projectHasExtension(projectRoot, ".go"))
    ? [await GoProvider.create()]
    : [];
  const rs = (await projectHasExtension(projectRoot, ".rs"))
    ? [await RustProvider.create()]
    : [];
  const java = (await projectHasExtension(projectRoot, ".java"))
    ? [await JavaProvider.create()]
    : [];
  const rb = (await projectHasExtension(projectRoot, ".rb")) ? [new RubyProvider()] : [];
  const php = (await projectHasExtension(projectRoot, ".php")) ? [new PhpProvider()] : [];
  const css = (await projectHasExtension(projectRoot, ".css")) ? [new CssProvider()] : [];
  const html = (await projectHasExtension(projectRoot, ".html"))
    ? [new HtmlJsxProvider()]
    : [];
  const sh =
    (await projectHasExtension(projectRoot, ".sh")) ||
    (await projectHasExtension(projectRoot, ".bash"))
      ? [new ShellScriptProvider()]
      : [];
  const swift = (await projectHasExtension(projectRoot, ".swift"))
    ? [new SwiftProvider()]
    : [];
  const kt = (await projectHasExtension(projectRoot, ".kt"))
    ? [new KotlinProvider()]
    : [];
  const dart = (await projectHasExtension(projectRoot, ".dart"))
    ? [new DartProvider()]
    : [];
  return [
    ...py,
    ...go,
    ...rs,
    ...java,
    ...rb,
    ...php,
    ...css,
    ...html,
    ...sh,
    ...swift,
    ...kt,
    ...dart,
  ];
}
