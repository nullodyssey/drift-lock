import { describe, expect, it } from 'vitest';
import { renderContext, renderTaskContext } from '@drift-lock/core';
import { createProject } from './helpers/core-test-utils.js';
import { schemaOnlySource, validActionsSource } from './helpers/contract-fixtures.js';
import { validFlowSource } from './helpers/flow-fixtures.js';

describe('drift context rendering', () => {
  it('renders context for a target file', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const result = await renderContext(root, 'src/actions.ts');

    expect(result.errors).toEqual([]);
    expect(result.output).toContain('Relevant Drift Contracts');
    expect(result.output).toContain('billing.create-checkout-session');
    expect(result.output).toContain('pricing: @/features/billing/pricing.ts');
  });

  it('renders pre-plan task context from relevant contracts', async () => {
    const root = await createProject({
      'src/actions.ts': validFlowSource('billing.create-checkout-session'),
      'src/other.ts': validActionsSource('support.unrelated-ticket')
        .replaceAll('billing', 'support')
        .replaceAll('pricing', 'queue')
        .replaceAll('Pricing', 'Queue')
        .replace('Create a Stripe Checkout session for the Pro subscription.', 'Send support ticket notifications.'),
    });
    const result = await renderTaskContext({ root, task: 'add yearly billing pricing plan' });

    expect(result.errors).toEqual([]);
    expect(result.output).toContain('Drift Context For Task');
    expect(result.output).toContain('Task:\nadd yearly billing pricing plan');
    expect(result.output).toContain('- billing.create-checkout-session');
    expect(result.output).toContain('  stability: locked');
    expect(result.output).toContain('  ssot:');
    expect(result.output).toContain('    pricing: @/features/billing/pricing.ts');
    expect(result.output).toContain('    - checkout-price-from-pricing: drift/ssot-flow ssot=pricing sinks=return.priceId, return.amount');
    expect(result.output).toContain('Relevant Files:');
    expect(result.output).toContain('- @/features/billing/pricing.ts');
    expect(result.output).toContain('- src/actions.ts');
    expect(result.output).not.toContain('support.unrelated-ticket');
    expect(result.output).toContain('Planning Notes:');
    expect(result.output).toContain('- Run drift-lock diff --summary after implementation.');
  });

  it('resolves relative ssot paths in task context relevant files', async () => {
    const root = await createProject({
      'src/features/billing/actions.ts': validFlowSource('billing.create-checkout-session').replace(
        'pricing: "@/features/billing/pricing.ts"',
        'pricing: "./pricing.ts"',
      ),
    });
    const result = await renderTaskContext({ root, task: 'change billing pricing' });

    expect(result.errors).toEqual([]);
    expect(result.output).toContain('    pricing: ./pricing.ts');
    expect(result.output).toContain('- src/features/billing/actions.ts');
    expect(result.output).toContain('- src/features/billing/pricing.ts');
    expect(result.output).not.toContain('- ./pricing.ts');
  });

  it('renders explicit empty task context when no contracts match', async () => {
    const root = await createProject({ 'src/actions.ts': validActionsSource() });
    const result = await renderTaskContext({ root, task: 'rename dashboard navigation labels' });

    expect(result.errors).toEqual([]);
    expect(result.output).toContain('No relevant @drift contracts found for this task.');
    expect(result.output).toContain('No relevant files found.');
    expect(result.output).toContain('Planning Notes:');
  });
});
