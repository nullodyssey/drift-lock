import { describe, expect, it } from 'vitest';
import type { CheckRunContext } from '../src/core/check-run.js';
import { checkRequiredContracts } from '../src/core/required-contracts.js';
import { SourceCache } from '../src/core/source-cache.js';

describe('drift required contracts', () => {
  it('reports required-contract gaps as errors in enforce mode', async () => {
    const diagnostics = await checkRequiredContracts(requiredRun('enforce'));

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'DRIFT015_REQUIRED_CONTRACT_MISSING',
        severity: 'error',
        file: 'src/features/billing/actions.ts',
        details: expect.objectContaining({ pattern: 'src/features/**/actions.ts' }),
      }),
    ]);
  });

  it('reports required-contract gaps as warnings in warn mode', async () => {
    const diagnostics = await checkRequiredContracts(requiredRun('warn'));

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'DRIFT015_REQUIRED_CONTRACT_MISSING',
        severity: 'warning',
        details: expect.objectContaining({ pattern: 'src/features/**/actions.ts' }),
      }),
    ]);
  });

  it('reports required-contract gaps as info in audit mode', async () => {
    const diagnostics = await checkRequiredContracts(requiredRun('audit'));

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'DRIFT015_REQUIRED_CONTRACT_MISSING',
        severity: 'info',
        details: expect.objectContaining({ pattern: 'src/features/**/actions.ts' }),
      }),
    ]);
  });
});

function requiredRun(adoptionMode: 'audit' | 'warn' | 'enforce'): CheckRunContext {
  return {
    root: '/repo',
    options: {
      root: '/repo',
      requireContracts: ['src/features/**/actions.ts'],
      adoptionMode,
    },
    extractFiles: ['src/features/billing/actions.ts'],
    extracted: {
      contracts: [],
      errors: [],
    },
    contractsToCheck: [],
    helperContracts: [],
    sourceCache: new SourceCache('/repo'),
  };
}
