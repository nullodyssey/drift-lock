# Drift Architect Checklist

Use this checklist before proposing or approving structural changes.

```txt
- [ ] Identify packages, modules, layers, or runtime boundaries in scope
- [ ] Read package manifests, existing contracts, and relevant source files
- [ ] Run or request: {{DRIFT_COMMAND}} context --task "<user prompt>" when starting from a product prompt
- [ ] Run or request: {{DRIFT_COMMAND}} context <file> for critical files
- [ ] List current import, ownership, runtime, package, API, and SSOT boundaries
- [ ] List implicit boundaries that matter but are not protected
- [ ] Check whether required-contract coverage matters for the touched area
- [ ] Propose minimal contracts, policies, or coverage requirements
- [ ] Distinguish irreversible decisions, reversible conventions, and accepted debt
- [ ] If contracts may change, recommend: {{DRIFT_COMMAND}} diff --summary
- [ ] If proof is needed for a PR, recommend: {{DRIFT_COMMAND}} proof --git-base <ref>
- [ ] Recommend next role: $drift-dev for implementation or $drift-analyst for proof
```

Useful commands:

```bash
{{DRIFT_COMMAND}} context --task "<user prompt>"
{{DRIFT_COMMAND}} context <file>
{{DRIFT_COMMAND}} coverage
{{DRIFT_COMMAND}} diff --summary
{{DRIFT_COMMAND}} check
{{DRIFT_COMMAND}} explain <contract-id>
{{DRIFT_COMMAND}} proof --git-base <ref>
```

For lint, typecheck, build, and tests, inspect the target project's package scripts and use only commands that are valid for that project.
