import { describe, expect, it } from 'vitest';
import type { CheckRunContext } from '../src/core/check-run.js';
import { extractContractsFromSource } from '../src/core/extractor.js';
import { runInvariantChecks } from '../src/core/invariant-checks.js';
import { SourceCache } from '../src/core/source-cache.js';

describe('drift invariant checks', () => {
  it('reads source text once for multiple selected contracts in the same file', async () => {
    const text = `import { PRO_PRICE_ID } from './pricing';

/* @drift
version: 1
id: billing.first
scope: declaration
stability: locked

intent: >
  Keep the first checkout path wired to pricing.

ssot:
  pricing: "./pricing.ts"

invariants:
  - id: uses-pricing
    enforce: drift/ssot-usage
    ssot: pricing
*/
export function firstCheckout() {
  return PRO_PRICE_ID;
}

/* @drift
version: 1
id: billing.second
scope: declaration
stability: locked

intent: >
  Keep the second checkout path wired to pricing.

ssot:
  pricing: "./pricing.ts"

invariants:
  - id: uses-pricing
    enforce: drift/ssot-usage
    ssot: pricing
*/
export function secondCheckout() {
  return PRO_PRICE_ID;
}
`;
    const extracted = extractContractsFromSource('src/actions.ts', text);
    let reads = 0;
    const sourceCache = new SourceCache('/repo', async () => {
      reads += 1;
      return text;
    });
    const run = {
      root: '/repo',
      options: { root: '/repo' },
      extracted,
      contractsToCheck: extracted.contracts,
      helperContracts: [],
      sourceCache,
    } as CheckRunContext;

    await expect(runInvariantChecks(run)).resolves.toEqual([]);
    expect(reads).toBe(1);
  });
});
