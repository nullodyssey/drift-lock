# drift-lock

CLI for DriftLock.

```bash
npx --yes @drift-lock/cli install
drift-lock check
drift-lock check --changed
drift-lock diff --summary
drift-lock explain [contract-id]
drift-lock context <file>
```

DriftLock extracts local `@drift` contracts, renders agent-ready context, and
checks supported invariants in CI. Use `drift-lock diff --summary` to review
contract changes in PRs, `drift-lock check --changed` for focused validation,
and `drift-lock explain` after a failing check. Use `--json` for agent-readable
output.
