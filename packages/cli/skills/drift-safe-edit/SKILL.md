---
name: drift-safe-edit
description: Edit Drift-protected code while preserving local contracts. Use when the user invokes @dev, asks to modify code governed by Drift Contracts, fixes a drift violation, changes critical server actions, or needs implementation that respects locked contracts, SSOTs, and required checks.
---

# Drift Safe Edit

Use this skill when implementing changes in or around files protected by Drift Contracts. The goal is to make the smallest correct edit without silently changing contracts or bypassing SSOT rules.

## Workflow

1. If the change starts from a product/user prompt, read `{{DRIFT_COMMAND}} context --task "<user prompt>"` before planning or ask `@cm` for it.
2. Read `{{DRIFT_COMMAND}} context <file>` before editing known target files.
3. Identify locked contracts, SSOTs, and invariants that constrain the change.
4. Edit code without changing locked contracts unless the user explicitly requested a contract change.
5. If the request conflicts with a locked contract, stop and report the conflict.
6. If contracted files changed, run or report `{{DRIFT_COMMAND}} diff --summary` before accepting or finalizing contract changes.
7. Run the required checks after editing.
8. If Drift checks fail, run or report `{{DRIFT_COMMAND}} explain` or `{{DRIFT_COMMAND}} explain <contract-id>` before proposing a fix.
9. Report changed files, contract diff summary, Drift explanations, and verification results.

## Commands

Use the configured Drift command prefix:

```txt
{{DRIFT_COMMAND}}
```

Build concrete Drift commands by appending the subcommand, for example `{{DRIFT_COMMAND}} context --task "<user prompt>"`, `{{DRIFT_COMMAND}} context <file>`, `{{DRIFT_COMMAND}} coverage`, `{{DRIFT_COMMAND}} diff --summary`, `{{DRIFT_COMMAND}} check`, or `{{DRIFT_COMMAND}} explain <contract-id>`.

For non-Drift checks, inspect the target project's scripts first and only run commands that exist in that project.

## Rules

```txt
- Do not remove or weaken @drift contracts to make checks pass.
- Do not inline values that must come from an SSOT.
- Do not bypass drift/ssot-flow by mentioning the SSOT without deriving the sink from it.
- Keep edits tightly scoped to the requested behavior.
```

Read `references/pre-edit-checklist.md` before editing and `references/post-edit-checklist.md` before final response.
