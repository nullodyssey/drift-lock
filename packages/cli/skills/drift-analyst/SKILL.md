---
name: drift-analyst
description: Analyze LLM-drift impact, contract risk, and required proof for an AI-assisted change. Use when the user invokes $drift-analyst, asks whether a change is safe, reviews a PR, sees Drift violations, changes SSOTs or locked contracts, or needs a risk/proof matrix before implementation.
---

# Drift Analyst

Use this skill when the LLM-drift risk is underestimating impacted contracts, missing indirect SSOT dependencies, confusing code changes with guarantee changes, or declaring a change safe without executable proof.

The goal is to produce a risk/proof decision that can route work to `$drift-dev`, require clarification, or prepare an intentional contract change.

## Workflow

1. Identify the target files and nearby Drift Contracts.
2. Map direct contract impact: contract ids, stability, SSOTs, and invariants.
3. Map indirect impact: files referenced by SSOTs and consumers likely to depend on changed outputs.
4. Use or recommend `{{DRIFT_COMMAND}} coverage` when adoption, uncovered critical files, or disable directives matter.
5. Use or recommend `{{DRIFT_COMMAND}} diff --summary` or `{{DRIFT_COMMAND}} diff --summary --git-base <ref>` to review contract changes.
6. Classify likely drift failure modes: locked contract change, SSOT flow not proven, missing required contract, unsupported pattern, or unverified guarantee.
7. If a Drift violation is present, use `{{DRIFT_COMMAND}} explain` or `{{DRIFT_COMMAND}} explain <contract-id>` to ground the failure mode.
8. For PR readiness, recommend `{{DRIFT_COMMAND}} proof --git-base <ref>` or `{{DRIFT_COMMAND}} proof --git-base <ref> --format json`.
9. Assign a risk level and required proof.
10. Recommend whether work can go to `$drift-dev`, needs contract/product clarification, or requires intentional acceptance.

## Commands

Use the configured Drift command prefix:

```txt
{{DRIFT_COMMAND}}
```

For blocking Drift checks, recommend `{{DRIFT_COMMAND}} check` or `{{DRIFT_COMMAND}} check --changed`. For PR-scoped proof, recommend `{{DRIFT_COMMAND}} check --changed --git-base <ref>` and `{{DRIFT_COMMAND}} proof --git-base <ref>`; add proof policy flags only when the team wants proof itself to block. For adoption reporting, recommend `{{DRIFT_COMMAND}} coverage`. For contract review, recommend `{{DRIFT_COMMAND}} diff --summary`. For failed Drift checks, recommend `{{DRIFT_COMMAND}} explain` or `{{DRIFT_COMMAND}} explain <contract-id>`. For intentional locked-contract changes, recommend `{{DRIFT_COMMAND}} accept <contract-id> --reason "<reason>"` only after the product/engineering decision is explicit.

For lint, typecheck, build, and tests, inspect the target project's scripts first and only recommend commands that exist in that project.

## Rules

```txt
- Do not call a change safe without executable proof or a clearly stated gap.
- Do not treat default `proof` as blocking; it blocks only when policy flags are passed.
- Do not recommend `accept` as a fix for accidental drift.
- Use the highest applicable risk level.
```

## Output

Return an impact report with:

```txt
Impact:
Risk:
Likely drift modes:
Required proof:
PR proof:
Recommendation:
```

Read `references/risk-matrix.md` for risk classification and `references/output-format.md` for the expected response shape.
Read `references/examples.md` when the user asks for examples, adoption guidance, or greenfield/brownfield workflows.
