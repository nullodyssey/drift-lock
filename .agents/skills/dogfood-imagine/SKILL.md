---
name: dogfood-imagine
description: Imagine and evaluate new DriftLock rules from real dogfood friction in this repository. Use when the user asks for new @drift rules, emergent dogfood rules, AI-assisted failure modes, product innovation, enforcement ideas, coverage metrics, diagnostics, ESLint rules, or ways DriftLock can use itself to discover better protections for users.
---

# Dogfood Imagine

Use this repo-local skill to turn DriftLock dogfooding into product discovery. The goal is not to apply existing contracts; use `$drift-dogfood` for that. The goal here is to find new rules that DriftLock should eventually support because this repository exposes a real AI-assisted drift risk.

## Workflow

1. Read `docs/dogfood.md` first.
2. Inspect the current dogfood surface:
   - `.drift/config.json`
   - `.drift/contracts.generated.json`
   - root CI workflow
   - relevant `packages/core`, `packages/cli`, and `packages/eslint-plugin` source files
   - existing docs and tests for the suspected rule area
3. Read `references/rule-discovery.md` to identify dogfood friction.
4. Keep only ideas grounded in an observable repo signal: a fragile contract, repeated manual judgment, weak diagnostic, unsupported invariant, hidden SSOT, noisy check, or AI-edit failure mode.
5. Classify each idea as one enforcement shape:
   - contract schema capability
   - executable invariant
   - ESLint rule
   - CLI diagnostic or explanation
   - coverage metric
   - agent workflow guardrail
6. Read `references/rule-quality-bar.md` and reject ideas that are decorative, unenforceable, or not dogfoodable in this repo.
7. Format accepted ideas with `references/rule-proposal-format.md`.

## Output Rules

Return rule proposals, not implementation changes. If the user asks for implementation too, first produce the proposals and mark which one is ready for an implementation plan.

Prefer three strong proposals over a long list. Each proposal must identify the first DriftLock dogfood target where the rule would fail or prove value.

## Commands To Consider

Use these only to ground discovery, not to mutate the repo:

```bash
pnpm drift-lock:coverage
pnpm drift-lock:diff
pnpm drift-lock:check
pnpm lint
```

Do not run `pnpm drift-lock:extract` unless the user explicitly switches from ideation to implementation.

## Final Response

Use this shape:

```txt
Observed friction:
Rule proposals:
Rejected ideas:
Recommended next experiment:
Proof to collect:
```

If no strong rule emerges, say that clearly and identify the missing evidence.
