import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeAcceptanceFile } from '@drift-lock/core';
import { isAcceptanceForContract, parseAcceptanceFile, serializeAcceptanceFile } from '../src/core/acceptance-file.js';
import { isValidContractId } from '../src/core/validator.js';
import { createProject } from './helpers/core-test-utils.js';

describe('drift acceptance files', () => {
  it('serializes and parses acceptance files through one exact format', () => {
    const content = serializeAcceptanceFile({
      contractId: 'billing.create-checkout-session',
      reason: '  Product change accepted by the billing owner.  ',
    });

    expect(content).toBe('contract: billing.create-checkout-session\nreason: Product change accepted by the billing owner.\n');
    expect(parseAcceptanceFile(content)).toEqual({
      valid: true,
      contractId: 'billing.create-checkout-session',
      reason: 'Product change accepted by the billing owner.',
    });
    expect(isAcceptanceForContract(content, 'billing.create-checkout-session')).toBe(true);
    expect(isAcceptanceForContract(content, 'billing.other-contract')).toBe(false);
  });

  it.each([
    ['missing contract', 'reason: Product change accepted by the billing owner.\n', 'missing-contract'],
    ['missing reason', 'contract: billing.create-checkout-session\n', 'missing-reason'],
    ['short reason', 'contract: billing.create-checkout-session\nreason: too short\n', 'short-reason'],
    ['invalid contract id', 'contract: billing\\escape\nreason: Product change accepted by the billing owner.\n', 'invalid-contract-id'],
  ])('reports malformed acceptance files with %s', (_name, content, issue) => {
    expect(parseAcceptanceFile(content)).toMatchObject({ valid: false, issue });
    expect(isAcceptanceForContract(content, 'billing.create-checkout-session')).toBe(false);
  });

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
