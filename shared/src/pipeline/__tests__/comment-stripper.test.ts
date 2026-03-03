import { describe, it, expect } from "vitest";
import { CommentStripper } from "../comment-stripper.js";
import { toRelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

const path = toRelativePath("src/foo.ts");

describe("CommentStripper", () => {
  it("strips_single_line_comments", () => {
    const stripper = new CommentStripper();
    const content = "// comment\nconst x = 1;\n// another\nconst y = 2;";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toContain("const x = 1;");
    expect(result).toContain("const y = 2;");
    expect(result).not.toContain("// comment");
  });

  it("strips_block_comments", () => {
    const stripper = new CommentStripper();
    const content = "/* block\ncomment */\nconst x = 1;";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toContain("const x = 1;");
    expect(result).not.toContain("block");
  });

  it("jsdoc_params_preserved_at_l1", () => {
    const stripper = new CommentStripper();
    const content = "/** @param name - the name */\nfunction f() {}";
    const result = stripper.transform(content, INCLUSION_TIER.L1, path);
    expect(result).toContain("@param");
  });

  it("inline_comment_stripped", () => {
    const stripper = new CommentStripper();
    const content = "const x = 1; // inline comment";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toContain("const x = 1;");
    expect(result).not.toContain("inline comment");
  });

  it("empty_content_returns_unchanged", () => {
    const stripper = new CommentStripper();
    const content = "";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("");
  });

  it("no_comments_returns_unchanged", () => {
    const stripper = new CommentStripper();
    const content = "const x = 1;\nconst y = 2;";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("const x = 1;\nconst y = 2;");
  });

  it("safety_ts_code_structure_preserved", () => {
    const stripper = new CommentStripper();
    const content = [
      "import { foo } from './bar';",
      "// util",
      "export class Service {",
      "  run() { return 1; } // inline",
      "}",
    ].join("\n");
    const result = stripper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("src/service.ts"),
    );
    expect(result).toContain("import { foo } from './bar';");
    expect(result).toContain("export class Service {");
    expect(result).toContain("run() { return 1; }");
    expect(result).toContain("}");
  });

  it("safety_js_code_structure_preserved", () => {
    const stripper = new CommentStripper();
    const content = [
      "const path = require('path');",
      "// helper",
      "module.exports = { run };",
    ].join("\n");
    const result = stripper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("src/util.js"),
    );
    expect(result).toContain("const path = require('path');");
    expect(result).toContain("module.exports = { run };");
  });

  it("safety_go_code_structure_preserved", () => {
    const stripper = new CommentStripper();
    const content = [
      "package main",
      "// fmt",
      'import "fmt"',
      "func main() {",
      "  fmt.Println(1) // print",
      "}",
    ].join("\n");
    const result = stripper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("main.go"),
    );
    expect(result).toContain("package main");
    expect(result).toContain('import "fmt"');
    expect(result).toContain("func main() {");
    expect(result).toContain("fmt.Println(1)");
    expect(result).toContain("}");
  });

  it("safety_java_code_structure_preserved", () => {
    const stripper = new CommentStripper();
    const content = [
      "package com.example;",
      "// imports",
      "import java.util.List;",
      "public class App {",
      "  public static void main(String[] args) {} // entry",
      "}",
    ].join("\n");
    const result = stripper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("App.java"),
    );
    expect(result).toContain("package com.example;");
    expect(result).toContain("import java.util.List;");
    expect(result).toContain("public class App {");
    expect(result).toContain("public static void main(String[] args) {}");
    expect(result).toContain("}");
  });

  it("safety_rs_code_structure_preserved", () => {
    const stripper = new CommentStripper();
    const content = [
      "use std::io;",
      "// main",
      "fn main() {",
      "  let x = 1; // var",
      "}",
    ].join("\n");
    const result = stripper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("main.rs"),
    );
    expect(result).toContain("use std::io;");
    expect(result).toContain("fn main() {");
    expect(result).toContain("let x = 1;");
    expect(result).toContain("}");
  });

  it("safety_c_code_structure_preserved", () => {
    const stripper = new CommentStripper();
    const content = [
      "#include <stdio.h>",
      "// main",
      "int main() {",
      "  return 0; /* exit */",
      "}",
    ].join("\n");
    const result = stripper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("main.c"),
    );
    expect(result).toContain("#include <stdio.h>");
    expect(result).toContain("int main() {");
    expect(result).toContain("return 0;");
    expect(result).toContain("}");
  });

  it("safety_cpp_code_structure_preserved", () => {
    const stripper = new CommentStripper();
    const content = [
      "#include <iostream>",
      "// ns",
      "namespace app {",
      "class Foo {}; // class",
      "}",
    ].join("\n");
    const result = stripper.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("main.cpp"),
    );
    expect(result).toContain("#include <iostream>");
    expect(result).toContain("namespace app {");
    expect(result).toContain("class Foo {};");
    expect(result).toContain("}");
  });
});
