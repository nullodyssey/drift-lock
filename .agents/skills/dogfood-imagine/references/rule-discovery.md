# Rule Discovery

Use this reference to find rule ideas from real DriftLock dogfood friction.

## Surfaces To Inspect

- Contracts with broad `file` scope but no executable invariant.
- Contracts with `llm.must_not_change` items that could become deterministic checks.
- SSOT relationships that are implied by imports, config, docs, or tests but not declared.
- Drift diagnostics that require human interpretation before an agent can fix them.
- CI steps that protect DriftLock indirectly but are not visible in Drift coverage.
- Generated index churn, especially body-only diffs that confuse review.
- Unsupported `drift/ssot-flow` patterns in real code.
- Acceptance or disable workflows that are documented but rarely dogfooded.
- Docs, installer output, bundled skills, and examples that can drift from implemented behavior.
- Repeated manual review comments that could become a contract, invariant, metric, or explanation.

## Discovery Questions

- What plausible AI-assisted edit would look correct but break local intent?
- What signal already exists in the repo: AST shape, contract metadata, index diff, import graph, config, tests, or CI output?
- Can the rule fail clearly with a specific expected/found message?
- Can DriftLock dogfood the rule before asking users to trust it?
- Is the rule useful outside this repo, or is it only project-specific policy?
- Should the first version be report-only, warning, or blocking?
- Would this reduce silent drift or just increase ceremony?

## Useful Friction Categories

- Hidden source of truth: important dependency is not declared as `ssot`.
- Weak contract: intent exists but no executable proof can fail.
- Review ambiguity: body hash changed but reviewers cannot see whether product intent changed.
- Agent blindness: `context --task` does not surface the right contracts or files.
- Unsupported proof: current flow checker rejects a pattern humans consider safe.
- Adoption opacity: coverage reports counts but not quality or maturity.
- Exception debt: disables or acceptances exist without enough lifecycle pressure.
