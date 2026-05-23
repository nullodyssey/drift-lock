import type { BillingPlan } from './pricing';

export type CheckoutInput = {
  plan: BillingPlan;
  seats: number;
};

export function isCheckoutInput(input: unknown): input is CheckoutInput {
  if (typeof input !== 'object' || input === null) return false;
  const candidate = input as Record<string, unknown>;
  return candidate.plan === 'pro' && typeof candidate.seats === 'number' && candidate.seats >= 1;
}
