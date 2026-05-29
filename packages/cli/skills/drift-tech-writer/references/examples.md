# Examples

## Greenfield

Scenario:
Document the first DriftLock setup for a new app.

Starting point:
The app has config, a few contracts, and a local check workflow.

Role to use:
`$drift-tech-writer`

Expected agent behavior:
Verify installed commands and scripts, document only actual guarantees, and mark uncovered areas as limits rather than enforced behavior.

Drift commands:

```bash
{{DRIFT_COMMAND}} coverage
{{DRIFT_COMMAND}} check
```

Good output:
Docs handoff lists updated files, verified claims, ambiguous or future claims, and checks run.

Anti-pattern to avoid:
Saying all critical files are protected when coverage still reports missing contracts.

## Brownfield

Scenario:
Fix stale docs that describe an old CLI option and overstate a contract guarantee.

Starting point:
The docs mention behavior that is not in source or tests.

Role to use:
`$drift-tech-writer`

Expected agent behavior:
Read the implementation and command docs, correct stale claims, and link proof commands that users can actually run.

Drift commands:

```bash
{{DRIFT_COMMAND}} context --task "update CLI docs"
{{DRIFT_COMMAND}} check --changed
{{DRIFT_COMMAND}} explain <contract-id>
```

Good output:
Docs handoff marks the removed claim as stale and avoids replacing it with another unverified promise.

Anti-pattern to avoid:
Changing documentation to make accidental drift look intentional.
