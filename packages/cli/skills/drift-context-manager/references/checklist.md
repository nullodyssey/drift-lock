# Drift Context Checklist

Use this checklist before routing work to another agent or starting implementation.

```txt
- [ ] Identify target file(s)
- [ ] Check whether each target has a Drift Contract
- [ ] Run or request: {{DRIFT_COMMAND}} context <file>
- [ ] List contract ids and stability
- [ ] List SSOT paths
- [ ] List invariants, especially drift/ssot-flow and drift/ssot-usage
- [ ] List llm.must_not_change items
- [ ] Detect conflicts with the user request
- [ ] Recommend next role: @analyst or @dev
- [ ] List post-edit checks
```

Default Drift check:

```bash
{{DRIFT_COMMAND}} check
```

For lint, typecheck, build, and tests, inspect the target project's package scripts and use only commands that are valid for that project.
