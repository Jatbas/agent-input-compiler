// Claude Code hook — PostToolUse (matcher: Write|Edit)
// Records each edited file path to a session-specific tracking file.
// The stop-check hook reads this to know which files to lint.
const fs = require("fs");
const path = require("path");
const os = require("os");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const sessionId = input.session_id || "default";
    const filePath = (input.tool_input || {}).file_path;

    if (!filePath) {
      process.exit(0);
      return;
    }

    const trackingFile = path.join(os.tmpdir(), `aic-cc-edits-${sessionId}`);
    let existing = "";
    try {
      existing = fs.readFileSync(trackingFile, "utf-8");
    } catch {
      // File doesn't exist yet
    }

    const files = new Set(existing.split("\n").filter(Boolean));
    files.add(filePath);
    fs.writeFileSync(trackingFile, [...files].join("\n") + "\n", "utf-8");
  } catch {
    // Non-fatal — never block tool execution
    process.exit(0);
  }
});
