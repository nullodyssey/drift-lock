# Dogfood Checklist

## Before Changing Contracts

- Read `docs/dogfood.md`.
- Check `git status --short` and preserve unrelated user changes.
- Identify impacted files and existing contract IDs.
- Decide whether the task is add, modify, fix, or audit.
- Check whether the file is required by `.drift/config.json`.
- Identify real SSOT files or modules before adding `ssot`.
- Confirm whether `draft` or `locked` matches the maturity of the rule.

## Quality Bar

- The contract protects a concrete repo risk.
- The intent is local and product-oriented.
- `llm.must_not_change` items are short and enforceable by review.
- `ssot` entries point to real local sources of truth.
- Executable invariants are not aspirational; they pass because the code genuinely satisfies them.
- Declaration contracts anchor to supported declarations.
- Coverage gains are meaningful, not decorative.

## After Changing Contracts

- Run `pnpm drift-lock:diff`.
- Run `pnpm drift-lock:check`.
- Run `pnpm drift-lock:coverage` for adoption changes.
- Run `pnpm drift-lock:extract` when index updates are intentional.
- Run `pnpm lint` when ESLint rules or root protected sources changed.
- Run package tests when code behavior changed, not only contract text.
- Report whether `.drift/contracts.generated.json` changed and why.
