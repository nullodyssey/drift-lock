import { describe, expect, it } from 'vitest';
import { renderContext } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';
import { validActionsSource } from './helpers/contract-fixtures.js';
import { validFlowSource } from './helpers/flow-fixtures.js';

// Context is file-scoped and exact: it is derived from the requested file, never
// predicted from a task prompt. "The file's contracts" means both the contracts
// anchored on it and the contracts that declare it as a source of truth — editing an
// SSOT breaks the contract that depends on it, so both halves are necessary.
describe('drift context rendering', () => {
  it('renders the contracts anchored on a target file', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const result = await renderContext(root, 'src/actions.ts');

    expect(result.errors).toEqual([]);
    expect(result.output).toBe([
      'Relevant Drift Contracts',
      '',
      '- billing.create-checkout-session',
      '  scope: declaration',
      '  stability: locked',
      '  intent: Create a Stripe Checkout session for the Pro subscription.',
      '  ssot:',
      '    pricing: @/features/billing/pricing.ts',
      '    schema: @/features/billing/billing.schema.ts',
      '  must_not_change:',
      '    - pricing source',
      '    - accepted input shape',
      '    - checkout flow',
    ].join('\n'));
  });

  it('surfaces contracts anchored elsewhere that declare the file as their SSOT', async () => {
    const root = await createProject({
      'src/features/billing/actions.ts': validFlowSource('billing.create-checkout-session').replace(
        'pricing: "@/features/billing/pricing.ts"',
        'pricing: "./pricing.ts"',
      ),
      'src/features/billing/pricing.ts': 'export const BILLING_PRICES = {};\n',
    });

    // pricing.ts carries no contract of its own — but editing it can break the contract
    // in actions.ts that declares it as an SSOT. That contract must appear.
    const result = await renderContext(root, 'src/features/billing/pricing.ts');

    expect(result.errors).toEqual([]);
    expect(result.output).toContain('Contracts that declare src/features/billing/pricing.ts as a source of truth');
    expect(result.output).toContain('- billing.create-checkout-session');
    expect(result.output).toContain('  file: src/features/billing/actions.ts');
    expect(result.output).toContain('  depends on this file as: pricing');
    expect(result.output).toContain('  enforced invariants:');
    expect(result.output).toContain('checkout-price-from-pricing: drift/ssot-flow');
  });

  it('reports nothing for a file with no anchored and no impacted contracts', async () => {
    const root = await createProject({
      'src/actions.ts': validActionsSource(),
      'src/plain.ts': 'export const answer = 42;\n',
    });
    const result = await renderContext(root, 'src/plain.ts');

    expect(result.errors).toEqual([]);
    expect(result.output).toContain('No @drift contracts found for src/plain.ts.');
    expect(result.output).not.toContain('billing.create-checkout-session');
  });
});
