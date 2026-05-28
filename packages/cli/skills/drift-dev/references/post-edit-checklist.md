# Post-Edit Checklist

Run the checks that match the changed area.

Default for this repo:

```bash
{{DRIFT_COMMAND}} diff --summary
{{DRIFT_COMMAND}} check --changed
```

If Drift fails, capture the actionable diagnostic before editing again:

```bash
{{DRIFT_COMMAND}} explain
```

For PR handoff, include a non-blocking proof report when a Git base is known:

```bash
{{DRIFT_COMMAND}} proof --git-base <ref>
```

For lint, typecheck, build, and tests, inspect the target project's package scripts and use only commands that are valid for that project.

Before final response:

```txt
- [ ] State whether any locked contract changed
- [ ] Include `diff --summary` when contracted files changed
- [ ] State whether Drift checks passed
- [ ] If Drift failed, include the relevant explain output
- [ ] Include `proof --git-base <ref>` when available for PR handoff
- [ ] State whether lint/typecheck/tests passed
- [ ] List any checks not run
- [ ] Keep the summary focused on contract-relevant behavior
```
