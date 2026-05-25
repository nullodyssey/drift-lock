import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkContracts, extractContracts, toIndex, writeIndex } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';
import { validActionsSource } from './helpers/contract-fixtures.js';

describe('drift locked contracts', () => {
  it('detects locked contract changes against the committed index', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource().replace('the Pro subscription.', 'the Premium subscription.'),
      'utf8',
    );

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT011_LOCKED_CONTRACT_CHANGED');
  });

  it('detects locked contract downgrades against the committed index', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    await writeFile(path.join(root, 'src/actions.ts'), validActionsSource().replace('stability: locked', 'stability: draft'), 'utf8');

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT011_LOCKED_CONTRACT_CHANGED');
  });

  it('detects locked contract removals against the committed index', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    await writeFile(
      path.join(root, 'src/actions.ts'),
      `export async function createCheckoutSession(input: unknown) {
  return { payload: input, price: 'price_pro' };
}
`,
      'utf8',
    );

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT011_LOCKED_CONTRACT_CHANGED');
  });

  it('accepts locked contract changes with a valid acceptance file', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource().replace('the Pro subscription.', 'the Premium subscription.'),
      'utf8',
    );
    await mkdir(path.join(root, '.drift/accepted-contract-changes'), { recursive: true });
    await writeFile(
      path.join(root, '.drift/accepted-contract-changes/billing.create-checkout-session.md'),
      'contract: billing.create-checkout-session\nreason: Product terminology changed intentionally.\n',
      'utf8',
    );

    const result = await checkContracts({ root });
    expect(result.errors).toEqual([]);
  });

  it('reports invalid acceptance files for locked contract changes', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource().replace('the Pro subscription.', 'the Premium subscription.'),
      'utf8',
    );
    await mkdir(path.join(root, '.drift/accepted-contract-changes'), { recursive: true });
    await writeFile(
      path.join(root, '.drift/accepted-contract-changes/billing.create-checkout-session.md'),
      'contract: billing.other-contract\nreason: Product terminology changed intentionally.\n',
      'utf8',
    );

    const result = await checkContracts({ root });
    expect(result.errors.map((error) => error.code)).toContain('DRIFT012_INVALID_ACCEPTANCE_FILE');
  });

  it('keeps locked removals blocking when changedOnly is enabled', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(path.join(root, 'src/actions.ts'), 'export const removed = true;\n', 'utf8');

    const result = await checkContracts({ root, changedOnly: true });

    expect(result.errors.map((error) => error.code)).toContain('DRIFT011_LOCKED_CONTRACT_CHANGED');
  });
});
