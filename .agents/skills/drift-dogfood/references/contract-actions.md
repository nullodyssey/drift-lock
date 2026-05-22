# Contract Actions

Use this reference after classifying the task as add, modify, fix, or audit.

## Add A Contract

1. Identify the protected risk: command behavior, public API, source of truth, return flow, diagnostic stability, or agent context.
2. Choose scope:
   - `file` for module-level behavior, rule files, command surfaces, and broad local intent.
   - `declaration` for named functions or const function values whose return values or behavior need tight protection.
3. Choose stability:
   - `draft` for evolving policy or uncertain product shape.
   - `locked` for behavior that should require explicit review when changed.
4. Write an `intent` that describes why the code exists, not how every line works.
5. Add `ssot` only for real source files/modules the code must reference.
6. Add invariants only when executable enforcement is meaningful today:
   - `drift/ssot-usage` when anchored code must reference a declared SSOT.
   - `drift/ssot-flow` when a declaration return sink must derive from a declared SSOT.
7. Add `llm.must_not_change` for short constraints an agent should preserve.
8. Run Drift checks and extract the index if the contract is intentional.

## Modify A Contract

1. Compare the requested change with the current contract intent.
2. Treat changes to `intent`, `stability`, `ssot`, `invariants`, or `llm` as product-level changes.
3. If the user only asked for code behavior, prefer preserving the contract and fixing code to satisfy it.
4. If the contract is wrong or obsolete, update it explicitly and explain the product reason.
5. For `locked` contracts, review `pnpm drift-lock:diff` before finalizing.
6. Use acceptance only for a real intentional locked-contract change that needs explicit acceptance in the repo flow.

## Fix A Violation

1. Run or inspect `pnpm drift-lock:check`.
2. Use `pnpm drift-lock:diff` to distinguish contract text changes from body-only changes.
3. Use `drift-lock explain` through the repo script or built CLI when diagnostics are not obvious.
4. Fix according to the error:
   - `DRIFT010`: restore real usage of the declared SSOT or correct the contract if dependency changed.
   - `DRIFT011`: restore the locked contract or intentionally accept/change it with rationale.
   - `DRIFT013`: make the sink derive from the SSOT; do not hardcode or merely mention the SSOT.
   - `DRIFT014`: simplify the flow to supported const aliases, property access, derived expressions, and explicit return fields.
   - `DRIFT015`: add a useful contract to the required file or justify changing required coverage.
5. Regenerate the index only after the desired state is clear.

## Audit Existing Dogfood

1. Run `pnpm drift-lock:coverage`.
2. Look for shallow coverage: contracts with no SSOT, no invariants, vague intent, or only decorative `must_not_change`.
3. Prefer improving the highest-risk surface first.
4. Do not add fake acceptance files or fake disable directives to improve metrics.
