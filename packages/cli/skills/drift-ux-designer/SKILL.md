---
name: drift-ux-designer
description: Formalize critical UX guarantees as Drift-aware constraints without introducing LLM-drift. Use when the user invokes $drift-ux-designer, works on important UI flows, product vocabulary, action hierarchy, UI states, accessibility expectations, destructive actions, or user-facing behavior that should remain stable across AI-assisted changes.
---

# Drift UX Designer

Use this skill before implementing or documenting critical user experience changes. The LLM-drift risk is that the agent changes product vocabulary, removes a critical state, weakens a destructive-action guard, or treats a design preference as an enforced guarantee.

The goal is to separate UX preferences from UX guarantees and produce a contract-ready brief that `drift-dev` or `drift-tech-writer` can use safely.

## Workflow

1. Read the local product context, existing UI code, and relevant Drift contracts before proposing constraints.
2. If the work starts from a user prompt, run or recommend `{{DRIFT_COMMAND}} context --task "<user prompt>"`.
3. For known critical UI files, run or recommend `{{DRIFT_COMMAND}} context <file>`.
4. Identify critical states: empty, loading, error, success, disabled, confirmation, and destructive flows.
5. Separate stable product vocabulary, action hierarchy, accessibility expectations, and SSOT-backed display rules from non-contract design preferences.
6. Propose only constraints that are specific enough to verify or review.
7. Recommend files, components, contracts, or docs that should carry the UX guarantee.
8. Route implementation to `$drift-dev` and documentation to `$drift-tech-writer`.
9. End with critical states, stable vocabulary, action hierarchy, accessibility expectations, suggested contracts, and non-contract preferences.

## Commands

Use the configured Drift command prefix:

```txt
{{DRIFT_COMMAND}}
```

Build concrete Drift commands by appending the subcommand, for example `{{DRIFT_COMMAND}} context --task "<user prompt>"`, `{{DRIFT_COMMAND}} context <file>`, `{{DRIFT_COMMAND}} coverage`, `{{DRIFT_COMMAND}} diff --summary`, `{{DRIFT_COMMAND}} check --changed`, or `{{DRIFT_COMMAND}} proof --git-base <ref>`.

For non-Drift checks, inspect the target project's scripts first and only recommend commands that exist in that project.

## Rules

```txt
- Do not present visual taste as a locked UX guarantee.
- Do not invent accessibility or interaction guarantees that are not implemented or planned.
- Do not change product vocabulary without calling out contract and documentation impact.
- Do not route to implementation when the UX guarantee is still ambiguous.
- Keep suggested contracts reviewable by a developer.
```

## Output

Return a `UX Contract Brief` with:

```txt
Critical states:
Stable vocabulary:
Action hierarchy:
Accessibility expectations:
Suggested contracts:
Non-contract preferences:
Recommended next role:
```

Read `references/checklist.md` before proposing constraints and `references/output-format.md` before the final response.
