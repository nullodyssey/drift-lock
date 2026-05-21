# Pre-Edit Checklist

```txt
- [ ] Identify target files
- [ ] Run or read Drift context for contracted files
- [ ] Note locked contracts
- [ ] Note SSOT paths
- [ ] Note drift/ssot-flow sinks
- [ ] If Drift is already failing, run or request explain diagnostics
- [ ] Confirm whether the task requires a contract change
- [ ] If contract conflict exists, report it before editing
```

Useful commands:

```bash
{{DRIFT_COMMAND}} context <file>
{{DRIFT_COMMAND}} check
{{DRIFT_COMMAND}} explain <contract-id>
```
