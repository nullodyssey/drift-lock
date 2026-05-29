---
name: drift-cm
description: Compile anti-drift task context and route work before an AI-assisted change. Use when the user invokes $drift-cm, starts from a product prompt, enters an unfamiliar codebase, or needs relevant Drift Contracts, SSOTs, locked constraints, conflicts, next role, and required proof before planning.
---

# Drift CM

Use this skill at the cadrage phase, before planning or editing. The LLM-drift risk is that the agent understands the request outside the local product intent, ignores locked contracts, chooses the wrong files, or misses a required product decision.

The goal is to turn DriftLock context into a compact routing decision: what is constrained, what may drift, which role should act next, and what proof must exist after the change.

## Workflow

1. If the work starts from a product/user prompt, run or recommend `{{DRIFT_COMMAND}} context --task "<user prompt>"` before planning.
2. Identify likely target files, SSOT files, and critical surfaces from the request and context output.
3. For known critical files, run or recommend `{{DRIFT_COMMAND}} context <file>`.
4. Extract contract ids, stability, intents, SSOTs, enforced invariants, and `llm.must_not_change` items.
5. Detect conflicts between the request and locked constraints. Call out missing proof instead of guessing.
6. If the task may touch uncovered critical files or adoption state matters, run or recommend `{{DRIFT_COMMAND}} coverage`.
7. If existing failures are mentioned or likely, run or recommend `{{DRIFT_COMMAND}} explain` or `{{DRIFT_COMMAND}} explain <contract-id>`.
8. Choose the next role: `$drift-dev`, `$drift-analyst`, `$drift-architect`, `$drift-tech-writer`, or `$drift-ux-designer`.
9. List the required proof commands for the handoff, including `{{DRIFT_COMMAND}} diff --summary`, `{{DRIFT_COMMAND}} check --changed`, or `{{DRIFT_COMMAND}} proof --git-base <ref>` when relevant.

## Commands

Use the configured Drift command prefix:

```txt
{{DRIFT_COMMAND}}
```

Build concrete Drift commands by appending the subcommand, for example `{{DRIFT_COMMAND}} context --task "<user prompt>"`, `{{DRIFT_COMMAND}} context <file>`, `{{DRIFT_COMMAND}} coverage`, `{{DRIFT_COMMAND}} diff --summary`, `{{DRIFT_COMMAND}} check --changed`, `{{DRIFT_COMMAND}} explain <contract-id>`, or `{{DRIFT_COMMAND}} proof --git-base <ref>`.

For non-Drift checks, inspect the target project's scripts first and only recommend commands that exist in that project.

## Rules

```txt
- Do not treat absence of a contract as proof that a change is safe.
- Do not route to implementation when a locked contract conflict needs product confirmation.
- Do not invent checks, scripts, or enforcement that the project does not expose.
- Keep the context compact enough for the next agent to use directly.
```

## Output

Return a compact `Task Context` with:

```txt
Task:
Relevant contracts:
Locked constraints:
SSOT:
Potential conflicts:
Recommended next role:
Required proof:
Required checks:
```

Read `references/checklist.md` for the required context checklist and `references/output-format.md` for the expected response shape.
Read `references/examples.md` when the user asks for examples, adoption guidance, or greenfield/brownfield workflows.
