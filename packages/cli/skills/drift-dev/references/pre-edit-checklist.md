# Pre-Edit Checklist

```txt
- [ ] If starting from a product/user prompt, run or read task context
- [ ] Identify target files
- [ ] Run or read Drift context for contracted files
- [ ] Note locked contracts
- [ ] Note SSOT paths
- [ ] Note drift/ssot-flow sinks
- [ ] Note missing contracts or coverage gaps that make proof incomplete
- [ ] If contracted files may change, plan a diff summary review
- [ ] If Drift is already failing, run or request explain diagnostics
- [ ] Confirm whether the task requires a contract change
- [ ] If contract conflict exists, report it before editing
- [ ] If the change will be handed off in a PR, identify the Git base for proof
```

Useful commands:

```bash
{{DRIFT_COMMAND}} context <file>
{{DRIFT_COMMAND}} coverage
{{DRIFT_COMMAND}} diff --summary
{{DRIFT_COMMAND}} check --changed
{{DRIFT_COMMAND}} explain <contract-id>
{{DRIFT_COMMAND}} proof --git-base <ref>
```
