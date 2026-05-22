import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidContractId, writeAcceptanceFile } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';

describe('drift acceptance files', () => {
  it('writes acceptance files and protects existing files', async () => {
    const root = await createProject({});
    const first = await writeAcceptanceFile({
      root,
      contractId: 'billing.create-checkout-session',
      reason: 'Product change accepted by the billing owner.',
    });

    await expect(
      writeAcceptanceFile({
        root,
        contractId: 'billing.create-checkout-session',
        reason: 'Product change accepted by the billing owner.',
      }),
    ).rejects.toThrow(/already exists/);
    await expect(
      writeAcceptanceFile({ root, contractId: 'billing.short', reason: 'too short' }),
    ).rejects.toThrow(/at least 20/);

    const content = await readFile(path.join(root, first.path), 'utf8');
    expect(content).toBe('contract: billing.create-checkout-session\nreason: Product change accepted by the billing owner.\n');
    await expect(
      writeAcceptanceFile({
        root,
        contractId: 'billing.create-checkout-session',
        reason: 'Updated product change accepted by owner.',
        force: true,
      }),
    ).resolves.toEqual(first);
  });

  it('rejects unsafe acceptance contract ids before writing files', async () => {
    const root = await createProject({});
    const unsafeIds = ['../../../tmp/foo', '../billing.escape', 'billing/escape', 'billing\\escape', 'billing..escape', 'billing escape'];

    expect(isValidContractId('billing.create-checkout-session')).toBe(true);
    for (const contractId of unsafeIds) {
      expect(isValidContractId(contractId)).toBe(false);
      await expect(
        writeAcceptanceFile({
          root,
          contractId,
          reason: 'Product change accepted by the billing owner.',
        }),
      ).rejects.toThrow(/Invalid contract id/);
    }

    await expect(readFile(path.join(root, '.drift/accepted-contract-changes/../../../tmp/foo.md'), 'utf8')).rejects.toThrow();
  });
});
