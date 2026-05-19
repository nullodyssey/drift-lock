export const BILLING_PRICES = {
  pro: {
    planName: 'Pro',
    priceId: 'price_pro_contract_locked',
    monthlyAmount: 4900,
    currency: 'eur',
  },
} as const;

export type BillingPlan = keyof typeof BILLING_PRICES;
