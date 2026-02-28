// Claude Code hook — SessionStart
// Fires on: startup, resume, clear, compact
// Compiles AIC context and injects it as additionalContext so the model
// starts every session (including post-compaction) with relevant project context.
const fs = require("fs");
const path = require("path");
const { callAicCompile } = require("./aic-compile-helper.cjs");

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const INTENT = "understand project structure, architecture, and recent changes";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const parts = [];

    // Inject critical reminders from CLAUDE.md
    const claudeMdPath = path.join(projectRoot, ".claude", "CLAUDE.md");
    if (fs.existsSync(claudeMdPath)) {
      const content = fs.readFileSync(claudeMdPath, "utf-8");
      const startIdx = content.indexOf("## Non-Negotiable");
      if (startIdx !== -1) {
        const afterStart = content.slice(startIdx);
        const endIdx = afterStart.indexOf("\n## ", 1);
        const section = endIdx === -1 ? afterStart : afterStart.slice(0, endIdx);
        const bullets = section
          .split("\n")
          .filter((line) => line.startsWith("- **"))
          .map((line) => line.trim())
          .join("\n");
        if (bullets.length > 0) {
          parts.push(`AIC Architectural Invariants (auto-injected):\n${bullets}`);
        }
      }
    }

    // Compile project context
    const compiled = callAicCompile(INTENT, projectRoot, 20000);
    if (compiled) {
      parts.push(
        [
          "## AIC Compiled Context (auto-injected at session start)",
          "The following is the most relevant project context, compiled by AIC.",
          "AIC hooks auto-compile fresh context on every prompt — you do not need",
          "to call aic_compile manually unless you need a different intent.",
          "",
          compiled,
        ].join("\n"),
      );
    }

    if (parts.length > 0) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: parts.join("\n\n"),
          },
        }),
      );
    }
  } catch {
    // Non-fatal — never block session creation
    process.exit(0);
  }
});
