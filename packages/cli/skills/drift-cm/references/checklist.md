# Drift Context Checklist

Use this checklist before routing work to another role or starting implementation. The goal is to prevent cadrage drift before the agent plans or edits.

```txt
- [ ] If starting from a product/user prompt, run or request: {{DRIFT_COMMAND}} context --task "<user prompt>"
- [ ] Identify target file(s)
- [ ] Check whether each target has a Drift Contract
- [ ] Run or request: {{DRIFT_COMMAND}} context <file>
- [ ] List contract ids and stability
- [ ] List SSOT paths
- [ ] List enforced invariants, especially drift/ssot-flow and drift/ssot-usage
- [ ] List llm.must_not_change items
- [ ] Detect conflicts with the user request
- [ ] Mark missing contracts or missing proof as risk, not as safety
- [ ] If auditing adoption or required contracts, run or request: {{DRIFT_COMMAND}} coverage
- [ ] If contracts or protected files may change, recommend: {{DRIFT_COMMAND}} diff --summary
- [ ] If Drift is already failing, run or request: {{DRIFT_COMMAND}} explain <contract-id>
- [ ] If preparing PR handoff, recommend: {{DRIFT_COMMAND}} proof --git-base <ref>
- [ ] Recommend next role: $drift-analyst, $drift-dev, $drift-architect, $drift-tech-writer, or $drift-ux-designer
- [ ] List required proof and post-edit checks
```

Default Drift commands:

```bash
{{DRIFT_COMMAND}} context --task "<user prompt>"
{{DRIFT_COMMAND}} coverage
{{DRIFT_COMMAND}} check
{{DRIFT_COMMAND}} check --changed
{{DRIFT_COMMAND}} diff --summary
{{DRIFT_COMMAND}} explain <contract-id>
{{DRIFT_COMMAND}} proof --git-base <ref>
```

For lint, typecheck, build, and tests, inspect the target project's package scripts and use only commands that are valid for that project.
