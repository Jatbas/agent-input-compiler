// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { IgnoreProvider } from "@jatbas/aic-core/core/interfaces/ignore-provider.interface.js";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { DEFAULT_NEGATIVE_PATTERNS } from "./default-ignore-patterns.js";
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

const EXTENSION_SCAN_SYSTEM_DIRS: readonly string[] = [
  "!.Trash/**",
  "!Library/**",
  "!$Recycle.Bin/**",
  "!AppData/**",
  "!.local/**",
  "!.cache/**",
  "!snap/**",
];

async function projectHasExtension(
  projectRoot: string,
  ext: string,
  ignoreProvider: IgnoreProvider,
): Promise<boolean> {
  const glob = new FastGlobAdapter();
  const root = toAbsolutePath(projectRoot);
  const patterns = [
    `**/*${ext}`,
    ...DEFAULT_NEGATIVE_PATTERNS,
    ...EXTENSION_SCAN_SYSTEM_DIRS,
  ];
  const paths = await glob.find(patterns, root);
  const filtered = paths.filter((p) => ignoreProvider.accepts(p, root));
  return filtered.length > 0;
}

export async function initLanguageProviders(
  projectRoot: string,
  ignoreProvider: IgnoreProvider,
): Promise<readonly LanguageProvider[]> {
  await initTreeSitter();
  const py = (await projectHasExtension(projectRoot, ".py", ignoreProvider))
    ? [await PythonProvider.create()]
    : [];
  const go = (await projectHasExtension(projectRoot, ".go", ignoreProvider))
    ? [await GoProvider.create()]
    : [];
  const rs = (await projectHasExtension(projectRoot, ".rs", ignoreProvider))
    ? [await RustProvider.create()]
    : [];
  const java = (await projectHasExtension(projectRoot, ".java", ignoreProvider))
    ? [await JavaProvider.create()]
    : [];
  const rb = (await projectHasExtension(projectRoot, ".rb", ignoreProvider))
    ? [new RubyProvider()]
    : [];
  const php = (await projectHasExtension(projectRoot, ".php", ignoreProvider))
    ? [new PhpProvider()]
    : [];
  const css = (await projectHasExtension(projectRoot, ".css", ignoreProvider))
    ? [new CssProvider()]
    : [];
  const html = (await projectHasExtension(projectRoot, ".html", ignoreProvider))
    ? [new HtmlJsxProvider()]
    : [];
  const sh =
    (await projectHasExtension(projectRoot, ".sh", ignoreProvider)) ||
    (await projectHasExtension(projectRoot, ".bash", ignoreProvider))
      ? [new ShellScriptProvider()]
      : [];
  const swift = (await projectHasExtension(projectRoot, ".swift", ignoreProvider))
    ? [new SwiftProvider()]
    : [];
  const kt = (await projectHasExtension(projectRoot, ".kt", ignoreProvider))
    ? [new KotlinProvider()]
    : [];
  const dart = (await projectHasExtension(projectRoot, ".dart", ignoreProvider))
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
