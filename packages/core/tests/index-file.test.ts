import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractContracts, toIndex, writeIndex } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';
import { validActionsSource } from './helpers/contract-fixtures.js';
import { validFlowSource } from './helpers/flow-fixtures.js';

describe('drift index files', () => {
  it('writes a stable index without generatedAt', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    const index = await readFile(path.join(root, '.drift/contracts.generated.json'), 'utf8');
    expect(index).not.toContain('generatedAt');
    expect(JSON.parse(index).contracts[0]).not.toHaveProperty('raw');
    expect(JSON.parse(index).contracts[0].bodyHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('writes derived ssot-flow summaries for indexed helper contracts', async () => {
    const root = await createProject({ 'src/actions.ts': validFlowSource() });
    const extracted = await extractContracts({ root });
    const index = toIndex(extracted.contracts);

    expect(index.contracts[0]?.summaries).toEqual({
      ssotFlow: [
        {
          ssotPath: '@/features/billing/pricing.ts',
          returns: ['return.amount', 'return.currency', 'return.priceId'],
        },
      ],
    });
  });
});
