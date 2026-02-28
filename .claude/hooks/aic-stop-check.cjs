// Claude Code hook — Stop
// When Claude finishes responding, runs ESLint + TypeScript type-check on
// files edited during this session. If errors are found, blocks stopping
// so Claude can fix them.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  raw += chunk;
});
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw);
    const sessionId = input.session_id || "default";

    // Prevent infinite loops: if the stop hook already fired, let Claude stop
    if (input.stop_hook_active) {
      process.exit(0);
      return;
    }

    const trackingFile = path.join(os.tmpdir(), `aic-cc-edits-${sessionId}`);
    if (!fs.existsSync(trackingFile)) {
      process.exit(0);
      return;
    }

    const files = fs
      .readFileSync(trackingFile, "utf-8")
      .split("\n")
      .filter((f) => f.endsWith(".ts"));

    if (files.length === 0) {
      cleanup(trackingFile);
      process.exit(0);
      return;
    }

    const errors = [];

    // ESLint on edited .ts files
    try {
      const fileArgs = files.map((f) => `"${f}"`).join(" ");
      execSync(`npx eslint --max-warnings 0 ${fileArgs}`, {
        cwd: projectRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30000,
      });
    } catch (e) {
      if (e.stdout) {
        errors.push(`ESLint errors:\n${e.stdout}`);
      }
    }

    // TypeScript type-check (project-wide)
    try {
      execSync("pnpm typecheck", {
        cwd: projectRoot,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 60000,
      });
    } catch (e) {
      if (e.stdout) {
        errors.push(`TypeScript errors:\n${e.stdout}`);
      }
    }

    cleanup(trackingFile);

    if (errors.length > 0) {
      process.stdout.write(
        JSON.stringify({
          decision: "block",
          reason: `Quality check found issues in files edited this session:\n\n${errors.join("\n\n")}\n\nFix these before finishing.`,
        }),
      );
    }
  } catch {
    // Non-fatal
    process.exit(0);
  }
});

function cleanup(trackingFile) {
  try {
    fs.unlinkSync(trackingFile);
  } catch {
    // ignore
  }
}
