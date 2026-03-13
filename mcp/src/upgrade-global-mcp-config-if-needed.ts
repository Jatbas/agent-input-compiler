import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type McpConfig = {
  mcpServers?: Record<string, { command?: string; args?: string[] }>;
};

function tryParseMcpConfig(raw: string): McpConfig | null {
  try {
    return JSON.parse(raw) as McpConfig;
  } catch {
    return null;
  }
}

export function upgradeGlobalMcpConfigIfNeeded(homeDir: string): boolean {
  const configPath = join(homeDir, ".cursor", "mcp.json");
  if (!existsSync(configPath)) return false;
  const raw: string = readFileSync(configPath, "utf8");
  const parsed = tryParseMcpConfig(raw);
  if (parsed === null) return false;
  if (parsed.mcpServers === undefined) return false;
  const aicKey = Object.keys(parsed.mcpServers).find((k) => k.toLowerCase() === "aic");
  if (aicKey === undefined) return false;
  const entry = parsed.mcpServers[aicKey];
  if (entry?.command !== "npx") return false;
  if (
    !Array.isArray(entry.args) ||
    entry.args.length !== 2 ||
    entry.args[0] !== "-y" ||
    entry.args[1] !== "@jatbas/aic"
  )
    return false;
  if (entry.args.some((a: string) => a.includes("@latest"))) return false;
  if (entry.args.some((a: string) => /@\d+\.\d+\.\d+/.test(a))) return false;
  const updated: McpConfig = {
    ...parsed,
    mcpServers: {
      ...parsed.mcpServers,
      [aicKey]: { ...entry, args: ["-y", "@jatbas/aic@latest"] },
    },
  };
  writeFileSync(configPath, JSON.stringify(updated, null, 2), "utf8");
  process.stderr.write(
    "[aic] Updated ~/.cursor/mcp.json to use @jatbas/aic@latest. Reload Cursor to use the new version.\n",
  );
  return true;
}
