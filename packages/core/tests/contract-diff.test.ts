import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkContracts, diffContracts, extractContracts, formatContractDiffSummary, toIndex, writeIndex } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';
import { reorderActionInvariantBlocks, validActionsSource } from './helpers/contract-fixtures.js';
import { validFlowSource } from './helpers/flow-fixtures.js';

describe('drift contract diffs', () => {
  it('summarizes added changed and removed contracts against the Drift index', async () => {
    const root = await createProject({
      'src/changed.ts': validActionsSource('billing.changed'),
      'src/removed.ts': validActionsSource('billing.removed'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/changed.ts'),
      validActionsSource('billing.changed')
        .replace('the Pro subscription.', 'the Enterprise subscription.')
        .replace('pricing: "@/features/billing/pricing.ts"', 'pricing: "@/features/billing/pricing-v2.ts"'),
      'utf8',
    );
    await writeFile(path.join(root, 'src/removed.ts'), 'export const removed = true;\n', 'utf8');
    await writeFile(path.join(root, 'src/added.ts'), validActionsSource('billing.added'), 'utf8');

    const result = await diffContracts({ root });
    const summary = formatContractDiffSummary(result.diff);

    expect(result.errors).toEqual([]);
    expect(result.diff.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'billing.changed', kind: 'changed', fields: expect.arrayContaining(['intent', 'ssot']) }),
      expect.objectContaining({ id: 'billing.added', kind: 'added', fields: [] }),
      expect.objectContaining({ id: 'billing.removed', kind: 'removed', fields: [] }),
    ]));
    expect(summary).toContain('billing.changed (changed)');
    expect(summary).toContain('fields: intent, ssot');
  });

  it('summarizes invariant ssot and sink changes semantically', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource('billing.changed'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed')
        .replace('    ssot: pricing', '    ssot: schema')
        .replace(`      - return.priceId
      - return.amount
      - return.currency`, `      - return.currency
      - return.priceId
      - return.tax`),
      'utf8',
    );

    const result = await diffContracts({ root });
    const summary = formatContractDiffSummary(result.diff);

    expect(result.diff.changes).toEqual([
      expect.objectContaining({
        id: 'billing.changed',
        fields: expect.arrayContaining(['invariants']),
        invariantChanges: [
          expect.objectContaining({
            id: 'checkout-price-from-pricing',
            kind: 'changed',
            fields: ['ssot', 'sinks'],
            sinksAdded: ['return.tax'],
            sinksRemoved: ['return.amount'],
          }),
        ],
      }),
    ]);
    expect(summary).toContain('  invariants:');
    expect(summary).toContain('    ~ checkout-price-from-pricing');
    expect(summary).toContain('      ssot: pricing -> schema');
    expect(summary).toContain('      sinks added:');
    expect(summary).toContain('        + return.tax');
    expect(summary).toContain('      sinks removed:');
    expect(summary).toContain('        - return.amount');
    expect(summary).toBe([
      'Drift contract changes:',
      '- billing.changed (changed)',
      '  file: src/actions.ts',
      '  stability: locked',
      '  fields: invariants, summaries',
      '  invariants:',
      '    ~ checkout-price-from-pricing',
      '      enforce: drift/ssot-flow',
      '      ssot: pricing -> schema',
      '      sinks added:',
      '        + return.tax',
      '      sinks removed:',
      '        - return.amount',
    ].join('\n'));
  });

  it('summarizes added and removed invariants semantically', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource('billing.changed'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource('billing.changed')
        .replace(`  - id: validates-input
    enforce: drift/ssot-usage
    ssot: schema
`, `  - id: validates-output
    enforce: drift/ssot-usage
    ssot: pricing
`),
      'utf8',
    );

    const result = await diffContracts({ root });
    const summary = formatContractDiffSummary(result.diff);

    expect(result.diff.changes[0]).toMatchObject({
      invariantChanges: [
        { id: 'validates-output', kind: 'added', enforce: 'drift/ssot-usage' },
        { id: 'validates-input', kind: 'removed', enforce: 'drift/ssot-usage' },
      ],
    });
    expect(summary).toContain('    + validates-output');
    expect(summary).toContain('      ssot: pricing');
    expect(summary).toContain('    - validates-input');
    expect(summary).toContain('      ssot: schema');
  });

  it('does not report invariant changes when sinks are reordered', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource('billing.changed'),
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validFlowSource('billing.changed').replace(`      - return.priceId
      - return.amount
      - return.currency`, `      - return.currency
      - return.amount
      - return.priceId`),
      'utf8',
    );

    const result = await diffContracts({ root });

    expect(result.diff.changes[0]).toMatchObject({
      id: 'billing.changed',
      fields: [],
    });
    expect(result.diff.changes[0]?.invariantChanges).toBeUndefined();
  });

  it('reports invariant block reorders explicitly', async () => {
    const baselineSource = validActionsSource('billing.changed');
    const reorderedSource = reorderActionInvariantBlocks(baselineSource);
    expect(reorderedSource).not.toBe(baselineSource);

    const root = await createProject({
      'src/actions.ts': baselineSource,
    });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(path.join(root, 'src/actions.ts'), reorderedSource, 'utf8');

    const result = await diffContracts({ root });
    const summary = formatContractDiffSummary(result.diff);

    expect(result.diff.changes[0]).toMatchObject({
      id: 'billing.changed',
      fields: ['invariants'],
      invariantChanges: [
        {
          id: '__order__',
          kind: 'reordered',
          previousOrder: ['uses-pricing-ssot', 'validates-input'],
          currentOrder: ['validates-input', 'uses-pricing-ssot'],
        },
      ],
    });
    expect(summary).toContain('    ~ invariant order changed');
    expect(summary).toContain('      previous: uses-pricing-ssot, validates-input');
    expect(summary).toContain('      current: validates-input, uses-pricing-ssot');
  });

  it('does not report semantic no-op diffs when ssot keys are reordered', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const extracted = await extractContracts({ root });
    await writeIndex(root, undefined, toIndex(extracted.contracts));
    await writeFile(
      path.join(root, 'src/actions.ts'),
      validActionsSource().replace(
        `ssot:
  pricing: "@/features/billing/pricing.ts"
  schema: "@/features/billing/billing.schema.ts"`,
        `ssot:
  schema: "@/features/billing/billing.schema.ts"
  pricing: "@/features/billing/pricing.ts"`,
      ),
      'utf8',
    );

    const diff = await diffContracts({ root });
    const changedOnly = await checkContracts({ root, changedOnly: true });

    expect(diff.diff.changes).toEqual([]);
    expect(formatContractDiffSummary(diff.diff)).toBe('No Drift contract changes found.');
    expect(changedOnly.errors).toEqual([]);
  });

  it('treats contracts from legacy indexes without bodyHash as changed', async () => {
    const root = await createProject({ 'src/actions.ts': validFlowSource() });
    const extracted = await extractContracts({ root });
    const index = toIndex(extracted.contracts);
    await writeIndex(root, undefined, {
      ...index,
      contracts: index.contracts.map((contract) => {
        const legacy = { ...contract } as Record<string, unknown>;
        delete legacy.bodyHash;
        return legacy as (typeof index.contracts)[number];
      }),
    });

    const result = await diffContracts({ root });

    expect(result.diff.changes).toEqual([
      expect.objectContaining({ id: 'billing.create-checkout-session', fields: ['body'] }),
    ]);
  });
});
