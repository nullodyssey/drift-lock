'use server';

import { parseCheckoutInput } from '@/features/billing/billing.schema';
import { BILLING_PRICES } from '@/features/billing/pricing';

/* @drift
version: 1
id: billing.create-checkout-quote
scope: declaration
stability: locked

intent: >
  Create a nested checkout quote while proving every branch derives billing amounts from pricing.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: checkout-quote-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.lineItem.price.id
      - return.lineItem.price.currency
      - return.totals.monthly.amount

llm:
  must_not_change:
    - pricing source
    - nested quote totals
    - branch return provenance
*/
export async function createCheckoutQuote(input: unknown) {
  const payload = parseCheckoutInput(input);

  if (payload.seats >= 10) {
    const price = BILLING_PRICES[payload.plan];
    const amount = price.monthlyAmount * payload.seats;

    return {
      lineItem: {
        price: {
          id: price.priceId,
          currency: price.currency,
        },
      },
      totals: {
        monthly: {
          amount,
        },
      },
    };
  }

  const price = BILLING_PRICES[payload.plan];
  const amount = price.monthlyAmount * payload.seats;

  return {
    lineItem: {
      price: {
        id: price.priceId,
        currency: price.currency,
      },
    },
    totals: {
      monthly: {
        amount,
      },
    },
  };
}
