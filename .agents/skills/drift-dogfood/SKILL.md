---
name: drift-dogfood
description: Apply the DriftLock dogfood philosophy when adding, modifying, fixing, or auditing @drift contracts in this repository. Use when the user asks to add a contract, change a locked or draft contract, fix Drift violations, update SSOT or invariants, regenerate the Drift index, or make repo-local code follow docs/dogfood.md.
---

# Drift Dogfood

Use this repo-local skill to keep DriftLock developed under the same pressure it creates for users. The goal is to make contract work intentional, executable, and honest: no decorative contracts, no weakened rules to pass checks, and no fake exceptions for appearances.

## Workflow

1. Read `docs/dogfood.md` before changing contracts or rules.
2. Inspect `.drift/config.json` to understand the required contract surface.
3. Use `pnpm drift-lock:context -- <file>` or `pnpm drift-lock:context` only if the repo script supports the needed target; otherwise use `pnpm drift-lock:check`, `pnpm drift-lock:diff`, and direct source inspection.
4. Classify the task as add, modify, fix, or audit.
5. Read `references/contract-actions.md` for the matching playbook.
6. Read `references/dogfood-checklist.md` before finalizing any contract change.
7. Preserve the distinction between product intent and implementation body:
   - contract content changes are product decisions;
   - body hash changes can be ordinary code movement but still require index regeneration.
8. Run the smallest relevant proof first, then the repo-level Drift proof before finalizing.

## Contract Rules

```txt
- Do not remove, weaken, or broaden @drift contracts just to make checks pass.
- Do not add @drift comments as decorative coverage; every contract must protect a real risk.
- Prefer declaration contracts for critical functions whose outputs must preserve local intent.
- Prefer file contracts for module-level surfaces, command boundaries, and rule modules.
- Use draft when the product rule is still evolving; use locked when the repo should treat changes as product decisions.
- Add ssot and executable invariants only when the code can genuinely prove them today.
- Do not create acceptance files or disable directives unless the exception is real and user-approved.
```

## Required Commands

Use repo scripts when available:

```bash
pnpm drift-lock:diff
pnpm drift-lock:check
pnpm drift-lock:coverage
pnpm drift-lock:extract
pnpm lint
```

Run `pnpm drift-lock:extract` only after deciding that contract/index updates are intentional. If extraction changes `.drift/contracts.generated.json`, run it a second time when practical to confirm the generated index is stable.

## Final Response

Report:

```txt
Action:
Contracts changed:
Index changed:
Dogfood rationale:
Checks:
```

If a contract change was rejected, state the conflict and the safer alternative.
