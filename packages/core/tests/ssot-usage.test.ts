import { describe, expect, it } from 'vitest';
import { checkSsotUsage, extractContractsFromSource } from '@drift-lock/core';
import { validActionsSource } from './helpers/contract-fixtures.js';

describe('drift ssot usage rule', () => {
  it('reports a violation when required SSOT imports are absent', () => {
    const text = validActionsSource().replace(`import { PRO_PRICE_ID } from '@/features/billing/pricing';\n`, '');
    const contract = extractContractsFromSource('src/actions.ts', text).contracts[0];

    expect(checkSsotUsage(contract!, text)).toEqual([
      expect.objectContaining({
        code: 'DRIFT010_SSOT_NOT_USED',
        contractId: 'billing.create-checkout-session',
        details: expect.objectContaining({ ssotKey: 'pricing' }),
      }),
    ]);
  });

  it('passes when anchored code references the declared SSOT', () => {
    const text = validActionsSource();
    const contract = extractContractsFromSource('src/actions.ts', text).contracts[0];

    expect(checkSsotUsage(contract!, text)).toEqual([]);
  });

  it('accepts NodeNext .js imports for .ts SSOT paths', () => {
    const text = validActionsSource()
      .replace(`ssot:\n  pricing: "@/features/billing/pricing.ts"`, `ssot:\n  pricing: "./pricing.ts"`)
      .replace("import { PRO_PRICE_ID } from '@/features/billing/pricing';", "import { PRO_PRICE_ID } from './pricing.js';");
    const contract = extractContractsFromSource('src/actions.ts', text).contracts[0];

    expect(checkSsotUsage(contract!, text)).toEqual([]);
  });

  it('accepts NodeNext imports for Windows-like SSOT paths', () => {
    const text = validActionsSource()
      .replace(`ssot:\n  pricing: "@/features/billing/pricing.ts"`, String.raw`ssot:
  pricing: '.\pricing.ts'`)
      .replace("import { PRO_PRICE_ID } from '@/features/billing/pricing';", "import { PRO_PRICE_ID } from './pricing.js';");
    const contract = extractContractsFromSource('src/actions.ts', text).contracts[0];

    expect(checkSsotUsage(contract!, text)).toEqual([]);
  });
});
