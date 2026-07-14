# Agent context — drift-lock

You are an Automator phase agent working inside the `agent` container (glibc Node
22), CWD `/app`, on a git worktree the orchestrator owns. This file is injected
into every run. Follow it alongside the task's `goal.md` and
`implementation-plan.md` under `.automator/tasks/issue-{n}/`.

## What this project is

`drift-lock` — a pnpm TypeScript monorepo that pins sources of truth as
contracts and enforces them in ESLint and CI, so AI agents can't silently break
TypeScript. It ships on npm with real users; treat published behavior as a
stability contract.

## Layout

- `packages/core` — contract engine (`packages/core/src`, tests in `tests/`).
- `packages/cli` — the `drift-lock` CLI. Bundled skills live in `packages/cli/skills`.
- `packages/eslint-plugin` — the ESLint rules.
- `apps/next-v1`, `apps/web` — Next.js demo apps (`app/` routes, `src/features`).
- `docs/` — documentation. `.drift/` — generated contract index.

## Commands (use these; nothing else is allowed)

The manifest exposes a scoped allowlist. Run the workspace scripts, never bare
`pnpm`, never `pnpm dlx`/`add`/`publish`:

- `pnpm run build` — build all packages.
- `pnpm run check` — TypeScript checks across the workspace.
- `pnpm test` — build `@drift-lock/core`, then run all Vitest suites. While
  iterating you may narrow with `pnpm test` args, but run the full command before
  finishing.
- `pnpm run lint` — build the plugin, then ESLint the package sources.
- `pnpm run drift-lock:check` — validate contracts (the CI DriftLock gate).

Run `pnpm run build`, `pnpm run check`, `pnpm test`, `pnpm run lint` and
`pnpm run drift-lock:check` clean before you consider the work done — these are
the release gates.

## Conventions

- ESM TypeScript, strict, NodeNext resolution. Prefer named exports for package
  APIs. Two-space indent, single-quoted imports.
- Filenames kebab-case (`contract-diff.ts`); types/classes PascalCase; functions
  and variables camelCase.
- Keep DriftLock contract IDs stable and dotted (e.g. `billing.create-checkout-session`).
- Vitest only. Test files `*.test.ts` in the package's `tests/` dir. Add focused
  tests for parser, CLI, rule, or contract changes.
- Conventional Commits in spirit (`feat(cli): …`, `fix: …`, `chore: …`) — but the
  orchestrator writes commits; you do not run git.

## Never touch

- `.github/workflows/release.yml` and anything in the npm publish path — releases
  are human/CI-gated, out of scope for any pipeline task.
- Do not commit secrets, `.env` files, or generated build output (`dist/`, `.next/`,
  `coverage/`, `node_modules/`, `.pnpm-store/` are gitignored — keep them so).
- If a change alters contracts, update the generated `.drift/` index intentionally
  and explain why in the PR; never hand-edit generated files to force a pass.

## Boundaries

- You never run `git` — the orchestrator owns all commits, pushes, and rebases.
- Stay within the task's `goal.md`. If a "Never touch" becomes unavoidable or the
  scope explodes, stop per its "Stop if" conditions rather than widening the diff.