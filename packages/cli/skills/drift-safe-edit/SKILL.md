---
name: drift-safe-edit
description: Edit Drift-protected code while preserving local contracts. Use when the user invokes @dev, asks to modify code governed by Drift Contracts, fixes a drift violation, changes critical server actions, or needs implementation that respects locked contracts, SSOTs, and required checks.
---

# Drift Safe Edit

Use this skill when implementing changes in or around files protected by Drift Contracts. The goal is to make the smallest correct edit without silently changing contracts or bypassing SSOT rules.

## Workflow

1. Read Drift context before editing, or ask `@cm` for it if missing.
2. Identify locked contracts, SSOTs, and invariants that constrain the change.
3. Edit code without changing locked contracts unless the user explicitly requested a contract change.
4. If the request conflicts with a locked contract, stop and report the conflict.
5. Run the required checks after editing.
6. Report changed files and verification results.

## Commands

Use the configured Drift command prefix:

```txt
{{DRIFT_COMMAND}}
```

Build concrete Drift commands by appending the subcommand, for example `{{DRIFT_COMMAND}} context <file>` or `{{DRIFT_COMMAND}} check`.

For non-Drift checks, inspect the target project's scripts first and only run commands that exist in that project.

## Rules

```txt
- Do not remove or weaken @drift contracts to make checks pass.
- Do not inline values that must come from an SSOT.
- Do not bypass drift/ssot-flow by mentioning the SSOT without deriving the sink from it.
- Keep edits tightly scoped to the requested behavior.
```

Read `references/pre-edit-checklist.md` before editing and `references/post-edit-checklist.md` before final response.
