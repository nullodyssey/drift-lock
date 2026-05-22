# Rule Quality Bar

Use this reference to reject weak ideas before presenting them.

## A Good New Rule

- Protects against a plausible AI-assisted drift failure.
- Has a concrete dogfood target in this repository.
- Can fail with an actionable message.
- Has a deterministic signal, even if first shipped as report-only.
- Improves product trust rather than only increasing coverage numbers.
- Can be introduced progressively: report-only, warning, then enforcement if proven.
- Teaches agents what to preserve or how to fix the issue.

## Reject Or Defer When

- The rule is only a preference with no clear drift risk.
- The signal depends on subjective judgment that cannot be explained to an agent.
- The first dogfood target would be artificial or fake.
- It duplicates an existing test, lint rule, or Drift invariant without adding value.
- It would require broad static analysis before a narrow dogfood prototype can exist.
- It would make normal refactors noisy without a clear product safety benefit.

## Preferred First Experiments

- Report-only CLI output before blocking checks.
- Coverage sub-metrics before required thresholds.
- Explanations before new enforcement.
- Narrow AST patterns before broad semantic analysis.
- Dogfood in `packages/core` before exposing the behavior to users.
