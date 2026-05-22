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

  it('reports drift-lock-disable directives from configured source files', async () => {
    const root = await createProject({
      'src/actions.ts': '// drift-lock-disable-next-line drift/ssot-flow -- reason: migration billing-v2, expires: 2999-01-01\nexport const checkoutAction = true;\n',
      'src/legacy.ts': '// drift-lock-disable-file drift/import-boundary -- reason: legacy adapter, expires: 2000-01-01\nexport const legacy = true;\n',
      'src/malformed.ts': '// drift-lock-disable-next-line drift/ssot-flow\nexport const malformed = true;\n',
      'src/examples.ts': 'export const help = "drift-lock-disable-file drift/ssot-flow -- reason: example only";\nexport const docs = `// drift-lock-disable-next-line drift/import-boundary -- reason: docs only`;\n',
      'tests/not-source.ts': '// drift-lock-disable-file drift/ssot-flow -- reason: ignored test fixture\n',
    });

    const result = await getCoverage({ root, sourceDir: 'src' });

    expect(result.errors).toEqual([]);
    expect(result.coverage.disableDirectives).toMatchObject({
      total: 3,
      malformed: 1,
      expired: 1,
      items: [
        {
          file: 'src/actions.ts',
          line: 1,
          kind: 'next-line',
          rule: 'drift/ssot-flow',
          reason: 'migration billing-v2',
          expires: '2999-01-01',
          expired: false,
          malformed: false,
        },
        {
          file: 'src/legacy.ts',
          line: 1,
          kind: 'file',
          rule: 'drift/import-boundary',
          reason: 'legacy adapter',
          expires: '2000-01-01',
          expired: true,
          malformed: false,
        },
        {
          file: 'src/malformed.ts',
          line: 1,
          kind: 'next-line',
          rule: 'drift/ssot-flow',
          expired: false,
          malformed: true,
          message: 'missing reason',
        },
      ],
    });
  });
});
