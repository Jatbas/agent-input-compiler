// Claude Code hook — SubagentStart
// Compiles intent-specific context for each subagent and injects it as
// additionalContext. This capability is impossible in Cursor — subagents
// there fly blind without project context.
const { callAicCompile } = require("./aic-compile-helper.cjs");

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const agentType = input.agent_type || "unknown";
    const intent = `subagent task (${agentType}): understand project architecture and conventions`;

    const compiled = callAicCompile(intent, projectRoot, 25000);
    if (compiled) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "SubagentStart",
            additionalContext: [
              `## AIC Compiled Context (auto-injected for ${agentType} subagent)`,
              "Follow the architectural invariants and conventions in this context.",
              "",
              compiled,
            ].join("\n"),
          },
        }),
      );
    }
  } catch {
    // Non-fatal — never block subagent creation
    process.exit(0);
  }
});
