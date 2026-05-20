const driftMarker = '/* @' + 'drift';

export const demoContract = `${driftMarker}
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
*/`;

export const healthyAction = `import { parseCheckoutInput } from '@/features/billing/billing.schema';
import { BILLING_PRICES } from '@/features/billing/pricing';

export async function createCheckoutSession(input: unknown) {
  const payload = parseCheckoutInput(input);
  const price = BILLING_PRICES[payload.plan];

  return {
    checkoutUrl: \`https://checkout.example.test/\${price.priceId}?seats=\${payload.seats}\`,
    priceId: price.priceId,
    amount: price.monthlyAmount * payload.seats,
    currency: price.currency,
  };
}`;

export const driftedAction = `import { parseCheckoutInput } from '@/features/billing/billing.schema';
import { BILLING_PRICES } from '@/features/billing/pricing';

export async function createCheckoutSession(input: unknown) {
  const payload = parseCheckoutInput(input);
  const price = {
    priceId: 'test',
    monthlyAmount: 10,
    currency: 'USD',
  };

  return {
    checkoutUrl: \`https://checkout.example.test/\${price.priceId}?seats=\${payload.seats}\`,
    priceId: price.priceId,
    amount: price.monthlyAmount * payload.seats,
    currency: price.currency,
  };
}`;

export const driftOutput = `DRIFT013: Contract "billing.create-checkout-session" requires sink "return.priceId" to derive from ssot "pricing".

DRIFT011: Locked @drift contract "billing.create-checkout-session" changed without explicit acceptance.`;

export const contextOutput = `Relevant Drift Contracts

- billing.create-checkout-session
  scope: declaration
  stability: locked
  intent: Create a Checkout session for the Pro subscription while respecting the billing sources of truth.
  ssot:
    pricing: @/features/billing/pricing.ts
    schema: @/features/billing/billing.schema.ts
  must_not_change:
    - pricing source
    - accepted input shape
    - checkout flow`;
