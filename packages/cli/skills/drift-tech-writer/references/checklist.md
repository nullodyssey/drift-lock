# Drift Tech Writer Checklist

Use this checklist before changing DriftLock documentation, README files, command docs, or agent-facing guidance.

```txt
- [ ] Identify the documentation files in scope
- [ ] Read the implementation, tests, contracts, diagnostics, or scripts behind each claim
- [ ] Run or request: {{DRIFT_COMMAND}} context <file> for every documented file
- [ ] Mark verified guarantees separately from context, limitations, and future direction
- [ ] Check command examples against actual scripts and CLI options
- [ ] Check diagnostics and error names against source or tests
- [ ] Avoid turning draft or contextual contracts into locked guarantees
- [ ] If locked contracts changed, review or request: {{DRIFT_COMMAND}} diff --summary
- [ ] If Drift failures affect the docs, run or request: {{DRIFT_COMMAND}} explain <contract-id>
- [ ] List checks run and checks not run
```

Useful commands:

```bash
{{DRIFT_COMMAND}} context <file>
{{DRIFT_COMMAND}} check
{{DRIFT_COMMAND}} coverage
{{DRIFT_COMMAND}} diff --summary
{{DRIFT_COMMAND}} explain <contract-id>
{{DRIFT_COMMAND}} proof --git-base <ref>
```

For lint, typecheck, build, and tests, inspect the target project's package scripts and use only commands that are valid for that project.
