import { describe, expect, it } from 'vitest';
import { checkSsotUsage, extractContractsFromSource } from '@drift-lock/core';
import { fileScopedUsageSource, validActionsSource } from './helpers/contract-fixtures.js';

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

  it('does not count a SSOT literal that starts at the declaration anchor end', () => {
    const text = `/* @drift
version: 1
id: billing.inline-boundary
scope: declaration
stability: locked

intent: >
  Keep the declared value wired to pricing.

ssot:
  pricing: "@/features/billing/pricing.ts"

invariants:
  - id: uses-pricing-ssot
    enforce: drift/ssot-usage
    ssot: pricing
*/
export const price = 'local';'@/features/billing/pricing';
`;
    const contract = extractContractsFromSource('src/actions.ts', text).contracts[0];

    expect(checkSsotUsage(contract!, text)).toEqual([
      expect.objectContaining({
        code: 'DRIFT010_SSOT_NOT_USED',
        contractId: 'billing.inline-boundary',
        details: expect.objectContaining({ ssotKey: 'pricing' }),
      }),
    ]);
  });

  it('does not count file-scoped @drift YAML as SSOT usage', () => {
    const text = fileScopedUsageSource()
      .replace(`import { PRO_PRICE_ID } from '@/features/billing/pricing';\n\n`, '')
      .replace('export const price = PRO_PRICE_ID;', "export const price = 'price_pro';");
    const contract = extractContractsFromSource('src/actions.ts', text).contracts[0];

    expect(checkSsotUsage(contract!, text)).toEqual([
      expect.objectContaining({
        code: 'DRIFT010_SSOT_NOT_USED',
        contractId: 'billing.module-boundary',
        details: expect.objectContaining({ ssotKey: 'pricing' }),
      }),
    ]);
  });

  it('passes file-scoped contracts when the code imports the declared SSOT', () => {
    const text = fileScopedUsageSource();
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
