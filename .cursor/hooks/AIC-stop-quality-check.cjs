// stop hook — runs eslint and tsc on edited files from afterFileEdit temp file;
// if either fails, returns followup_message so Cursor auto-submits a fix request.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

function readStdinSync() {
  const chunks = [];
  let size = 0;
  const buf = Buffer.alloc(64 * 1024);
  let n;
  while ((n = fs.readSync(0, buf, 0, buf.length, null)) > 0) {
    chunks.push(buf.slice(0, n));
    size += n;
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

function getTempPath(key) {
  return path.join(
    os.tmpdir(),
    "aic-edited-files-" + String(key).replace(/[^a-zA-Z0-9_-]/g, "_") + ".json",
  );
}

function runEslint(paths) {
  if (paths.length === 0) return { exitCode: 0, stderr: "" };
  try {
    execSync("npx", ["eslint", "--max-warnings", "0", "--", ...paths], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, stderr: "" };
  } catch (err) {
    const stderr = (err.stderr ?? err.message ?? "").toString();
    return { exitCode: err.status ?? 1, stderr };
  }
}

function runTsc() {
  const tsconfig = path.join(process.cwd(), "tsconfig.json");
  if (!fs.existsSync(tsconfig)) return { exitCode: 0, stderr: "" };
  try {
    execSync("npx", ["tsc", "--noEmit"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    });
    return { exitCode: 0, stderr: "" };
  } catch (err) {
    const stderr = (err.stderr ?? err.message ?? "").toString();
    return { exitCode: err.status ?? 1, stderr };
  }
}

try {
  const raw = readStdinSync();
  const input = raw.trim() ? JSON.parse(raw) : {};
  const key =
    input.conversation_id ??
    input.conversationId ??
    input.session_id ??
    input.sessionId ??
    process.env.AIC_CONVERSATION_ID ??
    "default";
  const tmpPath = getTempPath(key);
  if (!fs.existsSync(tmpPath)) {
    process.stdout.write("{}");
    process.exit(0);
  }
  let paths = [];
  try {
    const data = JSON.parse(fs.readFileSync(tmpPath, "utf8"));
    paths = Array.isArray(data) ? data : [];
  } catch {
    process.stdout.write("{}");
    process.exit(0);
  }
  paths = paths.filter((p) => typeof p === "string" && fs.existsSync(p));
  if (paths.length === 0) {
    process.stdout.write("{}");
    process.exit(0);
  }
  const eslintResult = runEslint(paths);
  const tscResult = runTsc();
  if (eslintResult.exitCode !== 0 || tscResult.exitCode !== 0) {
    const parts = [];
    if (eslintResult.exitCode !== 0) parts.push("lint");
    if (tscResult.exitCode !== 0) parts.push("typecheck");
    const msg =
      "Fix " +
      parts.join(" and ") +
      " errors on the files you edited. Run pnpm lint and pnpm typecheck.";
    process.stdout.write(JSON.stringify({ followup_message: msg }));
  } else {
    process.stdout.write("{}");
  }
} catch {
  process.stdout.write("{}");
}
process.exit(0);
