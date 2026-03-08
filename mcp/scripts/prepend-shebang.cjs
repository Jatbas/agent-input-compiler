const path = require("node:path");
const fs = require("node:fs");

const targetPath = path.join(__dirname, "..", "dist", "server.js");
const shebang = "#!/usr/bin/env node\n";
const content = fs.readFileSync(targetPath, "utf8");
if (content.startsWith("#!")) {
  return;
}
fs.writeFileSync(targetPath, shebang + content, "utf8");
