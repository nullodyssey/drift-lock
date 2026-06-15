import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractContracts,
  formatProofReportJson,
  formatProofReportMarkdown,
  getProofReport,
  toIndex,
  writeIndexStore,
} from '@drift-lock/core';
import { createGitBaseline, createProject } from './helpers/core-test-utils.js';
import { validActionsSource } from './helpers/contract-fixtures.js';
import { validFlowSource } from './helpers/flow-fixtures.js';

describe('drift pull request proof reports', () => {
  it('reports current generated indexes without modifying the committed index store', async () => {
    const root = await createProofProject({
      'src/actions.ts': validFlowSource('billing.changed'),
    });
    const before = await snapshotIndexStore(root);

    const result = await getProofReport({ root, sourceDir: 'src', gitBase: 'HEAD' });

    expect(result.errors).toEqual([]);
    expect(result.report.generatedIndex).toEqual({
      status: 'current',
      changedPaths: [],
    });
    await expect(snapshotIndexStore(root)).resolves.toEqual(before);
  });

  it('reports dirty generated indexes with repo-relative changed paths without writing the index store', async () => {
    const root = await createProofProject({
      'src/actions.ts': validFlowSource('billing.changed'),
    });
    const before = await snapshotIndexStore(root);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('amount: price.monthlyAmount * payload.seats,', 'amount: price.monthlyAmount * payload.seats * 2,'),
      'utf8',
    );

    const result = await getProofReport({ root, sourceDir: 'src', gitBase: 'HEAD' });

    expect(result.report.generatedIndex.status).toBe('dirty');
    expect(result.report.generatedIndex.changedPaths).toEqual(expect.arrayContaining([
      '.drift/contracts.generated.index/manifest.json',
      expect.stringMatching(/^\.drift\/contracts\.generated\.index\/by-contract\/[a-f0-9]{2}\.ndjson$/),
    ]));
    await expect(snapshotIndexStore(root)).resolves.toEqual(before);
  });

  it('reports body-only protected contract changes as preserved', async () => {
    const root = await createProofProject({
      'src/actions.ts': validFlowSource('billing.changed'),
    });
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('amount: price.monthlyAmount * payload.seats,', 'amount: (price.monthlyAmount * payload.seats),'),
      'utf8',
    );

    const result = await getProofReport({ root, sourceDir: 'src', gitBase: 'HEAD' });
    const outcome = result.report.outcomes[0];

    expect(result.errors).toEqual([]);
    expect(outcome).toMatchObject({
      contractId: 'billing.changed',
      resolution: 'preserved',
      changeKind: 'changed',
      fields: ['body'],
      acceptance: { status: 'not_required' },
    });
    expect(result.report.summary).toMatchObject({
      protectedContractsTouched: 1,
      currentViolations: 0,
      intentPreservationRate: 1,
    });
    expect(result.report.generatedIndex.status).toBe('dirty');
  });

  it('reports accepted locked contract text changes as explicit changes', async () => {
    const root = await createProofProject({
      'src/actions.ts': validFlowSource('billing.changed'),
    });
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('Create a Stripe Checkout session for the Pro subscription.', 'Create a Stripe Checkout session for the Team subscription.'),
      'utf8',
    );
    await writeAcceptance(root, 'billing.changed');
    await writeCurrentIndex(root);

    const result = await getProofReport({ root, sourceDir: 'src', gitBase: 'HEAD' });

    expect(result.report.outcomes[0]).toMatchObject({
      contractId: 'billing.changed',
      resolution: 'explicit_change',
      acceptance: { status: 'valid' },
    });
    expect(result.report.summary.contractChanges).toMatchObject({
      changed: 1,
      accepted: 1,
      unresolved: 0,
    });
  });

  it('reports unaccepted locked contract text changes as unresolved', async () => {
    const root = await createProofProject({
      'src/actions.ts': validFlowSource('billing.changed'),
    });
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('Create a Stripe Checkout session for the Pro subscription.', 'Create a Stripe Checkout session for the Team subscription.'),
      'utf8',
    );
    await writeCurrentIndex(root);

    const result = await getProofReport({ root, sourceDir: 'src', gitBase: 'HEAD' });

    expect(result.report.outcomes[0]).toMatchObject({
      contractId: 'billing.changed',
      resolution: 'unresolved',
      acceptance: { status: 'missing' },
    });
    expect(result.report.summary.currentViolations).toBe(0);
    expect(result.report.summary.contractChanges).toMatchObject({ unresolved: 1 });
    expect(result.report.diagnostics).toEqual([]);
  });

  it('reports current invariant diagnostics as unresolved without failing the proof call', async () => {
    const root = await createProofProject({
      'src/actions.ts': validFlowSource('billing.changed'),
    });
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace('priceId: price.priceId,', "priceId: 'price_hardcoded',"),
      'utf8',
    );

    const result = await getProofReport({ root, sourceDir: 'src', gitBase: 'HEAD' });

    expect(result.errors).toEqual([]);
    expect(result.report.outcomes[0]).toMatchObject({
      contractId: 'billing.changed',
      resolution: 'unresolved',
      acceptance: { status: 'not_required' },
    });
    expect(result.report.summary.currentViolations).toBe(1);
    expect(result.report.diagnostics[0]).toMatchObject({ code: 'DRIFT013_SSOT_FLOW_NOT_PROVEN' });
  });

  it('allows proof reports when the base commit has no Drift index', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource('billing.changed'),
    });
    await createGitBaseline(root);
    await writeCurrentIndex(root);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource('billing.changed').replace('return { payload, price: PRO_PRICE_ID };', 'return { payload, price: PRO_PRICE_ID, ok: true };'),
      'utf8',
    );

    const result = await getProofReport({ root, sourceDir: 'src', gitBase: 'HEAD' });

    expect(result.errors).toEqual([]);
    expect(result.report.outcomes[0]).toMatchObject({
      contractId: 'billing.changed',
      changeKind: 'added',
      resolution: 'explicit_change',
    });
  });

  it('reads base indexes larger than execFile default buffers without treating them as absent', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource('billing.changed'),
    });
    await writeLargeIndex(root);
    await createGitBaseline(root);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource('billing.changed').replace('return { payload, price: PRO_PRICE_ID };', 'return { payload, price: PRO_PRICE_ID, ok: true };'),
      'utf8',
    );

    const result = await getProofReport({ root, sourceDir: 'src', gitBase: 'HEAD' });

    expect(result.report.outcomes[0]).toMatchObject({
      contractId: 'billing.changed',
      changeKind: 'changed',
      resolution: 'preserved',
    });
    expect(result.report.summary.contractChanges).toMatchObject({ added: 0, changed: 1 });
  });

  it('rejects invalid base indexes instead of treating them as absent', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource('billing.changed'),
    });
    await mkdir(path.join(root, '.drift/contracts.generated.index'), { recursive: true });
    await writeFile(path.join(root, '.drift/contracts.generated.index/manifest.json'), '{ invalid json', 'utf8');
    await createGitBaseline(root);
    await writeCurrentIndex(root);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource('billing.changed').replace('return { payload, price: PRO_PRICE_ID };', 'return { payload, price: PRO_PRICE_ID, ok: true };'),
      'utf8',
    );

    await expect(getProofReport({ root, sourceDir: 'src', gitBase: 'HEAD' })).rejects.toThrow(
      'Invalid Drift contracts index at "HEAD:.drift/contracts.generated.index/manifest.json".',
    );
  });

  it('includes contracts impacted by changed SSOT files', async () => {
    const root = await createProofProject({
      'src/actions.ts': validFlowSource('billing.changed'),
      'src/features/billing/pricing.ts': 'export const BILLING_PRICES = { pro: { priceId: "price", monthlyAmount: 10, currency: "usd" } };\n',
    });
    await writeFile(
      path.join(root, 'src/features/billing/pricing.ts'),
      'export const BILLING_PRICES = { pro: { priceId: "price_v2", monthlyAmount: 20, currency: "usd" } };\n',
      'utf8',
    );

    const result = await getProofReport({ root, sourceDir: 'src', gitBase: 'HEAD' });

    expect(result.report.changedFiles).toEqual(['src/features/billing/pricing.ts']);
    expect(result.report.outcomes).toEqual([
      expect.objectContaining({
        contractId: 'billing.changed',
        resolution: 'preserved',
      }),
    ]);
  });

  it('formats stable Markdown and JSON proof output', async () => {
    const root = await createProofProject({
      'src/actions.ts': validActionsSource('billing.changed'),
    });
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource('billing.changed').replace('return { payload, price: PRO_PRICE_ID };', 'return { payload, price: PRO_PRICE_ID, ok: true };'),
      'utf8',
    );

    const result = await getProofReport({ root, sourceDir: 'src', gitBase: 'HEAD' });

    const markdown = formatProofReportMarkdown(result.report);
    expect(markdown).toContain([
      '## DriftLock Proof Report',
      '',
      'Protected contracts touched: 1',
      'Contract changes: 0 accepted, 0 unresolved',
      'Current violations: 0',
      'Intent preservation: 100%',
      'Generated index: dirty',
    ].join('\n'));
    expect(markdown).toContain('Generated index changes:\n- .drift/contracts.generated.index/');
    expect(markdown).toContain('- Generated DriftLock index is dirty; run drift-lock extract and commit the updated index.');
    expect(formatProofReportJson(result.report)).toMatchObject({
      version: 1,
      gitBase: 'HEAD',
      summary: {
        protectedContractsTouched: 1,
        currentViolations: 0,
        intentPreservationRate: 1,
      },
      generatedIndex: {
        status: 'dirty',
      },
    });
  });
});

async function createProofProject(files: Record<string, string>): Promise<string> {
  const root = await createProject(files);
  await writeCurrentIndex(root);
  await createGitBaseline(root);
  return root;
}

async function writeCurrentIndex(root: string): Promise<void> {
  const extracted = await extractContracts({ root, sourceDir: 'src' });
  await writeIndexStore(root, undefined, toIndex(extracted.contracts));
}

async function writeLargeIndex(root: string): Promise<void> {
  const extracted = await extractContracts({ root, sourceDir: 'src' });
  const index = toIndex(extracted.contracts);
  const template = index.contracts[0];
  if (!template) throw new Error('Expected a contract fixture.');
  const longIntent = 'Preserve synthetic baseline entries for large proof index coverage. '.repeat(20);

  for (let indexNumber = 0; indexNumber < 1_500; indexNumber += 1) {
    index.contracts.push({
      ...template,
      id: `synthetic.contract.${indexNumber.toString().padStart(4, '0')}`,
      intent: `${longIntent}${indexNumber}`,
      file: `src/synthetic/${indexNumber}.ts`,
      anchor: { type: 'file' },
      summaries: undefined,
    });
  }

  await writeIndexStore(root, undefined, index);
}

async function writeAcceptance(root: string, contractId: string): Promise<void> {
  await mkdir(path.join(root, '.drift', 'accepted-contract-changes'), { recursive: true });
  await writeFile(
    path.join(root, '.drift', 'accepted-contract-changes', `${contractId}.md`),
    `contract: ${contractId}\nreason: Intentional proof report contract change\n`,
    'utf8',
  );
}

async function snapshotIndexStore(root: string): Promise<Record<string, string>> {
  const indexRoot = path.join(root, '.drift/contracts.generated.index');
  const snapshot: Record<string, string> = {};

  async function walk(currentDir: string, relativeDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absoluteEntry = path.join(currentDir, entry.name);
      const relativeEntry = path.join(relativeDir, entry.name).split(path.sep).join('/');
      if (entry.isDirectory()) {
        await walk(absoluteEntry, relativeEntry);
      } else if (entry.isFile()) {
        snapshot[relativeEntry] = await readFile(absoluteEntry, 'utf8');
      }
    }
  }

  await walk(indexRoot, '');
  return snapshot;
}
