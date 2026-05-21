# drift-lock

CLI for DriftLock.

```bash
npx --yes @drift-lock/cli install
drift-lock check
drift-lock explain [contract-id]
drift-lock context <file>
```

DriftLock extracts local `@drift` contracts, renders agent-ready context, and
checks supported invariants in CI. Use `drift-lock explain` after a failing
check to print actionable diagnostics, or `drift-lock explain --json` for
agent-readable output.
