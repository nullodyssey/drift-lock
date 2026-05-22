# DriftLock

DriftLock turns local engineering intent into agent context, ESLint feedback,
and CI checks so AI-assisted TypeScript changes cannot silently drift away from
critical sources of truth.

## Why DriftLock

AI coding agents are fast, but they do not naturally know which local rules are
critical. A small refactor can hardcode a price, bypass an input schema, weaken
a checkout flow, or keep an import around while the returned value no longer
comes from the intended source.

DriftLock makes those rules explicit and checkable:

- `@drift` contracts describe local intent and sources of truth.
- `drift-lock context --task` gives agents relevant constraints before they plan.
- `drift-lock check` validates supported invariants in CI.
- `drift-lock explain` turns violations into actionable diagnostics.
- `@drift-lock/eslint-plugin` brings the same feedback into the developer loop.

DriftLock does not replace tests or code review. It adds a deterministic layer
for the local product and engineering intent that agents often miss.

## Dogfooding

DriftLock is developed under the same constraints it creates for other
AI-assisted TypeScript projects. This repository uses its own contracts,
committed index, executable invariants, ESLint plugin, CI checks, and
agent-facing workflows so product friction is discovered here before it reaches
users.

See [docs/dogfood.md](./docs/dogfood.md) for the public dogfooding philosophy
and the target state for making this repository DriftLock's most complete
practical demo.

## Install

DriftLock requires Node.js 22 or newer.

Run the interactive installer from the package manager you use in the project:

```bash
# npm
npx --yes @drift-lock/cli@latest install

# pnpm
pnpm dlx @drift-lock/cli@latest install

# bun
bunx @drift-lock/cli@latest install

# yarn
yarn dlx -p @drift-lock/cli@latest drift-lock install
```

The installer detects your package manager, creates `.drift/config.json`,
generates `.drift/contracts.generated.json`, adds DriftLock scripts, installs
`@drift-lock/cli` and `@drift-lock/eslint-plugin` as dev dependencies, and can
configure ESLint, GitHub Actions, and agent skills.

If you prefer to install the package first, add the CLI as a dev dependency and
then run the local command:

```bash
# npm
npm install -D @drift-lock/cli
npm exec drift-lock -- install

# pnpm
pnpm add -D @drift-lock/cli
pnpm exec drift-lock install

# bun
bun add -d @drift-lock/cli
bunx drift-lock install

# yarn
yarn add -D @drift-lock/cli
yarn drift-lock install
```

Useful installer options:

```bash
# Scan a specific source directory
npx --yes @drift-lock/cli@latest install --source src

# Install bundled agent skills for a provider
npx --yes @drift-lock/cli@latest install --agent openai
npx --yes @drift-lock/cli@latest install --agent claude
npx --yes @drift-lock/cli@latest install --agent cursor

# Add GitHub Actions CI
npx --yes @drift-lock/cli@latest install --ci github

# Skip ESLint or CI when you do not want them
npx --yes @drift-lock/cli@latest install --no-eslint --no-ci

# Preview changes without writing files or installing packages
npx --yes @drift-lock/cli@latest install --dry-run
```

After install, run DriftLock through your package manager's local binary runner:

```bash
npm exec drift-lock -- check
pnpm exec drift-lock check
bunx drift-lock check
yarn drift-lock check
```

The installer also adds package scripts such as `drift-lock:check`, so `npm run
drift-lock:check` and `pnpm drift-lock:check` work too.

## First Contract

Add a `@drift` contract next to code that must preserve a local source of truth:

```ts
import { parseCheckoutInput } from '@/features/billing/billing.schema';
import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
version: 1
id: billing.create-checkout-session
scope: declaration
stability: locked

intent: >
  Create a Checkout session for the Pro subscription while respecting the billing sources of truth.

ssot:
  pricing: "@/features/billing/pricing.ts"
  schema: "@/features/billing/billing.schema.ts"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
      - return.amount
      - return.currency
  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema

llm:
  must_not_change:
    - pricing source
    - accepted input shape
    - checkout flow
*/
export async function createCheckoutSession(input: unknown) {
  const payload = parseCheckoutInput(input);
  const price = BILLING_PRICES[payload.plan];

  return {
    priceId: price.priceId,
    amount: price.monthlyAmount * payload.seats,
    currency: price.currency,
  };
}
```

Then extract the committed baseline:

```bash
drift-lock extract
```

Commit `.drift/contracts.generated.json` so locked contract changes can be
detected in CI.

## Commands

```bash
drift-lock install
drift-lock context <file>
drift-lock context --task "<user prompt>"
drift-lock extract
drift-lock check
drift-lock check --changed
drift-lock coverage
drift-lock diff --summary
drift-lock explain [contract-id]
drift-lock accept <contract-id> --reason "<reason>"
drift-lock skills list
drift-lock skills install --provider openai
```

`install` sets up DriftLock in the current project. It creates `.drift`, adds
package scripts, installs the CLI and ESLint plugin, and can configure CI or
agent skills.

`context <file>` renders the contracts that matter for one file. Use it before
editing risky code so an agent sees the local intent, sources of truth, and
invariants.

`context --task "<prompt>"` prepares contract-aware context for a planned AI
change. It is the best starting point before asking an agent to implement a
feature.

`extract` scans the source directory and writes `.drift/contracts.generated.json`.
Commit this file so locked contract changes can be detected later.

`check` validates contract syntax, locked baselines, required-contract coverage,
and supported invariants. Run it locally and in CI.

`check --changed` focuses validation on contracts changed since the Drift index.
Add `--git-base <ref>` in PR workflows to check files changed since a branch.

`coverage` reports how many contracts exist and which required files are still
missing contracts. Use `--json` for agent-readable output.

`diff --summary` summarizes contract changes for review. It is useful before a
PR or before accepting an intentional contract change.

`explain [contract-id]` turns current failures into actionable diagnostics. Use
`--json` when CI or an agent needs stable fields.

`accept <contract-id> --reason "..."` records an intentional locked contract
change. The reason must be explicit and should describe the product decision.

`skills list` shows bundled DriftLock agent skills. `skills install --provider
openai|claude|cursor` installs them for your agent environment.

For the AI-assisted workflow, run context before planning:

```bash
drift-lock context --task "add yearly billing plan"
```

Then plan and implement against the listed constraints, and finish with
`drift-lock diff --summary` plus `drift-lock check`.

For a PR workflow, run:

```bash
drift-lock diff --summary
drift-lock check --changed
drift-lock diff --summary --git-base origin/main
drift-lock check --changed --git-base origin/main
drift-lock accept billing.create-checkout-session --reason "Intentional billing contract change"
```

Use `accept` only for intentional locked contract changes with a clear product
reason. Add `--git-base <ref>` in PR workflows when you want Drift to focus on
files changed since a Git base instead of the whole extracted index.

When a check fails, run:

```bash
drift-lock explain
drift-lock explain billing.create-checkout-session
drift-lock explain --json
```

Use `--json` when an agent or CI step needs stable diagnostic fields such as the
contract id, invariant, sink, reason, found expression, and suggested fix.

## Configuration

DriftLock reads `.drift/config.json`:

```json
{
  "version": 1,
  "source": "src",
  "index": ".drift/contracts.generated.json",
  "requireContracts": [
    "src/features/**/actions.ts",
    "src/services/**/*.ts"
  ],
  "adoption": {
    "mode": "warn"
  }
}
```

`source` may also be an array for monorepos that need to scan multiple package
source roots without including tests or fixtures.

Source discovery honors a project-root `.driftignore` when present; otherwise it
falls back to `.gitignore`. The two files are not merged. DriftLock always
ignores internal state, build, and dependency directories such as `.git`,
`.drift`, `.next`, `dist`, and `node_modules`.

`requireContracts` is optional and defaults to `[]`. When set, `drift-lock check`
reports `DRIFT015_REQUIRED_CONTRACT_MISSING` for matching source files that do
not contain any valid `@drift` contract. `adoption.mode` controls whether those
required-contract gaps are reported as `audit`, `warn`, or blocking `enforce`
diagnostics; other Drift violations remain blocking. You can also override it for
a single check with `drift-lock check --adoption-mode warn`. Use `drift-lock coverage`
to review required files that are still uncovered before turning patterns into
blocking CI policy. See `docs/config.md` for the config reference.

`coverage` also reports local disable directives so adoption exceptions stay
visible without changing check behavior yet:

```ts
// drift-lock-disable-next-line drift/ssot-flow -- reason: migration billing-v2, expires: 2026-07-01
// drift-lock-disable-file drift/import-boundary -- reason: generated adapter
```

Disable directives are reporting-only in this release; malformed or expired
directives are listed by `drift-lock coverage` but do not affect exit codes.

## ESLint

DriftLock ships an ESLint 9 flat config plugin:

```js
import driftLock from '@drift-lock/eslint-plugin';

export default [
  {
    plugins: { 'drift-lock': driftLock },
    rules: {
      ...driftLock.configs.recommended.rules,
    },
  },
];
```

The recommended config enables:

```txt
drift-lock/valid-contract
drift-lock/no-locked-contract-change
drift-lock/ssot-usage
drift-lock/ssot-flow
```

## CI

Generate a GitHub Actions workflow during install:

```bash
npx --yes @drift-lock/cli@latest install --ci github
```

Or add the checks manually:

```bash
drift-lock check
eslint .
```

## What DriftLock Catches

DriftLock V1 catches supported forms of:

- invalid `@drift` contract syntax or schema
- locked contract changes without explicit acceptance
- missing usage of declared sources of truth
- return fields or nested return paths that no longer derive from a declared source of truth

The practical failure mode is simple: if an agent replaces a declared pricing
source with a hardcoded local object, `drift-lock check` can fail before that
change merges.

## V1 Limits

V1 is intentionally narrow:

- TypeScript and TSX files
- contracts written as `/* @drift */` block comments
- `scope: file` for context, locked baselines, and `drift/ssot-usage`
- `scope: declaration` for function-level flow checks
- `stability: draft` and `stability: locked`
- `drift/ssot-usage`
- `drift/ssot-flow` for declaration-scoped function return-object flows with explicit `return.<path>` sinks

`drift/ssot-flow` does not try to prove arbitrary program correctness. Complex
helpers, mutations, spreads, collections, and callback-heavy flows may be
unsupported in V1 and should fail clearly rather than create a false sense of
safety. `drift/ssot-flow` is rejected on `scope: file` contracts.

## Packages

```txt
@drift-lock/cli            CLI and installer
@drift-lock/core           Parser, extractor, context, and checks
@drift-lock/eslint-plugin  ESLint 9 flat config plugin
```

## Demo

This repo includes a small Next.js demo that shows the main V1 proof:

```bash
pnpm --filter next-v1 drift-lock:context
pnpm --filter next-v1 drift-lock:check
pnpm --filter next-v1 lint
```

See [apps/next-v1/README.md](./apps/next-v1/README.md) for the full scenario.

## Philosophy

DriftLock is complementary to rule files such as `AGENTS.md`, `CLAUDE.md`,
Cursor rules, or provider-specific instructions. Those files describe global
team preferences and workflows. DriftLock targets a different layer: local
product and engineering intent attached to code that carries risk.

The difference is enforcement. A rule file can tell an agent what to do. A
DriftLock contract can be extracted into context and then checked
deterministically, so the codebase can fail when a critical invariant is
silently bypassed.

## Local Development

Install dependencies:

```bash
pnpm install
```

Build and verify the workspace:

```bash
pnpm build
pnpm check
pnpm test
```

Run the demo checks:

```bash
pnpm --filter next-v1 drift-lock:context
pnpm --filter next-v1 drift-lock:check
pnpm --filter next-v1 lint
```
