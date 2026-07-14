# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**DriftLock** turns local engineering intent into agent context, ESLint feedback, and CI checks so AI-assisted TypeScript changes cannot silently drift away from critical sources of truth. `@drift` contracts pin local rules (a pricing source, an input schema, a checkout flow); the engine validates them deterministically. It ships on npm with real users, and it **dogfoods itself** — this repo's own source is contract-protected, so `pnpm drift-lock:check` here validates real `packages/core` contracts, not fixtures.

DriftLock does not replace tests or review; it adds a checkable layer for the local intent agents tend to miss.

## Monorepo layout

pnpm 10 workspace, Node 22+ (`.nvmrc`), ESM TypeScript, strict, NodeNext resolution.

- `packages/core` (`@drift-lock/core`) — the contract engine. All logic lives in `src/core/*`; `src/index.ts` is the stable facade re-exported to the CLI and plugin. Nothing else should import engine internals directly.
- `packages/cli` (`@drift-lock/cli`) — the `drift-lock` binary (`bin/drift-lock.js`). Command surface (see `src/cli.ts`): `install`, `extract`, `context`, `check`, `coverage`, `explain`, `diff`, `proof`, `accept`, and `skills`. Bundled agent skills live under `packages/cli/skills`.
- `packages/eslint-plugin` (`@drift-lock/eslint-plugin`) — editor-loop enforcement. Rules (`src/rules/`): `valid-contract`, `no-locked-contract-change`, `ssot-flow`, `ssot-usage` — the same invariants the CLI checks, surfaced live.
- `apps/next-v1`, `apps/web` — Next.js demo apps (dogfood surface; `next-v1` carries its own `.drift/` index).
- `actions/proof` — GitHub Action wrapping the proof report.

## Commands

Run from the repo root unless noted. `pnpm test` builds `@drift-lock/core` first because the other packages consume its build output.

```bash
pnpm install --frozen-lockfile     # install workspace deps
pnpm build                         # pnpm -r run build (tsup / Next per package)
pnpm check                         # typecheck across the workspace
pnpm test                          # build core, then run all Vitest suites
pnpm lint                          # build core + plugin, then ESLint the package sources (self-applies the plugin)
pnpm --filter next-v1 dev          # run the demo app
```

Single-package / single-test iteration:

```bash
pnpm --filter @drift-lock/core test                        # one package
pnpm --filter @drift-lock/core exec vitest run <file>      # one test file
pnpm --filter @drift-lock/cli test:with-build              # cli/eslint tests need core's build first
```

DriftLock self-checks (the engine run against this repo — these mirror the CI gates):

```bash
pnpm drift-lock:check       # validate contracts
pnpm drift-lock:coverage    # contract coverage report
pnpm drift-lock:extract     # regenerate the committed .drift index (see below)
pnpm drift-lock:diff        # summarize contract changes vs the committed index
pnpm drift-lock:context     # render agent context
```

## How the engine works (the big picture)

A `@drift` contract is a block comment above a declaration or file. It carries a **stable dotted `id`** (`billing.create-checkout-session`), a `scope` (`file` | `declaration`), a `stability` (e.g. `locked`), an `intent`, an `ssot:` map (named source-of-truth files), and `invariants:` — each with an `enforce:` rule such as `drift/ssot-flow` (a value must flow from a named ssot into declared sinks) or `drift/ssot-usage` (input must be validated through the schema ssot). `llm.must_not_change` lists human-readable guardrails for agents.

The pipeline (all in `packages/core/src/core/`):

1. **extractor** parses `@drift` blocks into contracts.
2. **index-file** writes/reads `.drift/contracts.generated.index` — the committed, machine-readable baseline (sharded ndjson `by-contract/` + `by-file/`). This index is the source of truth for diffs and agent context; it is checked into git.
3. **checker** validates the invariants; **contract-diff** + **accept** manage *intentional* contract changes via `.drift/accepted-contract-changes/`; **context** builds `drift-lock context --task` output; **proof** produces the PR proof report.
4. The same engine backs both enforcement points: the **ESLint plugin** (dev loop) and **CI** (`drift-lock check` + index-freshness + coverage + proof).

`.drift/config.json` declares the protected `source` dirs, the `index` path, and `requireContracts` globs — files that **must** carry a contract.

## Conventions that matter here

- **Contract IDs are stable and dotted** — renaming one is a breaking change to the committed index.
- **If a change alters contracts, regenerate and commit `.drift/contracts.generated.index`** (`pnpm drift-lock:extract`) and explain why in the PR. CI fails when the committed index is stale; **never hand-edit generated files** to force a pass. The same applies to `apps/next-v1/.drift/`.
- Named exports for package APIs; two-space indent; single-quoted imports. Filenames kebab-case (`contract-diff.ts`), types/classes PascalCase, functions/vars camelCase.
- Vitest only; `*.test.ts` in each package's `tests/`. Add focused tests for parser, CLI, rule, or contract-behavior changes.
- Conventional Commits (`feat(cli): …`, `fix: …`, `chore: …`).
- **Do not touch `.github/workflows/release.yml` or the npm publish path** — releases are human/CI-gated.

## Automator-managed repo

This repo is driven by the Automator pipeline. `automator.yaml` + `compose.yaml` are its execution contract and `.automator/CLAUDE.md` is the injected agent context — treat them as infrastructure, not casual edits (they are read from the base branch only). Automator phase agents never run `git`; the orchestrator owns commits and pushes.