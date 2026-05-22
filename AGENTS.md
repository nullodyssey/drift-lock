# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm TypeScript monorepo. Core source lives in `packages/core/src`, the CLI in `packages/cli/src`, and the ESLint rules in `packages/eslint-plugin/src`. Tests sit beside each package in `packages/*/tests`. The Next.js demo app is in `apps/next-v1`, with routes in `app/` and feature code in `src/features`. DriftLock bundled skills are stored under `packages/cli/skills`, and documentation lives in `docs/`.

## Build, Test, and Development Commands

Use Node 22+ (`.nvmrc`) and pnpm 10.

- `pnpm install --frozen-lockfile`: install workspace dependencies.
- `pnpm build`: build all packages via each package's `tsup` or Next build script.
- `pnpm check`: run TypeScript checks across the workspace.
- `pnpm test`: build `@drift-lock/core`, then run all Vitest suites.
- `pnpm --filter next-v1 dev`: start the demo app locally.
- `pnpm --filter next-v1 lint`: run ESLint for the demo app.
- `pnpm --filter next-v1 drift-lock:extract` and `drift-lock:check`: refresh and validate demo contracts.

## Coding Style & Naming Conventions

Use ESM TypeScript with strict checking and NodeNext module resolution. Prefer named exports for shared package APIs. Follow existing two-space indentation and single-quoted imports. Source files use kebab-case names such as `contract-diff.ts`; exported types and classes use PascalCase; functions and variables use camelCase. Keep DriftLock contract IDs stable and dotted, for example `billing.create-checkout-session`.

## Testing Guidelines

Vitest is the test framework. Name test files `*.test.ts` and place them in the relevant package's `tests` directory. Add focused tests for parser, CLI, rule, or contract behavior changes. Run the package-level command while iterating, for example `pnpm --filter @drift-lock/core test`, then run `pnpm test` before submitting.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit style: `feat(cli): ...`, `fix: ...`, and `chore: ...`. Keep commits scoped and imperative. Pull requests should include a concise summary, test results, linked issues when applicable, and screenshots only for visible `apps/next-v1` UI changes. If contracts change, include the updated `.drift/contracts.generated.json` and explain why the contract update is intentional.

## Security & Configuration Tips

Do not commit local secrets, `.env` files, or generated build output. CI runs build, typecheck, tests, demo lint, package dry-runs, and DriftLock validation, so keep those commands passing locally when possible.
