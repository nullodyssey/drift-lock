# Drift Context Checklist

Use this checklist before routing work to another agent or starting implementation.

```txt
- [ ] If starting from a product/user prompt, run or request: {{DRIFT_COMMAND}} context --task "<user prompt>"
- [ ] Identify target file(s)
- [ ] Check whether each target has a Drift Contract
- [ ] Run or request: {{DRIFT_COMMAND}} context <file>
- [ ] List contract ids and stability
- [ ] List SSOT paths
- [ ] List invariants, especially drift/ssot-flow and drift/ssot-usage
- [ ] List llm.must_not_change items
- [ ] Detect conflicts with the user request
- [ ] If auditing adoption or required contracts, run or request: {{DRIFT_COMMAND}} coverage
- [ ] If contracts or protected files may change, recommend: {{DRIFT_COMMAND}} diff --summary
- [ ] If Drift is already failing, run or request: {{DRIFT_COMMAND}} explain <contract-id>
- [ ] Recommend next role: @analyst or @dev
- [ ] List post-edit checks
```

Default Drift commands:

```bash
{{DRIFT_COMMAND}} context --task "<user prompt>"
{{DRIFT_COMMAND}} coverage
{{DRIFT_COMMAND}} check
{{DRIFT_COMMAND}} diff --summary
{{DRIFT_COMMAND}} explain <contract-id>
```

For lint, typecheck, build, and tests, inspect the target project's package scripts and use only commands that are valid for that project.
