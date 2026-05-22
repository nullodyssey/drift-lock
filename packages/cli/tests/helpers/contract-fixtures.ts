export function missingSinkSource(id = 'billing.create-checkout-session'): string {
  return validFlowSource(id).replace('amount: price.monthlyAmount,', 'total: price.monthlyAmount,');
}

export function hardcodedSinkSource(id = 'billing.create-checkout-session'): string {
  return validFlowSource(id).replace('priceId: price.priceId,', "priceId: 'price_hardcoded',");
}

export function validFlowSource(id = 'billing.create-checkout-session'): string {
  return `import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a checkout response while proving return values come from pricing.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
      - return.amount
*/
export function createCheckoutSession(input: { plan: 'pro' }) {
  const price = BILLING_PRICES[input.plan];
  return {
    priceId: price.priceId,
    amount: price.monthlyAmount,
  };
}
`;
}

export function validUsageSource(id = 'billing.create-checkout-session'): string {
  return `import { PRO_PRICE_ID } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a Stripe Checkout session for the Pro subscription.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing
*/
export function createCheckoutSession() {
  return { price: PRO_PRICE_ID };
}
`;
}

export function dualInvariantUsageSource(id = 'billing.create-checkout-session'): string {
  return `import { PRO_PRICE_ID } from '@/features/billing/pricing';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Create a Stripe Checkout session for the Pro subscription.

ssot:
  pricing: "@/features/billing/pricing.ts"
  schema: "@/features/billing/billing.schema.ts"

invariants:
  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing
  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema
*/
export function createCheckoutSession() {
  return { price: PRO_PRICE_ID };
}
`;
}

export function reorderInvariantBlocks(source: string): string {
  return source.replace(
    `  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing
  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema`,
    `  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema
  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing`,
  );
}
