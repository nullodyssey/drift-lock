# Examples

## Greenfield

Scenario:
Assess whether a new project has enough Drift coverage before the first release.

Starting point:
Only a few draft contracts exist and required-contract adoption is still in `audit` or `warn`.

Role to use:
`$drift-analyst`

Expected agent behavior:
Measure coverage, identify critical uncovered files, classify risk, and recommend a staged adoption path.

Drift commands:

```bash
{{DRIFT_COMMAND}} coverage
{{DRIFT_COMMAND}} check
```

Good output:
Impact report separates missing coverage from actual safety and recommends which role should act next.

Anti-pattern to avoid:
Calling the project ready because `check` is non-blocking in audit mode.

## Brownfield

Scenario:
Review a PR that changes a locked contract and introduces a failing SSOT-flow check.

Starting point:
The PR touches existing protected files and CI reports Drift diagnostics.

Role to use:
`$drift-analyst`

Expected agent behavior:
Read the contract diff, explain the violation, classify the risk as high or critical, and recommend fix, clarification, or acceptance.

Drift commands:

```bash
{{DRIFT_COMMAND}} diff --summary --git-base origin/main
{{DRIFT_COMMAND}} explain <contract-id>
{{DRIFT_COMMAND}} proof --git-base origin/main
```

Good output:
Impact report names likely drift modes, required proof, PR proof, and a clear recommendation.

Anti-pattern to avoid:
Using `accept` as a shortcut before product intent and contract impact are explicit.
