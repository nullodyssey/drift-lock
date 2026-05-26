import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractContracts,
  formatProofReportJson,
  formatProofReportMarkdown,
  getProofReport,
  toIndex,
  writeIndex,
} from '@drift-lock/core';
import { createGitBaseline, createProject } from './helpers/core-test-utils.js';
import { validActionsSource } from './helpers/contract-fixtures.js';
import { validFlowSource } from './helpers/flow-fixtures.js';

describe('drift pull request proof reports', () => {
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

    expect(formatProofReportMarkdown(result.report)).toBe([
      '## DriftLock Proof Report',
      '',
      'Protected contracts touched: 1',
      'Contract changes: 0 accepted, 0 unresolved',
      'Current violations: 0',
      'Intent preservation: 100%',
      '',
      'Outcome:',
      '- 1 protected zone preserved.',
      '- 0 contract changes explicit.',
      '- 0 unresolved drift before merge.',
      '',
      'Touched contracts:',
      '- billing.changed: preserved',
      '',
      'Impact:',
      '- No unresolved drift detected in final PR state.',
      '- Protected intent remained explicit for touched contracts.',
    ].join('\n'));
    expect(formatProofReportJson(result.report)).toMatchObject({
      version: 1,
      gitBase: 'HEAD',
      summary: {
        protectedContractsTouched: 1,
        currentViolations: 0,
        intentPreservationRate: 1,
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
  await writeIndex(root, undefined, toIndex(extracted.contracts));
}

async function writeAcceptance(root: string, contractId: string): Promise<void> {
  await mkdir(path.join(root, '.drift', 'accepted-contract-changes'), { recursive: true });
  await writeFile(
    path.join(root, '.drift', 'accepted-contract-changes', `${contractId}.md`),
    `contract: ${contractId}\nreason: Intentional proof report contract change\n`,
    'utf8',
  );
}
