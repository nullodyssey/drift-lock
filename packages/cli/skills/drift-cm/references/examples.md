# Examples

## Greenfield

Scenario:
New billing feature in a project that just installed DriftLock.

Starting point:
The repo has a config, but no useful product contracts yet.

Role to use:
`$drift-cm`

Expected agent behavior:
Prepare task context, identify likely source files and SSOT candidates, route architecture questions to `$drift-architect`, and route implementation to `$drift-dev`.

Drift commands:

```bash
{{DRIFT_COMMAND}} context --task "add yearly billing plan"
{{DRIFT_COMMAND}} coverage
```

Good output:
Task context lists missing coverage as a risk and recommends the next role with required proof.

Anti-pattern to avoid:
Treating the absence of contracts as proof that the feature is safe to implement.

## Brownfield

Scenario:
Change checkout behavior in a package that already has locked billing contracts.

Starting point:
The target files are known and the user asks for a behavior change.

Role to use:
`$drift-cm`

Expected agent behavior:
Read file context, extract locked constraints and SSOT paths, flag product conflicts, and route to `$drift-analyst` when impact is unclear.

Drift commands:

```bash
{{DRIFT_COMMAND}} context src/features/billing/actions.ts
{{DRIFT_COMMAND}} diff --summary
{{DRIFT_COMMAND}} check --changed
```

Good output:
Task context names the relevant contract ids, locked constraints, SSOT, recommended next role, and proof commands.

Anti-pattern to avoid:
Routing directly to implementation when the requested change conflicts with a locked contract.
