# DriftLock Next V1 Demo

Small Next.js project that demonstrates the V1 promise:

> An AI agent can modify the code, but it cannot silently modify or bypass the local contract.

## What the demo contains

- A critical server action: `src/features/billing/actions.ts`
- A locked `@drift` contract, anchored to `createCheckoutSession`
- A second critical action: `src/features/billing/quote-actions.ts`
- A locked `@drift` contract, anchored to `createCheckoutQuote`
- Two declared sources of truth:
  - `src/features/billing/pricing.ts`
  - `src/features/billing/billing.schema.ts`
- A committed index store: `.drift/contracts.generated.index`
- An ESLint config that enables `@drift-lock/eslint-plugin`

## Useful commands

```bash
pnpm --filter next-v1 dev
pnpm --filter next-v1 drift-lock:context
pnpm --filter next-v1 drift-lock:check
pnpm --filter next-v1 lint
```

## Proof scenario

1. Open `src/features/billing/actions.ts`.
2. Keep the `BILLING_PRICES` import.
3. Replace the line `const price = BILLING_PRICES[payload.plan];` with a local object:

```ts
const price = {
  priceId: 'test',
  monthlyAmount: 10,
  currency: 'USD',
};
```

4. Run:

```bash
pnpm --filter next-v1 drift-lock:check
```

Expected result: DriftLock fails with `DRIFT013_SSOT_FLOW_NOT_PROVEN`.

The `drift/ssot-flow` rule verifies that the declared outputs (`return.priceId`,
`return.amount`, `return.currency`) actually derive from the `pricing` SSOT.
Unlike `drift/ssot-usage`, the import being present is not enough.

## Nested paths + branches scenario

The second action demonstrates the new `drift/ssot-flow` coverage:

```txt
return.lineItem.price.id
return.lineItem.price.currency
return.totals.monthly.amount
```

All return paths must be proven. If a branch returns a local price or amount,
`drift-lock:check` fails with `DRIFT013_SSOT_FLOW_NOT_PROVEN`.

To prove locked contract protection, then change `stability: locked` to `stability: draft`.

Expected result: DriftLock fails with `DRIFT011_LOCKED_CONTRACT_CHANGED`.
