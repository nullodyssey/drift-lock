import { describe, expect, it } from 'vitest';
import type { DriftIndexedContract } from '../src/types.js';
import { buildHelperContracts } from '../src/core/helper-summaries.js';

describe('drift helper summaries', () => {
  it('keeps unchanged helper summaries from the full index', () => {
    const helper = indexedContract('billing.resolve-price');
    const current = indexedContract('billing.checkout');

    const result = buildHelperContracts({ version: 1, contracts: [helper] }, [current]);

    expect(result.map((contract) => contract.id)).toEqual(['billing.resolve-price', 'billing.checkout']);
  });

  it('lets current extracted contracts override indexed helper summaries', () => {
    const indexed = indexedContract('billing.resolve-price', './pricing.old.ts');
    const current = indexedContract('billing.resolve-price', './pricing.ts');

    const result = buildHelperContracts({ version: 1, contracts: [indexed] }, [current]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(current);
    expect(result[0]?.summaries?.ssotFlow?.[0]?.ssotPath).toBe('./pricing.ts');
  });
});

function indexedContract(id: string, ssotPath = './pricing.ts'): DriftIndexedContract {
  return {
    version: 1,
    id,
    scope: 'declaration',
    stability: 'locked',
    intent: 'Expose a verified helper summary for ssot-flow.',
    ssot: {
      pricing: ssotPath,
    },
    invariants: [
      {
        id: 'returns-pricing',
        enforce: 'drift/ssot-flow',
        ssot: 'pricing',
        sinks: ['return.priceId'],
      },
    ],
    file: `src/${id}.ts`,
    anchor: { type: 'function', name: id.split('.').at(-1) ?? id },
    contentHash: `sha256:${'a'.repeat(64)}`,
    bodyHash: `sha256:${'b'.repeat(64)}`,
    summaries: {
      ssotFlow: [
        {
          ssotPath,
          returns: ['return.priceId'],
        },
      ],
    },
  };
}
