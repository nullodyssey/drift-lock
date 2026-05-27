import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractContracts, toIndex, writeIndexStore } from '@drift-lock/core';
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
    await writeIndexStore(root, undefined, toIndex(extracted.contracts));

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
    await writeIndexStore(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/a.ts'),
      validActionsSource('billing.a').replace('the Pro subscription.', 'the Team subscription.'),
      'utf8',
    );

    const run = await prepareCheckRun({ root, changedOnly: true });

    expect(run.contractsToCheck.map((contract) => contract.id)).toEqual(['billing.a']);
  });

  it('keeps imported helper contracts during Git-scoped runs', async () => {
    const helperBackedActionsSource = validActionsSource('billing.actions')
      .replace("import { billingSchema } from '@/features/billing/billing.schema';", "import { validateCheckoutInput } from './helper';")
      .replace('const payload = billingSchema.parse(input);', 'const payload = validateCheckoutInput(input);');
    const root = await createProject({
      'src/actions.ts': helperBackedActionsSource,
      'src/helper.ts': schemaOnlySource('billing.helper'),
    });
    const extracted = await extractContracts({ root });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      helperBackedActionsSource.replace('the Pro subscription.', 'the Team subscription.'),
      'utf8',
    );

    const run = await prepareCheckRun({ root, changedOnly: true, gitBase: 'HEAD' });

    expect(run.scopedIndex?.contracts.map((contract) => contract.id)).toEqual(['billing.actions']);
    expect(run.contractsToCheck.map((contract) => contract.id)).toEqual(['billing.actions']);
    expect(run.helperContracts.map((contract) => contract.id).sort()).toEqual(['billing.actions', 'billing.helper']);
  });

  it('keeps alias-imported helper contracts during Git-scoped runs', async () => {
    const helperBackedActionsSource = validActionsSource('billing.actions')
      .replace("import { billingSchema } from '@/features/billing/billing.schema';", "import { validateCheckoutInput } from '@/helper';")
      .replace('const payload = billingSchema.parse(input);', 'const payload = validateCheckoutInput(input);');
    const root = await createProject({
      'src/actions.ts': helperBackedActionsSource,
      'src/helper.ts': schemaOnlySource('billing.helper'),
    });
    const extracted = await extractContracts({ root, sourceDir: 'src' });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts), { sourceDir: 'src' });
    await createGitBaseline(root);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      helperBackedActionsSource.replace('the Pro subscription.', 'the Team subscription.'),
      'utf8',
    );

    const run = await prepareCheckRun({ root, changedOnly: true, gitBase: 'HEAD', sourceDir: 'src' });

    expect(run.contractsToCheck.map((contract) => contract.id)).toEqual(['billing.actions']);
    expect(run.helperContracts.map((contract) => contract.id).sort()).toEqual(['billing.actions', 'billing.helper']);
  });

  it('keeps alias-imported helper contracts with a repo-root source directory', async () => {
    const helperBackedActionsSource = validActionsSource('billing.actions')
      .replace("import { billingSchema } from '@/features/billing/billing.schema';", "import { validateCheckoutInput } from '@/helper';")
      .replace('const payload = billingSchema.parse(input);', 'const payload = validateCheckoutInput(input);');
    const root = await createProject({
      'actions.ts': helperBackedActionsSource,
      'helper.ts': schemaOnlySource('billing.helper'),
    });
    const extracted = await extractContracts({ root, sourceDir: '.' });
    await writeIndexStore(root, undefined, toIndex(extracted.contracts), { sourceDir: '.' });
    await createGitBaseline(root);
    await writeFile(
      path.join(root, 'actions.ts'),
      helperBackedActionsSource.replace('the Pro subscription.', 'the Team subscription.'),
      'utf8',
    );

    const run = await prepareCheckRun({ root, changedOnly: true, gitBase: 'HEAD', sourceDir: '.' });

    expect(run.contractsToCheck.map((contract) => contract.id)).toEqual(['billing.actions']);
    expect(run.helperContracts.map((contract) => contract.id).sort()).toEqual(['billing.actions', 'billing.helper']);
  });
});
