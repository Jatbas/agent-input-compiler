---
name: aic-systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior — before proposing fixes.
---

# Systematic Debugging

## Purpose

Find root causes before attempting fixes. Random fixes waste time, mask underlying issues, and create new bugs. This skill enforces a phased investigation process that prevents the most common debugging failure: guessing.

**Announce at start:** "Using the systematic-debugging skill."

## Editors

- **Cursor:** Attach the skill with `@` or invoke via `/`.
- **Claude Code:** Invoke with `/aic-systematic-debugging`.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you have not completed Phase 1, you cannot propose fixes. No exceptions.

## When to Use

Use for ANY technical issue:

- Test failures
- Bugs in production or development
- Unexpected behavior
- Performance problems
- Build or compilation failures
- Integration issues
- Lint or type errors that resist straightforward fixes

**Use this ESPECIALLY when:**

- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You have already tried a fix and it did not work
- You do not fully understand the issue

## The Four Phases

Complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**Before attempting ANY fix:**

**1. Read error messages carefully.**

- Do not skip past errors or warnings — they often contain the exact solution
- Read stack traces completely, noting line numbers, file paths, error codes
- Read the FULL output, not just the first line

**2. Reproduce consistently.**

- Can you trigger it reliably? What are the exact steps?
- If not reproducible, gather more data — do not guess

**3. Check recent changes.**

- What changed that could cause this? `git diff`, recent commits, new dependencies, config changes
- Environmental differences between working and broken states

**4. Gather evidence in multi-component systems.**

When the system has multiple components (pipeline step → storage → adapter, MCP handler → core → database):

Before proposing fixes, add diagnostic instrumentation at EACH component boundary:

- Log what data enters the component
- Log what data exits the component
- Verify environment/config propagation
- Check state at each layer

Run once to gather evidence showing WHERE it breaks. THEN analyze evidence to identify the failing component. THEN investigate that specific component.

**5. Trace data flow.**

When the error is deep in a call stack:

- Where does the bad value originate?
- What called this function with the bad value?
- Keep tracing backward until you find the source
- Fix at the source, not at the symptom

### Phase 2: Pattern Analysis

Find the pattern before fixing:

**1. Find working examples.** Locate similar working code in the same codebase. What works that is similar to what is broken?

**2. Compare against references.** If implementing a pattern, read the reference implementation COMPLETELY. Do not skim — read every line. Understand the pattern fully before applying.

**3. Identify differences.** What is different between working and broken? List every difference, however small. Do not assume "that cannot matter."

**4. Understand dependencies.** What other components does this need? What settings, config, environment? What assumptions does it make?

### Phase 3: Hypothesis and Testing

Scientific method:

**1. Form a single hypothesis.** State clearly: "I think X is the root cause because Y." Be specific, not vague.

**2. Test minimally.** Make the SMALLEST possible change to test the hypothesis. One variable at a time. Do not fix multiple things at once.

**3. Verify before continuing.** Did it work? Yes → Phase 4. Did not work? Form a NEW hypothesis. Do NOT add more fixes on top.

**4. When you do not know.** Say "I do not understand X." Do not pretend to know. Ask for help. Research more.

### Phase 4: Implementation

Fix the root cause, not the symptom:

**1. Create a failing test case.** Simplest possible reproduction. Automated test if possible. MUST have before fixing.

**2. Implement a single fix.** Address the root cause identified. ONE change at a time. No "while I am here" improvements. No bundled refactoring.

**3. Verify the fix.** Test passes now? No other tests broken? Issue actually resolved? Use fresh verification evidence — do not rely on "should work now."

**4. If the fix does not work:** STOP. Count: how many fixes have you tried?

- If fewer than 3: return to Phase 1, re-analyze with new information
- **If 3 or more: STOP and question the architecture (step 5 below)**
- Do NOT attempt fix #4 without the architectural discussion

**5. If 3+ fixes failed: question the architecture.**

Patterns indicating an architectural problem:

- Each fix reveals new shared state, coupling, or problems in different places
- Fixes require "massive refactoring" to implement
- Each fix creates new symptoms elsewhere

STOP and question fundamentals:

- Is this pattern fundamentally sound?
- Are we sticking with it through sheer inertia?
- Should we refactor the architecture vs. continue fixing symptoms?

**Discuss with the user before attempting more fixes.** This is NOT a failed hypothesis — this is a wrong architecture.

## Red Flags — STOP and Follow Process

If you catch yourself thinking:

| Thought                                                | Reality                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| "Quick fix for now, investigate later"                 | Investigation IS the quick path. Guessing is the slow path.          |
| "Just try changing X and see if it works"              | That is guessing, not debugging. Return to Phase 1.                  |
| "Add multiple changes, run tests"                      | Cannot isolate what worked. Causes new bugs.                         |
| "Skip the test, I will manually verify"                | Manual verification proves nothing permanently.                      |
| "It is probably X, let me fix that"                    | "Probably" means you have not investigated. Phase 1.                 |
| "I do not fully understand but this might work"        | Stop. Understand first.                                              |
| "One more fix attempt" (after 2+ failures)             | 3+ failures = architectural problem. Question the pattern.           |
| "Each fix reveals a new problem elsewhere"             | Architecture is wrong. Stop fixing symptoms.                         |
| "Here are the main problems: [list of fixes]"          | You proposed solutions without investigation. Phase 1.               |
| "The issue is simple, no need for process"             | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process"                       | Systematic debugging is FASTER than guess-and-check thrashing.       |
| "I will write the test after confirming the fix works" | Untested fixes do not stick. Test first proves it catches the bug.   |

**ALL of these mean: STOP. Return to Phase 1.**

## AIC-Specific Debugging Patterns

These patterns are specific to the AIC codebase architecture:

**Pipeline issues:** Trace data through each pipeline step. Pipeline steps never mutate inputs — if a value is wrong after a step, the step returned a bad new object, not mutated an old one. Check the step's return value, not the input.

**Storage issues:** All SQL lives in `shared/src/storage/`. If data is wrong in the database, the bug is in the storage layer, not in core or pipeline. Check the SQL query, bound parameters, and migration state.

**Adapter issues:** Each external library has exactly ONE adapter. If an external library behaves unexpectedly, the bug is in the adapter wrapping, not in core code. Read the adapter file and the library's actual API.

**Clock/determinism issues:** No `Date.now()`, `new Date()`, or `Math.random()` anywhere except `system-clock.ts`. If timestamps are wrong, check whether the `Clock` interface is being injected and used correctly.

**Branded type issues:** If a type error involves branded types, the fix is almost never a type cast. Check whether the correct factory function is being used and whether the value genuinely has the right semantics.

**Hexagonal boundary issues:** Core and pipeline have zero imports from adapters, storage, or external packages. If you see a dependency direction violation, the architecture needs restructuring — do not fix with imports.

## Quick Reference

| Phase             | Key Activities                                                          | Success Criteria                             |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| 1. Root Cause     | Read errors, reproduce, check changes, gather evidence, trace data flow | Understand WHAT and WHERE                    |
| 2. Pattern        | Find working examples, compare, identify differences                    | Understand WHY                               |
| 3. Hypothesis     | Form theory, test minimally, verify                                     | Confirmed hypothesis or new hypothesis       |
| 4. Implementation | Create failing test, fix root cause, verify                             | Bug resolved, all tests pass, no regressions |

## Verification Checklist

Before declaring a bug fixed:

- [ ] Root cause identified and understood (not just symptoms)
- [ ] Failing test exists that reproduces the bug
- [ ] Test failed before the fix (red)
- [ ] Test passes after the fix (green)
- [ ] All other tests still pass
- [ ] Fix addresses the root cause, not a symptom
- [ ] No "while I am here" changes bundled with the fix
- [ ] Fresh verification evidence — ran the command, read the output, THEN claimed success

## Integration

**Related skills:**

- **aic-task-executor** — If debugging during task execution, the executor's blocked handling applies after this skill's Phase 4 circuit breaker fires.
- **aic-researcher** — For bugs that require understanding external system behavior, the researcher skill's runtime evidence mandate applies.

**Architectural rules:**

- All AIC architectural invariants from `.cursor/rules/AIC-architect.mdc` remain in force during debugging. Do not bypass rules to "quickly fix" something.
