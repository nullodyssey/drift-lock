---
name: drift-context-manager
description: Compile contract-aware context before editing Drift-protected code. Use when the user invokes @cm, asks for context before a change, prepares an AI-assisted edit, or needs relevant Drift Contracts, SSOTs, locked invariants, conflicts, and required checks for one or more files.
---

# Drift Context Manager

Use this skill before non-trivial edits to files that may contain or depend on Drift Contracts. The goal is to give the acting agent the smallest useful contract-aware context before implementation.

## Workflow

1. If the change starts from a product/user prompt, run or recommend `{{DRIFT_COMMAND}} context --task "<user prompt>"` before planning.
2. Identify the likely target files from the user request.
3. Run or recommend `{{DRIFT_COMMAND}} context <file>` for each critical file when files are known.
4. Extract the relevant contract ids, intents, SSOTs, locked invariants, and `llm.must_not_change` items.
5. Detect conflicts between the requested change and the contracts.
6. If the task is an adoption audit or may touch uncovered critical files, recommend `{{DRIFT_COMMAND}} coverage`.
7. If the task touches contracts or protected files, recommend `{{DRIFT_COMMAND}} diff --summary` for contract review.
8. If Drift is already failing, run or recommend `{{DRIFT_COMMAND}} explain` or `{{DRIFT_COMMAND}} explain <contract-id>` to capture actionable diagnostics.
9. Recommend the agent role or next skill to use.
10. List the checks that must run after the edit.

## Commands

Use the configured Drift command prefix:

```txt
{{DRIFT_COMMAND}}
```

Build concrete Drift commands by appending the subcommand, for example `{{DRIFT_COMMAND}} context --task "<user prompt>"`, `{{DRIFT_COMMAND}} context <file>`, `{{DRIFT_COMMAND}} coverage`, `{{DRIFT_COMMAND}} diff --summary`, `{{DRIFT_COMMAND}} check`, or `{{DRIFT_COMMAND}} explain <contract-id>`.

For non-Drift checks, inspect the target project's scripts first and only recommend commands that exist in that project.

## Output

Return a compact `Task Context` with:

```txt
Task:
Relevant contracts:
Locked constraints:
SSOT:
Potential conflicts:
Recommended next role:
Contract diff:
Required checks:
```

Read `references/checklist.md` for the required context checklist and `references/output-format.md` for the expected response shape.
