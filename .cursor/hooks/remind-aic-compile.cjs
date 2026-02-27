// Cursor hook — afterFileEdit
// Injects a reminder to call aic_compile via additional_context.
// Fires on every file edit, giving the model a fresh system-level nudge.
const output = JSON.stringify({
  additional_context:
    "REMINDER: Call aic_compile with the user's intent BEFORE your next response. " +
    "You edited a file — the codebase changed. Fresh context is needed.",
});
process.stdout.write(output);
