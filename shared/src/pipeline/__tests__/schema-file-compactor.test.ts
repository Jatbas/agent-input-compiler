import { describe, it, expect } from "vitest";
import { SchemaFileCompactor } from "../schema-file-compactor.js";
import { toRelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

describe("SchemaFileCompactor", () => {
  it("json_schema_description_fields_stripped", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("schema/user.json");
    const content = `{"$schema":"http://json-schema.org/draft-07/schema","type":"object","description":"User model","properties":{"name":{"description":"Full name","type":"string"}}}`;
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).not.toContain('"description"');
    expect(result).toContain('"type"');
    expect(result).toContain('"properties"');
    expect(result).toContain('"$schema"');
  });

  it("json_schema_examples_stripped", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("api/schema.json");
    const content = `{"$schema":"http://json-schema.org/draft-07/schema","examples":[1,2,3],"type":"string"}`;
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).not.toContain('"examples"');
    expect(result).toContain('"type"');
  });

  it("json_schema_nested_metadata_stripped", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("schemas/root.json");
    const content = `{"$ref":"#/definitions/Foo","definitions":{"Foo":{"title":"Foo","description":"Bar","properties":{"a":{"default":1}}}}}`;
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).not.toContain('"title"');
    expect(result).not.toContain('"description"');
    expect(result).not.toContain('"default"');
    expect(result).toContain('"definitions"');
    expect(result).toContain('"$ref"');
    expect(result).toContain('"properties"');
  });

  it("graphql_descriptions_stripped", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("schema.graphql");
    const content = `type User """User type""" { id: ID } # comment`;
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).not.toContain('"""');
    expect(result).not.toContain("# comment");
    expect(result).toContain("type User");
    expect(result).toContain("{ id: ID }");
  });

  it("prisma_comments_stripped", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("prisma/schema.prisma");
    const content = `// comment\nmodel User { id Int }\n/// doc`;
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).not.toContain("// comment");
    expect(result).not.toContain("/// doc");
    expect(result).toContain("model User");
    expect(result).toContain("{ id Int }");
  });

  it("proto_comments_stripped", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("api/service.proto");
    const content = `// comment\nmessage Foo { string x = 1; }`;
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).not.toContain("// comment");
    expect(result).toContain("message Foo");
  });

  it("non_schema_json_unchanged", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("package.json");
    const content = `{"name":"pkg","version":"1.0.0"}`;
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });

  it("non_schema_path_unchanged", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("src/index.ts");
    const content = "const x = 1";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });

  it("empty_content_returns_unchanged", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("schema.json");
    const content = "";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe("");
  });

  it("invalid_json_returns_unchanged", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("bad.json");
    const content = `{ invalid `;
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });

  it("safety_python_indentation_preserved", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("src/main.py");
    const content = "def f():\n  pass";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });

  it("safety_yaml_structure_unchanged", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("config.yml");
    const content = "key:\n  nested: 1";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });

  it("safety_jsx_structure_unchanged", () => {
    const transformer = new SchemaFileCompactor();
    const filePath = toRelativePath("src/App.tsx");
    const content = "<div>x</div>";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });
});
