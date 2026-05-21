---
name: drift-impact-analysis
description: Analyze the drift impact and contract risk of a proposed code change. Use when the user invokes @analyst, asks what may break, asks whether a change is safe, or needs impacted Drift Contracts, SSOTs, invariants, risk level, and required proof before editing.
---

# Drift Impact Analysis

Use this skill before implementation when the change may affect contracted code, SSOT files, locked contracts, or critical behavior.

## Workflow

1. Identify the target files and nearby Drift Contracts.
2. Map direct contract impact: contract ids, stability, SSOTs, and invariants.
3. Map indirect impact: files referenced by SSOTs and consumers likely to depend on changed outputs.
4. Use or recommend `{{DRIFT_COMMAND}} diff --summary` to review contract changes when a baseline exists.
5. Classify likely drift failure modes: `DRIFT010`, `DRIFT011`, `DRIFT013`, `DRIFT014`.
6. If a Drift violation is present, use `{{DRIFT_COMMAND}} explain` or `{{DRIFT_COMMAND}} explain <contract-id>` to ground the failure mode.
7. Assign a risk level and required proof.
8. Recommend whether the work can go to `@dev` or needs product/contract clarification first.

## Commands

Use the configured Drift command prefix:

```txt
{{DRIFT_COMMAND}}
```

For Drift proof, recommend `{{DRIFT_COMMAND}} check`. For contract review, recommend `{{DRIFT_COMMAND}} diff --summary`. For failed Drift checks, recommend `{{DRIFT_COMMAND}} explain` or `{{DRIFT_COMMAND}} explain <contract-id>`. For lint, typecheck, build, and tests, inspect the target project's scripts first and only recommend commands that exist in that project.

## Output

Return an impact report with:

```txt
Impact:
Risk:
Likely drift modes:
Contract diff:
Required proof:
Recommendation:
```

Read `references/risk-matrix.md` for risk classification and `references/output-format.md` for the expected response shape.
