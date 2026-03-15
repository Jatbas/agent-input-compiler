# Task 167: settings.json hook registrations

> **Status:** Pending
> **Phase:** T (Claude Code Hook-Based Delivery)
> **Layer:** integrations/claude
> **Depends on:** T02, T03, T04, T05, T06, T07, T08, T09

## Goal

Create the canonical `hooks` payload template for `~/.claude/settings.json` so the installer (U01) can deep-merge it at install time. All 8 hook events are registered with correct matchers, timeouts, and status messages; command paths use the `$HOME` placeholder for the installer to substitute with the resolved absolute path (VS Code extension does not expand `~`).

## Architecture Notes

- Reference: `documentation/claude-code-integration-layer.md` §10 (exact JSON structure).
- Commands must use absolute paths; template uses `$HOME` in command strings. U01 (separate task) substitutes `$HOME` with the actual path when merging into `~/.claude/settings.json`.
- Single static JSON file — no TypeScript, no new interfaces, no test file (verification is JSON.parse in a step).

## Files

| Action | Path                                          |
| ------ | --------------------------------------------- |
| Create | `integrations/claude/settings.json.template`   |

## Payload specification

The file contains a single JSON object. Top-level key `hooks`. Each event key maps to an array of one object with an inner `hooks` array. Inner hook entries: `type: "command"`, `command` string. Use `$HOME` (not `~`) in every command so the installer can substitute at merge time.

Event-to-script and options:

| Event           | Script                         | timeout | statusMessage                    | matcher    |
| --------------- | ------------------------------ | ------- | -------------------------------- | ---------- |
| SessionStart    | aic-session-start.cjs         | 30      | Compiling AIC project context... | —          |
| UserPromptSubmit| aic-prompt-compile.cjs        | 30      | Compiling intent-specific context... | —      |
| SubagentStart   | aic-subagent-inject.cjs       | 30      | Compiling subagent context...     | —          |
| PreCompact      | aic-pre-compact.cjs           | 30      | Compiling pre-compaction context... | —       |
| PostToolUse     | aic-after-file-edit-tracker.cjs | —     | —                                | Edit\|Write |
| Stop            | aic-stop-quality-check.cjs    | 60      | Running lint and typecheck...     | —          |
| PreToolUse      | aic-block-no-verify.cjs       | —       | —                                | Bash       |
| SessionEnd      | aic-session-end.cjs           | —       | —                                | —          |

Command format for each: `node "$HOME/.claude/hooks/<script>"`. Omit `timeout` and `statusMessage` for PostToolUse, PreToolUse, and SessionEnd inner hook objects.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create settings.json.template

Create `integrations/claude/settings.json.template` with the following content. The file must be valid JSON with exactly one top-level key `hooks`. Each event key (SessionStart, UserPromptSubmit, SubagentStart, PreCompact, PostToolUse, Stop, PreToolUse, SessionEnd) maps to an array of one object. That object has a key `hooks` (array of one object) and, for PostToolUse and PreToolUse only, a key `matcher` at the same level as `hooks`. Inner hook objects have `type: "command"` and `command: "node \"$HOME/.claude/hooks/<script>.cjs\""`. Include `timeout` and `statusMessage` only for SessionStart, UserPromptSubmit, SubagentStart, PreCompact, and Stop as specified in the Payload specification table.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-session-start.cjs\"",
            "timeout": 30,
            "statusMessage": "Compiling AIC project context..."
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-prompt-compile.cjs\"",
            "timeout": 30,
            "statusMessage": "Compiling intent-specific context..."
          }
        ]
      }
    ],
    "SubagentStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-subagent-inject.cjs\"",
            "timeout": 30,
            "statusMessage": "Compiling subagent context..."
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-pre-compact.cjs\"",
            "timeout": 30,
            "statusMessage": "Compiling pre-compaction context..."
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-after-file-edit-tracker.cjs\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-stop-quality-check.cjs\"",
            "timeout": 60,
            "statusMessage": "Running lint and typecheck..."
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-block-no-verify.cjs\""
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.claude/hooks/aic-session-end.cjs\""
          }
        ]
      }
    ]
  }
}
```

**Verify:** File exists at `integrations/claude/settings.json.template`.

### Step 2: Verify valid JSON

Run from repository root:

`node -e "JSON.parse(require('fs').readFileSync('integrations/claude/settings.json.template','utf8')); process.exit(0);"`

Expected: exit code 0, no output.

**Verify:** template_valid_json — command exits 0.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case     | Description                                      |
| ------------- | ------------------------------------------------ |
| template_valid_json | Step 2: JSON.parse of template file succeeds |

## Acceptance Criteria

- [ ] File `integrations/claude/settings.json.template` created with content per Step 1
- [ ] Template parses as valid JSON (Step 2 passes)
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] All 8 events present: SessionStart, UserPromptSubmit, SubagentStart, PreCompact, PostToolUse, Stop, PreToolUse, SessionEnd
- [ ] PostToolUse has matcher "Edit|Write"; PreToolUse has matcher "Bash"
- [ ] Every command uses `$HOME` (not `~`) in the path

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
