# Dogfooding DriftLock

DriftLock is built under the same pressure it is designed to create.

The project is intentionally AI-assisted, so the repository must expose the
same failure modes that DriftLock is meant to catch in other codebases:
unspoken local intent, silent source-of-truth drift, broad refactors that erase
constraints, and contract changes that look harmless until they change product
behavior.

Dogfooding is not a side demo. It is part of the product design.

## Principle

Every rule DriftLock asks other projects to follow should eventually be applied
to DriftLock itself.

That means new DriftLock capabilities should not only exist in tests or docs.
They should appear in this repository as real contracts, real checks, real CI
pressure, and real maintenance friction. If a rule is noisy, unclear, too rigid,
hard to explain, or easy for an AI agent to bypass, the DriftLock repo should
feel that pain first.

## What This Repo Proves Today

This repository already uses DriftLock to protect its own core surfaces:

- `.drift/config.json` defines the source roots and required contract files.
- `.drift/contracts.generated.json` is committed as the locked baseline.
- CI runs DriftLock extraction and fails when the generated index is stale.
- Core, CLI, and ESLint rule files carry `@drift` contracts that describe local
  intent and `llm.must_not_change` constraints.

This is a real start, but it is not the end state. The current dogfood layer is
mostly file-scoped and contract-baseline focused. The project should continue
moving toward executable self-pressure: declaration contracts, source-of-truth
invariants, flow checks, acceptance files, coverage policy, and agent-facing
context workflows used on real DriftLock changes.

## The Target State

The repository should become the most complete practical demo of DriftLock.

In target form, the project should exercise every stable capability it ships:

- file-scoped contracts for major modules
- declaration-scoped contracts for critical functions
- `locked` contracts for public behavior and compatibility promises
- `draft` contracts for evolving product surfaces
- declared `ssot` entries for internal sources of truth
- `drift/ssot-usage` where code must keep referencing those sources
- `drift/ssot-flow` where returned values must derive from those sources
- required-contract coverage for critical implementation files
- explicit acceptance files for intentional locked contract changes
- disable directives with clear reasons and expiration when exceptions are
  unavoidable
- ESLint feedback during development
- CI checks that make stale indexes and broken invariants visible
- agent workflows that call `drift-lock context`, `diff`, `explain`, and `check`

The goal is not to cover every file blindly. The goal is to make DriftLock's own
high-risk product decisions explicit, checkable, and difficult to drift away
from accidentally.

## Rules For This Repository

Dogfooding creates working rules for DriftLock development:

- A new stable DriftLock feature should have at least one real dogfood use in
  this repository, not only a fixture.
- A new critical source file in `packages/core`, `packages/cli`, or
  `packages/eslint-plugin` should either receive a contract or be deliberately
  excluded from required coverage.
- A new Drift diagnostic should have tests, explanation text, and enough context
  for an AI agent to act on it.
- A change to a `locked` contract should be treated as a product decision, not a
  formatting chore.
- A stale generated index is a legitimate CI failure and should be fixed by
  regenerating the index or reverting the unintended drift.
- A disable directive should be visible, justified, and temporary when possible.

These rules are expected to evolve as the product discovers its own friction.

## Why It Matters For AI-Assisted Development

AI-assisted development makes local intent fragile. Agents can be excellent at
producing plausible code while missing the reason a small dependency, return
field, schema, or command behavior must remain stable.

DriftLock dogfooding forces the project to solve that problem on itself:

- Can an agent see the relevant constraints before editing?
- Does CI catch the drift after editing?
- Are diagnostics specific enough for the agent to fix the right thing?
- Is accepting an intentional product change explicit without being cumbersome?
- Does coverage measure meaningful protection rather than decorative comments?

If those answers are weak in this repository, they will be weak for users too.

## Philosophy

DriftLock should make intent cheap to preserve and expensive to erase silently.

The repository should therefore remain strict enough to catch real AI-induced
drift, but flexible enough to keep product development moving. The right
pressure is not maximum bureaucracy. It is visible, local, executable intent
that teaches humans and agents what must not be lost.
