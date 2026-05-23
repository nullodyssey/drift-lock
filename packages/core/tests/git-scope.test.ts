import { unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkContracts, diffContracts, extractContracts, toIndex, writeIndex } from '@drift-lock/core';
import { createGitBaseline, createProject, execFileAsync } from './helpers/core-test-utils.js';
import { schemaOnlySource, validActionsSource } from './helpers/contract-fixtures.js';
import { validFlowSource } from './helpers/flow-fixtures.js';

describe('drift git scope', () => {
  it('limits contract diffs to files changed since a Git base', async () => {
    const root = await createProject({
      'src/changed.ts': validActionsSource('billing.changed'),
      'src/unchanged.ts': validActionsSource('billing.unchanged'),
      'src/removed.ts': validActionsSource('billing.removed'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);

    await writeFile(
      path.join(root, 'src/changed.ts'),
      validActionsSource('billing.changed').replace('the Pro subscription.', 'the Team subscription.'),
      'utf8',
    );
    await unlink(path.join(root, 'src/removed.ts'));

    const diff = await diffContracts({ root, gitBase: 'HEAD' });

    expect(diff.diff.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'billing.changed', kind: 'changed', fields: ['intent'] }),
      expect.objectContaining({ id: 'billing.removed', kind: 'removed' }),
    ]));
    expect(diff.diff.changes.some((change) => change.id === 'billing.unchanged')).toBe(false);
  });

  it('checks Git-scoped SSOT impacts and ignores unrelated pre-existing drift', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource().replace('priceId: price.priceId,', "priceId: 'price_hardcoded',"),
      'src/unchanged.ts': schemaOnlySource('billing.unchanged').replace(
        "import { billingSchema } from '@/features/billing/billing.schema';\n",
        '',
      ),
      'src/features/billing/pricing.ts': 'export const BILLING_PRICES = { pro: { priceId: "price", monthlyAmount: 10, currency: "usd" } };\n',
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);
    await writeFile(
      path.join(root, 'src/features/billing/pricing.ts'),
      'export const BILLING_PRICES = { pro: { priceId: "price_v2", monthlyAmount: 20, currency: "usd" } };\n',
      'utf8',
    );

    const result = await checkContracts({ root, changedOnly: true, gitBase: 'HEAD' });

    expect(result.contracts.map((contract) => contract.id)).toEqual(['billing.create-checkout-session']);
    expect(result.errors.map((error) => error.code)).toContain('DRIFT013_SSOT_FLOW_NOT_PROVEN');
    expect(result.errors.some((error) => error.contractId === 'billing.unchanged')).toBe(false);
  });

  it('uses unchanged helper summaries during Git-scoped changed-only checks', async () => {
    const root = await createProject({
      'src/actions.ts': helperCallSiteSource('Create a Stripe Checkout session from a helper-provided pricing summary.'),
      'src/pricing.ts': verifiedHelperSource(),
      'src/pricing-source.ts': `export const BILLING_PRICES = {
  pro: { priceId: 'price_pro', monthlyAmount: 1000 },
};
`,
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      helperCallSiteSource('Create a Stripe Checkout session from a helper-provided pricing summary.')
        .replace('  return {', '  const seats = input.seats;\n  return {')
        .replace('price.monthlyAmount * input.seats', 'price.monthlyAmount * seats'),
      'utf8',
    );

    const result = await checkContracts({ root, changedOnly: true, gitBase: 'HEAD' });

    expect(result.contracts.map((contract) => contract.id)).toEqual(['billing.create-checkout-session']);
    expect(result.errors).toEqual([]);
  });

  it('rejects duplicate ids introduced outside the Git scope', async () => {
    const root = await createProject({
      'src/existing.ts': validActionsSource('billing.duplicate'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);
    await writeFile(path.join(root, 'src/new.ts'), validActionsSource('billing.duplicate'), 'utf8');
    await execFileAsync('git', ['add', 'src/new.ts'], { cwd: root });

    const result = await checkContracts({ root, changedOnly: true, gitBase: 'HEAD' });

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'DRIFT005_DUPLICATE_CONTRACT_ID',
        contractId: 'billing.duplicate',
        file: 'src/new.ts',
      }),
    ]);
  });

  it('does not report a Git-scoped duplicate for the same indexed file', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource('billing.same-file'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await createGitBaseline(root);
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource('billing.same-file').replace('the Pro subscription.', 'the Team subscription.'),
      'utf8',
    );

    const result = await checkContracts({ root, changedOnly: true, gitBase: 'HEAD' });

    expect(result.errors.some((error) => error.code === 'DRIFT005_DUPLICATE_CONTRACT_ID')).toBe(false);
  });
});

function helperCallSiteSource(intent: string): string {
  return `import { resolvePrice } from './pricing';

/* @drift
version: 1
id: billing.create-checkout-session
scope: declaration
stability: locked

intent: >
  ${intent}

ssot:
  pricing: "./pricing-source.ts"

invariants:
  - id: checkout-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
      - return.amount
*/
export function createCheckoutSession(input: { plan: 'pro'; seats: number }) {
  const price = resolvePrice(input.plan);
  return {
    priceId: price.priceId,
    amount: price.monthlyAmount * input.seats,
  };
}
`;
}

function verifiedHelperSource(): string {
  return `import { BILLING_PRICES } from './pricing-source';

/* @drift
version: 1
id: billing.resolve-price
scope: declaration
stability: locked

intent: >
  Resolve the selected billing price from the pricing source of truth.

ssot:
  pricing: "./pricing-source.ts"

invariants:
  - id: return-price-from-pricing
    enforce: drift/ssot-flow
    ssot: pricing
    sinks:
      - return.priceId
      - return.monthlyAmount
*/
export function resolvePrice(plan: 'pro') {
  const price = BILLING_PRICES[plan];
  return {
    priceId: price.priceId,
    monthlyAmount: price.monthlyAmount,
  };
}
`;
}
