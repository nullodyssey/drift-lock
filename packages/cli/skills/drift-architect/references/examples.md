# Examples

## Greenfield

Scenario:
Choose initial boundaries for a new monorepo package layout.

Starting point:
The project has app, domain, and server code but no import-boundary contracts yet.

Role to use:
`$drift-architect`

Expected agent behavior:
Identify minimal package and runtime boundaries, recommend contract candidates, and avoid a big-bang architecture rewrite.

Drift commands:

```bash
{{DRIFT_COMMAND}} context --task "define package boundaries"
{{DRIFT_COMMAND}} coverage
```

Good output:
Architecture Direction lists current boundaries, proposed constraints, migration path, and required checks.

Anti-pattern to avoid:
Enforcing framework-specific folder rules when a smaller import boundary would protect the real risk.

## Brownfield

Scenario:
Refactor shared billing code into a new package.

Starting point:
Existing contracts protect server actions, public APIs, and SSOT paths.

Role to use:
`$drift-architect`

Expected agent behavior:
Map current ownership and runtime boundaries, identify locked constraints, propose the smallest migration sequence, and route proof to `$drift-analyst`.

Drift commands:

```bash
{{DRIFT_COMMAND}} context packages/billing/src/index.ts
{{DRIFT_COMMAND}} diff --summary
{{DRIFT_COMMAND}} proof --git-base origin/main
```

Good output:
Architecture Direction distinguishes irreversible decisions, reversible conventions, and accepted debt.

Anti-pattern to avoid:
Moving files across package boundaries and calling the change safe without checking contract diff and coverage.
