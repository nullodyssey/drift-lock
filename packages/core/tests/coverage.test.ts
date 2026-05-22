import { describe, expect, it } from 'vitest';
import { getCoverage } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';
import { validActionsSource } from './helpers/contract-fixtures.js';

describe('drift coverage', () => {
  it('reports Drift coverage for required files and invariants', async () => {
    const root = await createProject({
      'src/features/billing/actions.ts': validActionsSource('billing.actions'),
      'src/features/billing/pricing.ts': 'export const PRO_PRICE_ID = "price_pro";\n',
      'src/services/payment.ts': 'export function pay() { return true; }\n',
    });

    const result = await getCoverage({
      root,
      requireContracts: ['src/features/**/actions.ts', 'src/services/**/*.ts'],
    });

    expect(result.errors).toEqual([]);
    expect(result.coverage).toMatchObject({
      contracts: { total: 1, locked: 1, draft: 0 },
      files: {
        source: 3,
        withContracts: 1,
        requiringContracts: 2,
        requiredCovered: 1,
        requiredUncovered: 1,
        requiredUncoveredFiles: ['src/services/payment.ts'],
      },
      invariants: { total: 2, executable: 2 },
    });
  });
});
