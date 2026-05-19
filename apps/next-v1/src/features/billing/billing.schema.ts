import type { BillingPlan } from './pricing';

export type CheckoutInput = {
  plan: BillingPlan;
  seats: number;
};

export function parseCheckoutInput(input: unknown): CheckoutInput {
  if (!isCheckoutInput(input)) {
    throw new Error('Invalid checkout input');
  }

  return input;
}

function isCheckoutInput(input: unknown): input is CheckoutInput {
  if (typeof input !== 'object' || input === null) return false;
  const candidate = input as Record<string, unknown>;
  return candidate.plan === 'pro' && typeof candidate.seats === 'number' && candidate.seats >= 1;
}
