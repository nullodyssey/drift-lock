'use server';

import { parseCheckoutInput } from '@/features/billing/billing.schema';
import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
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
    checkoutUrl: `https://checkout.example.test/${price.priceId}?seats=${payload.seats}`,
    priceId: price.priceId,
    amount: price.monthlyAmount * payload.seats,
    currency: price.currency,
  };
}
