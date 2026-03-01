import { Parser } from "web-tree-sitter";

export async function initTreeSitter(): Promise<void> {
  await Parser.init();
}
