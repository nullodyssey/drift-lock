# Examples

## Greenfield

Scenario:
Define a new billing settings screen before implementation.

Starting point:
No UI contracts exist yet, but the flow has critical empty, loading, error, and destructive states.

Role to use:
`$drift-ux-designer`

Expected agent behavior:
Identify critical states, stable product vocabulary, action priority, accessibility expectations, and which parts should become contracts.

Drift commands:

```bash
{{DRIFT_COMMAND}} context src/features/billing/settings.tsx
{{DRIFT_COMMAND}} coverage
```

Good output:
UX Contract Brief distinguishes enforceable UX guarantees from flexible design preferences.

Anti-pattern to avoid:
Locking visual taste as a contract instead of user-critical behavior.

## Brownfield

Scenario:
Change an existing checkout confirmation flow.

Starting point:
The current flow uses stable product labels and requires confirmation before a destructive action.

Role to use:
`$drift-ux-designer`

Expected agent behavior:
Preserve vocabulary, action hierarchy, destructive-action guardrails, and SSOT-backed displayed data before routing to `$drift-dev`.

Drift commands:

```bash
{{DRIFT_COMMAND}} context src/features/billing/components/checkout-confirmation.tsx
{{DRIFT_COMMAND}} check --changed
```

Good output:
UX Contract Brief lists the states and labels that must remain stable and the preferences that can change.

Anti-pattern to avoid:
Renaming a business-critical label without documenting contract and support impact.
