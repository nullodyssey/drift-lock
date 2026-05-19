const driftMarker = '/* @' + 'drift';

export const demoContract = `${driftMarker}
version: 1
id: billing.create-checkout-session
scope: declaration
stability: locked

intent: >
  Cree une session Checkout pour l'abonnement Pro en respectant les sources de verite billing.

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

export async function createCheckoutSession(input: unknown) {
  const payload = parseCheckoutInput(input);

  return {
    checkoutUrl: \`https://checkout.example.test/price_local_hotfix?seats=\${payload.seats}\`,
    priceId: 'price_local_hotfix',
    amount: 3900 * payload.seats,
    currency: 'eur',
  };
}`;

export const driftOutput = `DRIFT010: Contract "billing.create-checkout-session" requires ssot "pricing" but the anchored code does not reference "@/features/billing/pricing.ts".

DRIFT011: Locked @drift contract "billing.create-checkout-session" changed without explicit acceptance.`;

export const contextOutput = `Relevant Drift Contracts

- billing.create-checkout-session
  scope: declaration
  stability: locked
  intent: Cree une session Checkout pour l'abonnement Pro en respectant les sources de verite billing.
  ssot:
    pricing: @/features/billing/pricing.ts
    schema: @/features/billing/billing.schema.ts
  must_not_change:
    - pricing source
    - accepted input shape
    - checkout flow`;
