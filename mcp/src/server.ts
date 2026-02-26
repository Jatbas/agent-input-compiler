import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { AbsolutePath } from "@aic/shared/core/types/paths.js";
import type { RelativePath } from "@aic/shared/core/types/paths.js";
import type { RulePack } from "@aic/shared/core/types/rule-pack.js";
import type { RulePackProvider } from "@aic/shared/core/interfaces/rule-pack-provider.interface.js";
import type { FileContentReader } from "@aic/shared/core/interfaces/file-content-reader.interface.js";
import type { BudgetConfig } from "@aic/shared/core/interfaces/budget-config.interface.js";
import { toAbsolutePath } from "@aic/shared/core/types/paths.js";
import { toTokenCount } from "@aic/shared/core/types/units.js";
import { type TaskClass } from "@aic/shared/core/types/enums.js";
import { InspectRunner } from "@aic/shared/pipeline/inspect-runner.js";
import { CompilationRequestSchema } from "./schemas/compilation-request.js";
import { InspectRequestSchema } from "./schemas/inspect-request.schema.js";
import { createCompileHandler } from "./handlers/compile-handler.js";
import { handleInspect } from "./handlers/inspect-handler.js";
import { createProjectScope } from "@aic/shared/storage/create-project-scope.js";
import { createFullPipelineDeps } from "@aic/shared/bootstrap/create-pipeline-deps.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CompilationRunner as CompilationRunnerImpl } from "@aic/shared/pipeline/compilation-runner.js";
import { Sha256Adapter } from "@aic/shared/adapters/sha256-adapter.js";
import { loadRulePackFromPath } from "@aic/shared/core/load-rule-pack.js";
import { createProjectFileReader } from "@aic/shared/adapters/project-file-reader-adapter.js";

export function createFileContentReader(projectRoot: AbsolutePath): FileContentReader {
  return {
    getContent(pathRel: RelativePath): string {
      const full = path.join(projectRoot, pathRel);
      return fs.readFileSync(full, "utf8");
    },
  };
}

function defaultRulePack(): RulePack {
  return {
    constraints: [],
    includePatterns: [],
    excludePatterns: [],
  };
}

export function createRulePackProvider(_projectRoot: AbsolutePath): RulePackProvider {
  return {
    getBuiltInPack(_name: string): RulePack {
      return defaultRulePack();
    },
    getProjectPack(projectRootArg: AbsolutePath, taskClass: TaskClass): RulePack | null {
      return loadRulePackFromPath(createProjectFileReader(projectRootArg), taskClass);
    },
  };
}

export function createDefaultBudgetConfig(): BudgetConfig {
  return {
    getMaxTokens(): ReturnType<typeof toTokenCount> {
      return toTokenCount(8000);
    },
    getBudgetForTaskClass(_taskClass: TaskClass): ReturnType<typeof toTokenCount> | null {
      return null;
    },
  };
}

export function createMcpServer(projectRoot: AbsolutePath): McpServer {
  const scope = createProjectScope(projectRoot);
  const fileContentReader = createFileContentReader(projectRoot);
  const rulePackProvider = createRulePackProvider(projectRoot);
  const budgetConfig = createDefaultBudgetConfig();
  const deps = createFullPipelineDeps(fileContentReader, rulePackProvider, budgetConfig);
  const inspectRunner = new InspectRunner(deps, scope.clock);
  const sha256Adapter = new Sha256Adapter();
  const compilationRunner = new CompilationRunnerImpl(
    deps,
    scope.clock,
    scope.cacheStore,
    scope.configStore,
    sha256Adapter,
  );
  const server = new McpServer({ name: "aic", version: "0.1.0" });
  server.tool(
    "aic_compile",
    CompilationRequestSchema,
    createCompileHandler(compilationRunner, {
      telemetryStore: scope.telemetryStore,
      clock: scope.clock,
      idGenerator: scope.idGenerator,
      stringHasher: sha256Adapter,
    }),
  );
  server.tool("aic_inspect", InspectRequestSchema, (args) =>
    handleInspect(args, inspectRunner),
  );
  server.resource("last-compilation", "aic://last-compilation", () => ({
    contents: [],
  }));
  return server;
}

export async function main(): Promise<void> {
  const projectRoot = toAbsolutePath(process.cwd());
  const server = createMcpServer(projectRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isEntry =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isEntry) {
  main().catch((err) => {
    process.stderr.write(String(err));
    process.exit(1);
  });
}
