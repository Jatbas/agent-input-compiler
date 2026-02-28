// Claude Code hook — SessionEnd
// Logs session end event to .aic/prompt-log.jsonl for telemetry.
// This capability is not available in Cursor.
const fs = require("fs");
const path = require("path");

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const LOG_FILE = path.join(projectRoot, ".aic", "prompt-log.jsonl");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const entry = {
      type: "session_end",
      sessionId: input.session_id || "unknown",
      reason: input.reason || "unknown",
      timestamp: new Date().toISOString(),
    };
    const dir = path.dirname(LOG_FILE);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Non-fatal — never block session end
  }
});
