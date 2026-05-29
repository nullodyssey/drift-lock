# Examples

## Greenfield

Scenario:
Add the first protected server action for a new checkout flow.

Starting point:
The project has DriftLock installed and a draft contract is acceptable while behavior stabilizes.

Role to use:
`$drift-dev`

Expected agent behavior:
Read task context, implement the smallest working feature, keep pricing values sourced from a schema or config, and add a contract only for critical guarantees.

Drift commands:

```bash
{{DRIFT_COMMAND}} context --task "add checkout action"
{{DRIFT_COMMAND}} diff --summary
{{DRIFT_COMMAND}} check --changed
```

Good output:
Implementation handoff lists changed files, new contract impact, checks run, and remaining coverage gaps.

Anti-pattern to avoid:
Hardcoding a price id locally because no SSOT contract exists yet.

## Brownfield

Scenario:
Modify checkout metadata in an existing locked billing action.

Starting point:
The target action has a locked contract and an SSOT-flow invariant for returned price data.

Role to use:
`$drift-dev`

Expected agent behavior:
Read file context before editing, preserve the locked SSOT flow, make the narrow code change, and run changed checks.

Drift commands:

```bash
{{DRIFT_COMMAND}} context src/features/billing/actions.ts
{{DRIFT_COMMAND}} diff --summary
{{DRIFT_COMMAND}} check --changed
{{DRIFT_COMMAND}} explain <contract-id>
```

Good output:
Implementation handoff states that locked contracts were preserved or explains the intentional acceptance path.

Anti-pattern to avoid:
Removing or weakening an `@drift` contract to make a failing check pass.
