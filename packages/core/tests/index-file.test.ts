import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractContracts, toIndex, writeIndex } from '@drift-lock/core';
import { readIndex } from '../src/core/index-file.js';
import { createProject } from './helpers/core-test-utils.js';
import { validActionsSource } from './helpers/contract-fixtures.js';
import { validFlowSource } from './helpers/flow-fixtures.js';

describe('drift index files', () => {

  it('returns undefined when the index file is absent', async () => {
    const root = await createProject({});

    await expect(readIndex(root)).resolves.toBeUndefined();
  });

  it('reads an index written by writeIndex', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    const expected = toIndex(extracted.contracts);
    await writeIndex(root, undefined, expected);

    await expect(readIndex(root)).resolves.toEqual(expected);
  });

  it.each([
    ['invalid JSON', '{'],
    ['root array', JSON.stringify([])],
    ['invalid version', JSON.stringify({ version: 2, contracts: [] })],
    ['missing contracts', JSON.stringify({ version: 1 })],
    ['contracts not array', JSON.stringify({ version: 1, contracts: {} })],
    ['incomplete contract', JSON.stringify({ version: 1, contracts: [{ id: 'billing.create-checkout-session' }] })],
    [
      'invalid hash',
      JSON.stringify({
        version: 1,
        contracts: [
          {
            version: 1,
            id: 'billing.create-checkout-session',
            scope: 'declaration',
            stability: 'locked',
            intent: 'Create a checkout session.',
            file: 'src/actions.ts',
            anchor: { type: 'function', name: 'createCheckoutSession' },
            contentHash: 'not-a-hash',
            bodyHash: 'sha256:15b52de4c8fa607a5bad35d18b829d176e50314769e96216fa4b7cc426d6b370',
          },
        ],
      }),
    ],
    [
      'invalid anchor',
      JSON.stringify({
        version: 1,
        contracts: [
          {
            version: 1,
            id: 'billing.create-checkout-session',
            scope: 'declaration',
            stability: 'locked',
            intent: 'Create a checkout session.',
            file: 'src/actions.ts',
            anchor: { type: 'file', name: 'createCheckoutSession' },
            contentHash: 'sha256:f0410a0087dc61a2931ac521819ee856caade7aca31feeb4f25a1073fa3e9afc',
            bodyHash: 'sha256:15b52de4c8fa607a5bad35d18b829d176e50314769e96216fa4b7cc426d6b370',
          },
        ],
      }),
    ],
  ])('rejects %s indexes', async (_name, index) => {
    const root = await createProject({});
    await writeRawIndex(root, index);

    await expect(readIndex(root)).rejects.toThrow(/Invalid Drift contracts index/);
  });

  it('writes a stable index without generatedAt', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    const index = await readFile(path.join(root, '.drift/contracts.generated.json'), 'utf8');
    expect(index).not.toContain('generatedAt');
    expect(index.endsWith('\n')).toBe(true);
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

async function writeRawIndex(root: string, index: string): Promise<void> {
  await mkdir(path.join(root, '.drift'), { recursive: true });
  await writeFile(path.join(root, '.drift/contracts.generated.json'), index, 'utf8');
}
