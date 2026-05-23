import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractContracts, toIndex, writeIndex } from '@drift-lock/core';
import { prepareCheckRun } from '../src/core/check-run.js';
import { createGitBaseline, createProject } from './helpers/core-test-utils.js';
import { schemaOnlySource, validActionsSource } from './helpers/contract-fixtures.js';

describe('drift check run preparation', () => {
  it('preserves configured files and full scoped index without a Git base', async () => {
    const root = await createProject({
      'src/a.ts': validActionsSource('billing.a'),
      'src/b.ts': validActionsSource('billing.b'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));

    const run = await prepareCheckRun({ root, files: ['src/a.ts'] });

    expect(run.extractFiles).toEqual(['src/a.ts']);
    expect(run.extracted.contracts.map((contract) => contract.id)).toEqual(['billing.a']);
    expect(run.scopedIndex?.contracts.map((contract) => contract.id)).toEqual(['billing.a', 'billing.b']);
  });

  it('selects only changed contracts when changedOnly is enabled', async () => {
    const root = await createProject({
      'src/a.ts': validActionsSource('billing.a'),
      'src/b.ts': validActionsSource('billing.b'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/a.ts'),
      validActionsSource('billing.a').replace('the Pro subscription.', 'the Team subscription.'),
      'utf8',
    );

    const run = await prepareCheckRun({ root, changedOnly: true });

    expect(run.contractsToCheck.map((contract) => contract.id)).toEqual(['billing.a']);
  });

  it('keeps helper contracts from the full index during Git-scoped runs', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource('billing.actions'),
      'src/helper.ts': schemaOnlySource('billing.helper'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource('billing.actions').replace('the Pro subscription.', 'the Team subscription.'),
      'utf8',
    );

    const run = await prepareCheckRun({ root, changedOnly: true, gitBase: 'HEAD' });

    expect(run.scopedIndex?.contracts.map((contract) => contract.id)).toEqual(['billing.actions']);
    expect(run.contractsToCheck.map((contract) => contract.id)).toEqual(['billing.actions']);
    expect(run.helperContracts.map((contract) => contract.id)).toEqual(['billing.actions', 'billing.helper']);
  });
});
