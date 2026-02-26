/**
 * Cursor hook — stop
 *
 * On session stop, if files were edited during this conversation:
 * 1. Reads the list of edited files from record-edit tracking file
 * 2. Runs ESLint + TypeScript type-check on those files
 * 3. Reports failures as a followup_message so the AI can fix them
 *
 * Usage: node stop-check.js <conversationId>
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const conversationId = process.argv[2] || "default";
const trackingFile = path.join(__dirname, `.edited-files-${conversationId}`);

try {
  if (!fs.existsSync(trackingFile)) {
    process.exit(0);
  }

  const files = fs
    .readFileSync(trackingFile, "utf-8")
    .split("\n")
    .filter((f) => f.endsWith(".ts"));

  if (files.length === 0) {
    cleanup();
    process.exit(0);
  }

  const errors = [];

  // ESLint on edited .ts files
  try {
    const fileArgs = files.join(" ");
    execSync(`npx eslint --max-warnings 0 ${fileArgs}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    });
  } catch (e) {
    if (e.stdout) {
      errors.push(`ESLint errors:\n${e.stdout}`);
    }
  }

  // TypeScript type-check (project-wide, as TS needs full context)
  try {
    execSync("pnpm typecheck", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
    });
  } catch (e) {
    if (e.stdout) {
      errors.push(`TypeScript errors:\n${e.stdout}`);
    }
  }

  cleanup();

  if (errors.length > 0) {
    const output = JSON.stringify({
      followup_message: `Pre-stop check found issues in files edited this session:\n\n${errors.join("\n\n")}`,
    });
    process.stdout.write(output);
  }
} catch {
  cleanup();
  process.exit(0);
}

function cleanup() {
  try {
    fs.unlinkSync(trackingFile);
  } catch {
    // ignore
  }
}
