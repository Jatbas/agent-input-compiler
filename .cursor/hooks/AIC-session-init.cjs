// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

/**
 * Cursor hook — sessionStart
 *
 * Reads the "Critical reminders" section from AIC-architect.mdc and injects
 * the bullet points as additional_context so the AI always has the
 * non-negotiable architectural invariants, even when specific rules aren't
 * included in context.
 */
const fs = require("fs");
const path = require("path");

let hookInput = {};
try {
  const raw = fs.readFileSync(0, "utf8");
  if (raw && raw.trim()) hookInput = JSON.parse(raw);
} catch {
  // Non-fatal — proceed without session_id
}

const sessionId = hookInput.session_id || "";

const ROUTER_PATH = path.join(__dirname, "..", "rules", "AIC-architect.mdc");
const SECTION_START = "## Critical reminders";
const SECTION_END = "## "; // next h2

try {
  const content = fs.readFileSync(ROUTER_PATH, "utf-8");
  const startIdx = content.indexOf(SECTION_START);
  if (startIdx === -1) {
    process.exit(0);
  }

  const afterStart = content.slice(startIdx + SECTION_START.length);
  const endIdx = afterStart.indexOf(SECTION_END);
  const section = endIdx === -1 ? afterStart.trim() : afterStart.slice(0, endIdx).trim();

  const bullets = section
    .split("\n")
    .filter((line) => line.startsWith("- **"))
    .map((line) => line.trim())
    .join("\n");

  if (bullets.length > 0) {
    const conversationLine = sessionId ? `\nAIC_CONVERSATION_ID=${sessionId}` : "";
    const output = JSON.stringify({
      additional_context: `AIC Architectural Invariants (auto-injected):${conversationLine}\n${bullets}`,
    });
    process.stdout.write(output);
  }
} catch {
  // Non-fatal — hook must never block the session
  process.exit(0);
}
