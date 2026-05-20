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
- `drift-lock context` gives agents the relevant contract before they edit.
- `drift-lock check` validates supported invariants in CI.
- `eslint-plugin-drift-lock` brings the same feedback into the developer loop.

DriftLock does not replace tests or code review. It adds a deterministic layer
for the local product and engineering intent that agents often miss.

## Install

Install DriftLock into a TypeScript project:

```bash
npx drift-lock install
```

Useful install options:

```bash
npx drift-lock install --source src
npx drift-lock install --ci github
npx drift-lock install --agent openai
npx drift-lock install --dry-run
```

The installer adds DriftLock scripts, creates `.drift/config.json`, generates a
contract index, and can configure ESLint and GitHub Actions when requested.

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
drift-lock context <file>
drift-lock extract
drift-lock check
drift-lock skills list
drift-lock skills install --provider openai
```

`context` renders contract-aware context for agents. `extract` updates the
committed contract index. `check` validates contracts, locked baselines, and
supported invariants.

## ESLint

DriftLock ships an ESLint 9 flat config plugin:

```js
import driftLock from 'eslint-plugin-drift-lock';

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
npx drift-lock install --ci github
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
- return fields that no longer derive from a declared source of truth

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
- `drift/ssot-flow` for simple declaration-scoped function return-object flows

`drift/ssot-flow` does not try to prove arbitrary program correctness. Complex
helpers, mutations, spreads, deep object paths, collections, and branch-heavy
flows may be unsupported in V1 and should fail clearly rather than create a
false sense of safety. `drift/ssot-flow` is rejected on `scope: file` contracts.

## Packages

```txt
drift-lock                 CLI and installer
@drift-lock/core           Parser, extractor, context, and checks
eslint-plugin-drift-lock   ESLint 9 flat config plugin
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
