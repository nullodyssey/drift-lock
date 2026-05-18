import { billingSchema } from '@/features/billing/billing.schema';
import { PRO_PRICE_ID } from '@/features/billing/pricing';

/* @drift
version: 1
id: billing.create-checkout-session
scope: declaration
stability: locked

intent: >
  Cree une session Checkout Stripe pour l'abonnement Pro.

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

llm:
  must_not_change:
    - pricing source
    - accepted input shape
    - checkout flow
*/
export async function createCheckoutSession(input: unknown) {
  const payload = billingSchema.parse(input);
  return { payload, price: PRO_PRICE_ID };
}
