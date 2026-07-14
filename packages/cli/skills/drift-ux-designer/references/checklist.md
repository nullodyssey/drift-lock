# Drift UX Designer Checklist

Use this checklist before proposing UX constraints for an AI-assisted UI change.

```txt
- [ ] Identify the user flow, screen, or component in scope
- [ ] Read existing UI code, product copy, docs, and relevant contracts
- [ ] Run or request: {{DRIFT_COMMAND}} context <file> for every UI file in scope
- [ ] List empty, loading, error, success, disabled, and confirmation states
- [ ] List product vocabulary that should stay stable
- [ ] List primary, secondary, and destructive actions in order of priority
- [ ] List accessibility expectations that are actually required
- [ ] Identify data displayed from SSOT-backed sources
- [ ] Separate contract candidates from non-contract preferences
- [ ] Recommend next role: $drift-dev for implementation or $drift-tech-writer for docs
```

Useful commands:

```bash
{{DRIFT_COMMAND}} context <file>
{{DRIFT_COMMAND}} coverage
{{DRIFT_COMMAND}} diff --summary
{{DRIFT_COMMAND}} check --changed
{{DRIFT_COMMAND}} proof --git-base <ref>
```

For visual, accessibility, lint, typecheck, build, and tests, inspect the target project's scripts first and use only commands that are valid for that project.
