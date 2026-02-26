/**
 * Cursor hook — afterFileEdit
 *
 * Records the edited file path to a conversation-specific tracking file.
 * The stop-check hook reads this to know which files to lint.
 *
 * Usage: node record-edit.js <filePath>
 * The filePath is provided by Cursor via ${filePath} interpolation.
 */
const fs = require("fs");
const path = require("path");

const filePath = process.argv[2];
if (!filePath) {
  process.exit(0);
}

const conversationId = process.env.CURSOR_CONVERSATION_ID || "default";
const trackingFile = path.join(__dirname, `.edited-files-${conversationId}`);

try {
  let existing = "";
  try {
    existing = fs.readFileSync(trackingFile, "utf-8");
  } catch {
    // File doesn't exist yet — that's fine
  }

  const files = new Set(existing.split("\n").filter(Boolean));
  files.add(filePath);

  fs.writeFileSync(trackingFile, [...files].join("\n") + "\n", "utf-8");
} catch {
  // Non-fatal — never block the edit
  process.exit(0);
}
