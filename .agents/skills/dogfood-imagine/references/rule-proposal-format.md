# Rule Proposal Format

Use this format for every accepted rule idea.

```txt
Rule:
Problem:
Dogfood signal:
User value:
Enforcement shape:
First dogfood target:
False-positive risk:
Implementation sketch:
Proof commands:
Recommendation:
```

## Field Guidance

- `Rule`: short name and one-sentence behavior.
- `Problem`: the AI-assisted drift this would catch.
- `Dogfood signal`: concrete evidence from this repo that the risk exists or can be simulated honestly.
- `User value`: why real DriftLock users would benefit.
- `Enforcement shape`: contract schema capability, invariant, ESLint rule, CLI diagnostic, coverage metric, or agent workflow guardrail.
- `First dogfood target`: exact repo surface where the rule should be tried first.
- `False-positive risk`: what legitimate work might be blocked or made noisy.
- `Implementation sketch`: smallest plausible implementation, not a full plan.
- `Proof commands`: commands or tests that would prove the idea.
- `Recommendation`: `explore`, `prototype`, `document only`, or `reject`.

## Ranking

When proposing multiple rules, rank them by:

1. Real dogfood pain in this repo.
2. Value for AI-assisted TypeScript projects.
3. Deterministic enforceability.
4. Low false-positive risk.
5. Small first implementation.
