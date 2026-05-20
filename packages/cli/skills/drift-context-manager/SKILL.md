---
name: drift-context-manager
description: Compile contract-aware context before editing Drift-protected code. Use when the user invokes @cm, asks for context before a change, prepares an AI-assisted edit, or needs relevant Drift Contracts, SSOTs, locked invariants, conflicts, and required checks for one or more files.
---

# Drift Context Manager

Use this skill before non-trivial edits to files that may contain or depend on Drift Contracts. The goal is to give the acting agent the smallest useful contract-aware context before implementation.

## Workflow

1. Identify the likely target files from the user request.
2. Run or recommend `{{DRIFT_COMMAND}} context <file>` for each critical file.
3. Extract the relevant contract ids, intents, SSOTs, locked invariants, and `llm.must_not_change` items.
4. Detect conflicts between the requested change and the contracts.
5. Recommend the agent role or next skill to use.
6. List the checks that must run after the edit.

## Commands

Use the configured Drift command prefix:

```txt
{{DRIFT_COMMAND}}
```

Build concrete Drift commands by appending the subcommand, for example `{{DRIFT_COMMAND}} context <file>` or `{{DRIFT_COMMAND}} check`.

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
Required checks:
```

Read `references/checklist.md` for the required context checklist and `references/output-format.md` for the expected response shape.
