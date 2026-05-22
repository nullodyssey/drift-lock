export function validActionsSource(id = 'billing.create-checkout-session'): string {
  return `import { billingSchema } from '@/features/billing/billing.schema';
import { PRO_PRICE_ID } from '@/features/billing/pricing';

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
`;
}

export function reorderActionInvariantBlocks(source: string): string {
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

export function fileScopedUsageSource(): string {
  return `import { PRO_PRICE_ID } from '@/features/billing/pricing';

/* @drift
version: 1
id: billing.module-boundary
scope: file
stability: locked

intent: >
  Keep this billing module wired to the declared pricing source of truth.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing
*/
export const price = PRO_PRICE_ID;
`;
}

export function schemaOnlySource(id = 'billing.schema-only'): string {
  return `import { billingSchema } from '@/features/billing/billing.schema';

/* @drift
version: 1
id: ${id}
scope: declaration
stability: locked

intent: >
  Validate checkout input using the billing schema.

ssot:
  schema: "@/features/billing/billing.schema.ts"

invariants:
  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema
*/
export function validateCheckoutInput(input: unknown) {
  return billingSchema.parse(input);
}
`;
}
