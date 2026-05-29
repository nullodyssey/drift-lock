---
name: drift-tech-writer
description: Align documentation with implemented DriftLock behavior without introducing LLM-drift. Use when the user invokes $drift-tech-writer, updates README files, docs, guides, command docs, diagnostics, contract guarantees, agent-facing docs, or CI-facing documentation that must match code, tests, contracts, and checks.
---

# Drift Tech Writer

Use this skill during documentation work. The LLM-drift risk is that the agent documents a guarantee that is not implemented, turns contextual intent into enforcement, hides a check limitation, or publishes command examples that do not exist.

The goal is to document only what can be verified from code, tests, Drift contracts, diagnostics, package scripts, or checked command behavior.

## Workflow

1. Read the implementation, tests, contracts, diagnostics, or package scripts before editing documentation.
2. If documentation starts from a product/user prompt, run or recommend `{{DRIFT_COMMAND}} context --task "<user prompt>"` before deciding what can be claimed.
3. For documented critical files or commands, run or recommend `{{DRIFT_COMMAND}} context <file>` and inspect the relevant source.
4. Separate verified guarantees from contextual intent, future direction, and unsupported assumptions.
5. Update documentation with factual wording that does not overpromise enforcement.
6. Link or mention Drift commands that prove the claim, such as `{{DRIFT_COMMAND}} check`, `{{DRIFT_COMMAND}} coverage`, `{{DRIFT_COMMAND}} diff --summary`, or `{{DRIFT_COMMAND}} explain <contract-id>`.
7. Verify examples against existing scripts, CLI options, exported APIs, and diagnostics before including them.
8. If a doc change describes an intentional locked contract change, request or prepare explicit acceptance instead of presenting the change as routine.
9. End with the docs changed, claims verified, ambiguous or future claims, and checks run or not run.

## Commands

Use the configured Drift command prefix:

```txt
{{DRIFT_COMMAND}}
```

Build concrete Drift commands by appending the subcommand, for example `{{DRIFT_COMMAND}} context --task "<user prompt>"`, `{{DRIFT_COMMAND}} context <file>`, `{{DRIFT_COMMAND}} check`, `{{DRIFT_COMMAND}} coverage`, `{{DRIFT_COMMAND}} diff --summary`, `{{DRIFT_COMMAND}} explain <contract-id>`, or `{{DRIFT_COMMAND}} proof --git-base <ref>`.

For non-Drift checks, inspect the target project's scripts first and only run commands that exist in that project.

## Rules

```txt
- Do not document unavailable commands, options, diagnostics, or APIs as current.
- Do not describe contextual intent as enforced behavior.
- Do not hide limitations of ssot-flow, coverage, explain, proof, or other checks.
- Do not change docs to justify accidental drift.
- Prefer narrow factual edits over broad marketing language.
```

## Output

Return a `Docs Handoff` with:

```txt
Updated files:
Verified claims:
Ambiguous or future claims:
Contract impact:
Checks:
Remaining doc risks:
```

Read `references/checklist.md` before editing documentation and `references/output-format.md` before the final response.
Read `references/examples.md` when the user asks for examples, adoption guidance, or greenfield/brownfield workflows.
