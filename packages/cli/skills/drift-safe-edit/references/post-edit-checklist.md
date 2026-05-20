# Post-Edit Checklist

Run the checks that match the changed area.

Default for this repo:

```bash
{{DRIFT_COMMAND}} check
```

For lint, typecheck, build, and tests, inspect the target project's package scripts and use only commands that are valid for that project.

Before final response:

```txt
- [ ] State whether any locked contract changed
- [ ] State whether Drift checks passed
- [ ] State whether lint/typecheck/tests passed
- [ ] List any checks not run
- [ ] Keep the summary focused on contract-relevant behavior
```
